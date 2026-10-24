import { useEffect, useState } from 'react'
import { Controller, useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router'
import { TagInput } from '../../components/tags'
import { Button } from '../../components/ui/Button'
import { Checkbox, Field, Select, TextArea, TextInput } from '../../components/ui/Field'
import { ErrorState, PageHeader, PageLoader } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { createOpportunity, fetchOpportunity, updateOpportunity } from '../../services/opportunities'
import type { Opportunity, OpportunityInput, OpportunityMode } from '../../types/api'
import { INTEREST_SUGGESTIONS, OPPORTUNITY_MODE_OPTIONS, SKILL_SUGGESTIONS } from '../../utils/constants'
import { fromDateTimeLocal, toDateTimeLocal } from '../../utils/format'
import { applyServerErrors } from '../../utils/forms'

export const opportunitySchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(140),
    summary: z.string().trim().min(10, 'Write at least 10 characters.').max(300),
    description: z.string().trim().max(5000),
    organizer: z.string().trim().max(120),
    url: z.string().trim().max(300).refine((v) => !v || /^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(v), 'Enter a valid link.'),
    skills: z.array(z.string()).max(15),
    tags: z.array(z.string()).max(10),
    mode: z.string(),
    location: z.string().trim().max(120),
    starts_at: z.string(),
    ends_at: z.string(),
    deadline: z.string(),
    accepts_applications: z.boolean(),
  })
  .refine((v) => !v.starts_at || !v.ends_at || new Date(v.ends_at) >= new Date(v.starts_at), {
    message: 'The end must be after the start.',
    path: ['ends_at'],
  })
export type OpportunityValues = z.infer<typeof opportunitySchema>

export const EMPTY_OPPORTUNITY: OpportunityValues = {
  title: '', summary: '', description: '', organizer: '', url: '', skills: [], tags: [], mode: '', location: '',
  starts_at: '', ends_at: '', deadline: '', accepts_applications: true,
}

export function opportunityToValues(opportunity: Opportunity): OpportunityValues {
  return {
    title: opportunity.title,
    summary: opportunity.summary,
    description: opportunity.description,
    organizer: opportunity.organizer,
    url: opportunity.url ?? '',
    skills: opportunity.skills,
    tags: opportunity.tags,
    mode: opportunity.mode ?? '',
    location: opportunity.location,
    starts_at: toDateTimeLocal(opportunity.starts_at),
    ends_at: toDateTimeLocal(opportunity.ends_at),
    deadline: toDateTimeLocal(opportunity.deadline),
    accepts_applications: opportunity.accepts_applications,
  }
}

export function valuesToInput(values: OpportunityValues): OpportunityInput {
  return {
    ...values,
    url: values.url || null,
    mode: (values.mode || null) as OpportunityMode | null,
    starts_at: fromDateTimeLocal(values.starts_at),
    ends_at: fromDateTimeLocal(values.ends_at),
    deadline: fromDateTimeLocal(values.deadline),
  }
}

/** Shared fields for member research posts and admin-curated listings. */
export function OpportunityFields({ form, showApplications = true }: {
  form: UseFormReturn<OpportunityValues>
  showApplications?: boolean
}) {
  const { register, control, watch, formState: { errors } } = form
  const summary = watch('summary') ?? ''
  return (
    <>
      <Field label="Title" required error={errors.title?.message}>
        <TextInput maxLength={140} {...register('title')} />
      </Field>
      <Field label="Summary" required error={errors.summary?.message} hint={`${summary.length}/300 · Shown on cards`}>
        <TextArea rows={2} maxLength={300} {...register('summary')} />
      </Field>
      <Field label="Details" optional error={errors.description?.message}>
        <TextArea rows={6} maxLength={5000} {...register('description')} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Organizer or lab" optional error={errors.organizer?.message}>
          <TextInput maxLength={120} {...register('organizer')} />
        </Field>
        <Field label="Link" optional error={errors.url?.message} hint="An official page for the opportunity, if one exists.">
          <TextInput type="url" inputMode="url" placeholder="https://" {...register('url')} />
        </Field>
      </div>
      <Field label="Relevant skills" optional>
        <Controller control={control} name="skills" render={({ field }) => (
          <TagInput label="Relevant skills" value={field.value} onChange={field.onChange} suggestions={SKILL_SUGGESTIONS} max={15} />
        )} />
      </Field>
      <Field label="Tags" optional>
        <Controller control={control} name="tags" render={({ field }) => (
          <TagInput label="Tags" value={field.value} onChange={field.onChange} suggestions={INTEREST_SUGGESTIONS} max={10} />
        )} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Format" optional>
          <Select options={OPPORTUNITY_MODE_OPTIONS} placeholder="Not specified" {...register('mode')} />
        </Field>
        <Field label="Location" optional error={errors.location?.message}>
          <TextInput maxLength={120} placeholder="City, campus or “Online”" {...register('location')} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Starts" optional error={errors.starts_at?.message}>
          <TextInput type="datetime-local" {...register('starts_at')} />
        </Field>
        <Field label="Ends" optional error={errors.ends_at?.message}>
          <TextInput type="datetime-local" {...register('ends_at')} />
        </Field>
        <Field label="Application deadline" optional error={errors.deadline?.message}>
          <TextInput type="datetime-local" {...register('deadline')} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-subtle">Times use your device's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
      {showApplications && (
        <Checkbox label="Accept applications through HackMate"
          description="Members can apply with a message. You'll review applications and accept or decline them."
          {...register('accepts_applications')} />
      )}
    </>
  )
}

export default function PostOpportunityPage() {
  const { opportunityId } = useParams()
  const editing = Boolean(opportunityId)
  useDocumentTitle(editing ? 'Edit research post' : 'Post a research collaboration')
  const navigate = useNavigate()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const existing = useApi((signal) => fetchOpportunity(opportunityId!, signal), [opportunityId], { enabled: editing })
  const form = useForm<OpportunityValues>({ resolver: zodResolver(opportunitySchema), defaultValues: EMPTY_OPPORTUNITY })

  useEffect(() => {
    if (existing.data) form.reset(opportunityToValues(existing.data))
  }, [existing.data, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const saved = editing ? await updateOpportunity(opportunityId!, valuesToInput(values)) : await createOpportunity(valuesToInput(values))
      toast.success(editing ? 'Post updated.' : 'Research collaboration posted.')
      navigate(`/opportunities/${saved.id}`, { replace: true })
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, {}, Object.keys(EMPTY_OPPORTUNITY)))
    }
  })

  if (editing && existing.loading && !existing.data) return <PageLoader />
  if (editing && existing.error) return <PageContainer><ErrorState message={existing.error.message} onRetry={existing.reload} /></PageContainer>
  if (editing && existing.data && !existing.data.viewer?.is_owner) {
    return <PageContainer><ErrorState title="You can't edit this post" message="Only the member who posted it can edit it." /></PageContainer>
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={editing ? 'Edit research post' : 'Post a research collaboration'}
        description="Looking for co-authors, annotators, lab partners or a study group? Describe the opportunity and let members apply."
      />
      <form onSubmit={onSubmit} noValidate className="card space-y-5 p-6">
        {formError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{formError}</p>}
        <OpportunityFields form={form} />
        <div className="flex justify-end gap-3 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => navigate(-1)} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>{editing ? 'Save changes' : 'Publish post'}</Button>
        </div>
      </form>
    </PageContainer>
  )
}
