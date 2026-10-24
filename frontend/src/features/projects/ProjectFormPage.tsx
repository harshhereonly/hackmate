import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ChipFilter, TagInput } from '../../components/tags'
import { Button } from '../../components/ui/Button'
import { Field, RadioCardGroup, Select, TextArea, TextInput } from '../../components/ui/Field'
import { ErrorState, Notice, PageHeader, PageLoader } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { fetchOpportunity } from '../../services/opportunities'
import { createProject, fetchProject, updateProject } from '../../services/projects'
import type { ProjectCategory, ProjectDetail, ProjectInput, ProjectStatus, CollaborationMode, PreferredExperience, Role } from '../../types/api'
import {
  MODE_OPTIONS,
  PREFERRED_EXPERIENCE_OPTIONS,
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  ROLE_OPTIONS,
  SKILL_SUGGESTIONS,
} from '../../utils/constants'
import { applyServerErrors } from '../../utils/forms'

const projectSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(100, 'Keep the title under 100 characters.'),
  summary: z.string().trim().min(10, 'Write at least 10 characters.').max(200, 'Keep the summary under 200 characters.'),
  description: z.string().trim().min(20, 'Describe the project in at least 20 characters.').max(5000),
  required_skills: z.array(z.string()).min(1, 'Add at least one required skill.').max(20, 'Up to 20 skills.'),
  roles_needed: z.array(z.string()).max(5, 'Choose up to 5 roles.'),
  preferred_experience: z.string(),
  max_team_size: z.number({ error: 'Enter a team size.' }).int('Use a whole number.').min(2, 'Teams need at least 2 people.').max(20, 'Maximum team size is 20.'),
  status: z.enum(['recruiting', 'active', 'completed']),
  category: z.string().min(1, 'Choose a category.'),
  collaboration_mode: z.string().min(1, 'Choose a collaboration mode.'),
  repo_url: z.string().trim().max(300).refine((v) => !v || /^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(v), 'Enter a valid link.'),
})
type ProjectValues = z.infer<typeof projectSchema>

const EMPTY: ProjectValues = {
  title: '', summary: '', description: '', required_skills: [], roles_needed: [], preferred_experience: 'any',
  max_team_size: 4, status: 'recruiting', category: '', collaboration_mode: '', repo_url: '',
}

function toValues(project: ProjectDetail): ProjectValues {
  return {
    title: project.title,
    summary: project.summary,
    description: project.description,
    required_skills: project.required_skills,
    roles_needed: project.roles_needed,
    preferred_experience: project.preferred_experience,
    max_team_size: project.max_team_size,
    status: project.status,
    category: project.category,
    collaboration_mode: project.collaboration_mode,
    repo_url: project.repo_url ?? '',
  }
}

export default function ProjectFormPage() {
  const { projectId } = useParams()
  const editing = Boolean(projectId)
  useDocumentTitle(editing ? 'Edit project' : 'Post a project')
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const opportunityId = params.get('opportunity')
  const [formError, setFormError] = useState<string | null>(null)

  const existing = useApi((signal) => fetchProject(projectId!, signal), [projectId], { enabled: editing })
  const linked = useApi((signal) => fetchOpportunity(opportunityId!, signal), [opportunityId], { enabled: Boolean(opportunityId) && !editing })

  const { register, handleSubmit, control, reset, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (existing.data) reset(toValues(existing.data))
  }, [existing.data, reset])

  // Starting a team from an opportunity pre-fills sensible defaults.
  useEffect(() => {
    if (!linked.data) return
    setValue('category', linked.data.type === 'research' ? 'research' : linked.data.type === 'hackathon' ? 'hackathon' : 'open_source')
    if (linked.data.skills.length) setValue('required_skills', linked.data.skills.slice(0, 10))
    if (linked.data.mode) setValue('collaboration_mode', linked.data.mode === 'online' ? 'remote' : linked.data.mode)
  }, [linked.data, setValue])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    const payload: ProjectInput = {
      ...values,
      roles_needed: values.roles_needed as Role[],
      preferred_experience: values.preferred_experience as PreferredExperience,
      status: values.status as ProjectStatus,
      category: values.category as ProjectCategory,
      collaboration_mode: values.collaboration_mode as CollaborationMode,
      repo_url: values.repo_url || null,
      opportunity_id: editing ? existing.data?.opportunity?.id ?? null : opportunityId,
    }
    try {
      const saved = editing ? await updateProject(projectId!, payload) : await createProject(payload)
      toast.success(editing ? 'Project updated.' : 'Project posted. It is now visible to other members.')
      navigate(`/projects/${saved.id}`, { replace: true })
    } catch (error) {
      setFormError(applyServerErrors(error, setError, {}, Object.keys(EMPTY)))
    }
  })

  if (editing && existing.loading && !existing.data) return <PageLoader label="Loading project" />
  if (editing && existing.error) return <PageContainer><ErrorState message={existing.error.message} onRetry={existing.reload} /></PageContainer>
  if (editing && existing.data && !existing.data.viewer.is_owner) {
    return <PageContainer><ErrorState title="You can't edit this project" message="Only the project owner can make changes." /></PageContainer>
  }

  const summary = watch('summary') ?? ''
  const description = watch('description') ?? ''

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={editing ? 'Edit project' : 'Post a project'}
        description={editing ? 'Changes are visible immediately.' : 'Describe what you are building and who you need. You can edit it later.'}
      />
      {linked.data && (
        <Notice tone="info" className="mb-6" title={`Team for “${linked.data.title}”`}>
          This project will be listed as a team forming for that opportunity.
        </Notice>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {formError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{formError}</p>}
        <section className="card space-y-5 p-6" aria-labelledby="project-basics">
          <h2 id="project-basics" className="text-lg font-semibold">About the project</h2>
          <Field label="Title" required error={errors.title?.message}>
            <TextInput maxLength={100} placeholder="e.g. Campus Carbon Tracker" {...register('title')} />
          </Field>
          <Field label="Short summary" required error={errors.summary?.message} hint={`${summary.length}/200 · Shown on project cards`}>
            <TextInput maxLength={200} {...register('summary')} />
          </Field>
          <Field label="Detailed description" required error={errors.description?.message} hint={`${description.length}/5000 · Goals, current progress, and what teammates will work on`}>
            <TextArea rows={8} maxLength={5000} {...register('description')} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" required error={errors.category?.message}>
              <Select options={PROJECT_CATEGORY_OPTIONS} placeholder="Choose a category" {...register('category')} />
            </Field>
            <Field label="Project or repository link" optional error={errors.repo_url?.message}>
              <TextInput type="url" inputMode="url" placeholder="https://github.com/…" {...register('repo_url')} />
            </Field>
          </div>
        </section>

        <section className="card space-y-5 p-6" aria-labelledby="project-team">
          <h2 id="project-team" className="text-lg font-semibold">Who you need</h2>
          <Field label="Required skills" required error={errors.required_skills?.message} hint="Teammate suggestions favour people who cover the skills your team is missing.">
            <Controller control={control} name="required_skills" render={({ field }) => (
              <TagInput label="Required skills" value={field.value} onChange={field.onChange} suggestions={SKILL_SUGGESTIONS} max={20} invalid={Boolean(errors.required_skills)} placeholder="e.g. React, FastAPI" />
            )} />
          </Field>
          <Controller control={control} name="roles_needed" render={({ field }) => (
            <ChipFilter label="Roles you're looking for (optional, up to 5)" options={ROLE_OPTIONS} value={field.value} onChange={(roles) => field.onChange(roles.slice(0, 5))} />
          )} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Preferred experience" error={errors.preferred_experience?.message}>
              <Select options={PREFERRED_EXPERIENCE_OPTIONS} {...register('preferred_experience')} />
            </Field>
            <Field label="Maximum team size" required error={errors.max_team_size?.message} hint="Including you. Between 2 and 20.">
              <TextInput type="number" min={2} max={20} step={1} {...register('max_team_size', { valueAsNumber: true })} />
            </Field>
          </div>
          <Field label="Collaboration mode" required error={errors.collaboration_mode?.message}>
            <Select options={MODE_OPTIONS} placeholder="Choose a mode" {...register('collaboration_mode')} />
          </Field>
          <Controller control={control} name="status" render={({ field }) => (
            <RadioCardGroup<ProjectStatus> name="status" legend="Status" value={field.value} onChange={field.onChange}
              options={PROJECT_STATUS_OPTIONS.map((o) => ({
                ...o,
                hint: { recruiting: 'Accepting join requests', active: 'Team formed, building', completed: 'Finished' }[o.value],
              }))} />
          )} />
        </section>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate(-1)} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{editing ? 'Save changes' : 'Post project'}</Button>
        </div>
      </form>
    </PageContainer>
  )
}
