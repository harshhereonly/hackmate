import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSearchParams } from 'react-router'
import { Camera, Eye, Trash } from 'lucide-react'
import { ChipFilter, TagInput } from '../../components/tags'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Checkbox, Field, RadioCardGroup, Select, TextArea, TextInput } from '../../components/ui/Field'
import { Avatar, ErrorState, Notice, PageHeader, PageLoader } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage } from '../../services/api'
import { deleteAvatar, fetchMyProfile, updateMyProfile, uploadAvatar } from '../../services/profiles'
import type { Availability, CollaborationMode, ExperienceLevel, MessagePermission, ProfileMe, Role, Visibility } from '../../types/api'
import {
  AVAILABILITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  INTEREST_SUGGESTIONS,
  MESSAGE_PERMISSION_OPTIONS,
  MODE_OPTIONS,
  ROLE_OPTIONS,
  SKILL_SUGGESTIONS,
  VISIBILITY_OPTIONS,
} from '../../utils/constants'
import { applyServerErrors } from '../../utils/forms'
import { useAuth } from '../auth/AuthContext'

const optionalUrl = z
  .string()
  .trim()
  .max(300, 'Links must be 300 characters or fewer.')
  .refine((value) => !value || /^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(value), 'Enter a valid link, e.g. https://example.com')

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(80),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/, '3–30 characters: lowercase letters, numbers and hyphens.')
    .refine((value) => !value.includes('--'), 'Use single hyphens only.'),
  headline: z.string().trim().max(100, 'Keep the headline under 100 characters.'),
  bio: z.string().trim().max(1000, 'Bio must be 1000 characters or fewer.'),
  institution: z.string().trim().max(120),
  background: z.string().trim().max(120),
  skills: z.array(z.string()).max(30, 'Up to 30 skills.'),
  interests: z.array(z.string()).max(20, 'Up to 20 interests.'),
  experience_level: z.string(),
  preferred_roles: z.array(z.string()).max(5, 'Choose up to 5 roles.'),
  availability: z.string(),
  collaboration_mode: z.string(),
  github_url: optionalUrl.refine((v) => !v || /github\.com/i.test(v), 'Must be a github.com link.'),
  portfolio_url: optionalUrl,
  linkedin_url: optionalUrl.refine((v) => !v || /linkedin\.com/i.test(v), 'Must be a linkedin.com link.'),
  visibility: z.enum(['public', 'members', 'hidden']),
  allow_messages: z.enum(['everyone', 'teammates']),
  open_to_collaborate: z.boolean(),
})
type ProfileValues = z.infer<typeof profileSchema>

function toFormValues(profile: ProfileMe): ProfileValues {
  return {
    name: profile.name,
    handle: profile.handle,
    headline: profile.headline ?? '',
    bio: profile.bio ?? '',
    institution: profile.institution ?? '',
    background: profile.background ?? '',
    skills: profile.skills,
    interests: profile.interests,
    experience_level: profile.experience_level ?? '',
    preferred_roles: profile.preferred_roles,
    availability: profile.availability ?? '',
    collaboration_mode: profile.collaboration_mode ?? '',
    github_url: profile.github_url ?? '',
    portfolio_url: profile.portfolio_url ?? '',
    linkedin_url: profile.linkedin_url ?? '',
    visibility: profile.visibility,
    allow_messages: profile.allow_messages,
    open_to_collaborate: profile.open_to_collaborate,
  }
}

const FIELD_NAMES = Object.keys(profileSchema.shape)

function AvatarEditor({ profile, onChange }: { profile: ProfileMe; onChange: (profile: ProfileMe) => void }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 3_000_000) {
      toast.error('Images must be 3 MB or smaller.')
      return
    }
    setBusy(true)
    try {
      onChange(await uploadAvatar(file))
      toast.success('Profile photo updated.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={profile.name} src={profile.avatar_url} size="xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" loading={busy} icon={<Camera className="size-4" aria-hidden="true" />} onClick={() => input.current?.click()}>
            {profile.avatar_url ? 'Change photo' : 'Upload photo'}
          </Button>
          {profile.avatar_url && (
            <Button variant="ghost" size="sm" disabled={busy} icon={<Trash className="size-4" aria-hidden="true" />}
              onClick={async () => {
                setBusy(true)
                try {
                  onChange(await deleteAvatar())
                } catch (error) {
                  toast.error(getErrorMessage(error))
                } finally {
                  setBusy(false)
                }
              }}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-subtle">PNG, JPEG, WebP or GIF up to 3 MB. Photos are resized to 256×256 and stripped of metadata (including location).</p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(event) => upload(event.target.files?.[0])} />
      </div>
    </div>
  )
}

export default function EditProfilePage() {
  useDocumentTitle('Edit profile')
  const [params] = useSearchParams()
  const toast = useToast()
  const { user, setUser } = useAuth()
  const { data: profile, loading, error, reload, setData } = useApi((signal) => fetchMyProfile(signal), [])
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) })
  const { register, handleSubmit, control, reset, setError, watch, formState: { errors, isSubmitting, isDirty } } = form

  useEffect(() => {
    if (profile) reset(toFormValues(profile))
  }, [profile, reset])

  const syncAuth = (next: ProfileMe) => {
    if (user) setUser({ ...user, profile: { handle: next.handle, name: next.name, avatar_url: next.avatar_url } })
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const updated = await updateMyProfile({
        ...values,
        experience_level: (values.experience_level || null) as ExperienceLevel | null,
        availability: (values.availability || null) as Availability | null,
        collaboration_mode: (values.collaboration_mode || null) as CollaborationMode | null,
        preferred_roles: values.preferred_roles as Role[],
        github_url: values.github_url || null,
        portfolio_url: values.portfolio_url || null,
        linkedin_url: values.linkedin_url || null,
      })
      setData(updated)
      syncAuth(updated)
      toast.success('Profile saved.')
    } catch (err) {
      setFormError(applyServerErrors(err, setError, {}, FIELD_NAMES))
    }
  })

  if (loading && !profile) return <PageLoader label="Loading your profile" />
  if (error) return <PageContainer><ErrorState message={error.message} onRetry={reload} /></PageContainer>
  if (!profile) return null

  const bio = watch('bio') ?? ''

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Edit your profile"
        description="A complete profile gets better, better-explained teammate suggestions."
        actions={<ButtonLink to={`/people/${profile.handle}`} variant="ghost" icon={<Eye className="size-4" aria-hidden="true" />}>View public profile</ButtonLink>}
      />
      {params.get('welcome') && (
        <Notice tone="success" title="Your account is ready" className="mb-6">
          Add your skills, interests and preferred roles so HackMate can suggest complementary teammates.
        </Notice>
      )}

      <div className="card mb-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-fg">Profile completeness</p>
          <p className="text-sm font-semibold text-brand-200">{profile.completeness.percent}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={profile.completeness.percent} aria-label="Profile completeness">
          <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${profile.completeness.percent}%` }} />
        </div>
        {profile.completeness.missing.length > 0 && (
          <p className="mt-2 text-xs text-subtle">Still missing: {profile.completeness.missing.join(', ')}</p>
        )}
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {formError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{formError}</p>}

        <section className="card space-y-5 p-6" aria-labelledby="basics-heading">
          <h2 id="basics-heading" className="text-lg font-semibold">Basics</h2>
          <AvatarEditor profile={profile} onChange={(next) => { setData(next); syncAuth(next) }} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" required error={errors.name?.message}>
              <TextInput autoComplete="name" {...register('name')} />
            </Field>
            <Field label="Username" required error={errors.handle?.message} hint="Unique. Others can search for you by @username; your profile lives at /people/your-username.">
              <TextInput autoComplete="off" spellCheck={false} {...register('handle')} />
            </Field>
          </div>
          <Field label="Headline" optional error={errors.headline?.message} hint="One line about what you do, e.g. “Backend developer into climate tech”.">
            <TextInput maxLength={100} {...register('headline')} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="College or university" optional error={errors.institution?.message}>
              <TextInput maxLength={120} {...register('institution')} />
            </Field>
            <Field label="Course or professional background" optional error={errors.background?.message}>
              <TextInput maxLength={120} placeholder="e.g. BSc Computer Science" {...register('background')} />
            </Field>
          </div>
          <Field label="Bio" optional error={errors.bio?.message} hint={`${bio.length}/1000`}>
            <TextArea rows={5} maxLength={1000} placeholder="What do you like to build? What are you looking for in a team?" {...register('bio')} />
          </Field>
        </section>

        <section className="card space-y-5 p-6" aria-labelledby="skills-heading">
          <h2 id="skills-heading" className="text-lg font-semibold">Skills and interests</h2>
          <Field label="Skills" error={errors.skills?.message} hint="Press Enter or comma to add. Common spellings like “ReactJS” are matched automatically.">
            <Controller control={control} name="skills" render={({ field }) => (
              <TagInput label="Skills" value={field.value ?? []} onChange={field.onChange} suggestions={SKILL_SUGGESTIONS} max={30} placeholder="e.g. React, Python, Figma" invalid={Boolean(errors.skills)} />
            )} />
          </Field>
          <Field label="Interests" error={errors.interests?.message}>
            <Controller control={control} name="interests" render={({ field }) => (
              <TagInput label="Interests" value={field.value ?? []} onChange={field.onChange} suggestions={INTEREST_SUGGESTIONS} max={20} placeholder="e.g. Climate, EdTech" />
            )} />
          </Field>
          <Controller control={control} name="preferred_roles" render={({ field }) => (
            <div>
              <ChipFilter label="Preferred roles (up to 5)" options={ROLE_OPTIONS} value={field.value ?? []}
                onChange={(roles) => field.onChange(roles.slice(0, 5))} />
              {errors.preferred_roles && <p role="alert" className="mt-1 text-xs text-danger">{errors.preferred_roles.message}</p>}
            </div>
          )} />
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Experience level" optional>
              <Select options={EXPERIENCE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.hint})` }))} placeholder="Not specified" {...register('experience_level')} />
            </Field>
            <Field label="Availability" optional>
              <Select options={AVAILABILITY_OPTIONS} placeholder="Not specified" {...register('availability')} />
            </Field>
            <Field label="Collaboration mode" optional>
              <Select options={MODE_OPTIONS} placeholder="Not specified" {...register('collaboration_mode')} />
            </Field>
          </div>
        </section>

        <section className="card space-y-5 p-6" aria-labelledby="links-heading">
          <h2 id="links-heading" className="text-lg font-semibold">Links</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="GitHub" optional error={errors.github_url?.message}>
              <TextInput type="url" inputMode="url" placeholder="https://github.com/you" {...register('github_url')} />
            </Field>
            <Field label="Portfolio" optional error={errors.portfolio_url?.message}>
              <TextInput type="url" inputMode="url" placeholder="https://your.site" {...register('portfolio_url')} />
            </Field>
            <Field label="LinkedIn" optional error={errors.linkedin_url?.message}>
              <TextInput type="url" inputMode="url" placeholder="https://linkedin.com/in/you" {...register('linkedin_url')} />
            </Field>
          </div>
        </section>

        <section className="card space-y-5 p-6" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="text-lg font-semibold">Privacy</h2>
          <Controller control={control} name="visibility" render={({ field }) => (
            <RadioCardGroup<Visibility> name="visibility" legend="Who can see your profile" value={field.value} onChange={field.onChange} options={VISIBILITY_OPTIONS} />
          )} />
          <Field label="Who can start a conversation with you">
            <Select options={MESSAGE_PERMISSION_OPTIONS as { value: MessagePermission; label: string }[]} {...register('allow_messages')} />
          </Field>
          <Checkbox label="I'm open to new collaborations" description="When off, you won't appear in suggestions and can't be invited to projects." {...register('open_to_collaborate')} />
          <p className="text-xs text-subtle">Your email address is never shown to other members.</p>
        </section>

        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-bg/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          {isDirty && <p className="mr-auto text-sm text-subtle">You have unsaved changes.</p>}
          <Button type="button" variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => reset(toFormValues(profile))}>Discard</Button>
          <Button type="submit" loading={isSubmitting}>Save profile</Button>
        </div>
      </form>
    </PageContainer>
  )
}
