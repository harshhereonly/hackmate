import { useState } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router'
import { Pencil, Plus, RefreshCw, Trash } from 'lucide-react'
import { OpportunityBadges } from '../../components/cards'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, Select, TextInput } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/display'
import { Pagination, Tabs } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { getErrorMessage } from '../../services/api'
import { createCuratedOpportunity, deleteCuratedOpportunity, listAdminOpportunities, syncFeeds, updateCuratedOpportunity } from '../../services/admin'
import type { Opportunity, OpportunityType } from '../../types/api'
import { OPPORTUNITY_TYPE_OPTIONS } from '../../utils/constants'
import { formatDate } from '../../utils/format'
import { applyServerErrors } from '../../utils/forms'
import {
  EMPTY_OPPORTUNITY,
  OpportunityFields,
  opportunitySchema,
  opportunityToValues,
  valuesToInput,
  type OpportunityValues,
} from '../opportunities/PostOpportunityPage'

const curatedSchema = opportunitySchema.and(z.object({
  type: z.enum(['hackathon', 'project', 'research']),
  source_name: z.string().trim().max(120),
  source_url: z.string().trim().max(300),
}))
type CuratedValues = z.infer<typeof curatedSchema>

function CuratedForm({ existing, onClose, onSaved }: { existing: Opportunity | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<CuratedValues>({
    resolver: zodResolver(curatedSchema),
    defaultValues: existing
      ? { ...opportunityToValues(existing), type: existing.type, source_name: existing.source.kind === 'curated' ? existing.source.name : '', source_url: existing.source.url ?? '' }
      : { ...EMPTY_OPPORTUNITY, accepts_applications: false, type: 'hackathon', source_name: '', source_url: '' },
  })
  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    if (!values.url) {
      form.setError('url', { message: 'Curated listings need the official registration or information link.' })
      return
    }
    const payload = { ...valuesToInput(values), type: values.type as OpportunityType, source_name: values.source_name, source_url: values.source_url || null }
    try {
      if (existing) await updateCuratedOpportunity(existing.id, payload)
      else await createCuratedOpportunity(payload)
      toast.success(existing ? 'Listing updated.' : 'Curated listing published.')
      onSaved()
      onClose()
    } catch (error) {
      setFormError(applyServerErrors(error, form.setError, {}, Object.keys(EMPTY_OPPORTUNITY)))
    }
  })
  return (
    <Modal open onClose={() => !form.formState.isSubmitting && onClose()} size="lg" title={existing ? 'Edit curated listing' : 'Add a curated listing'}
      description="Only add opportunities you have verified, with the organizer's official link and accurate dates."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={form.formState.isSubmitting}>Cancel</Button>
          <Button onClick={submit} loading={form.formState.isSubmitting}>{existing ? 'Save changes' : 'Publish listing'}</Button>
        </>
      }>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}
        <Field label="Type" required>
          <Select options={OPPORTUNITY_TYPE_OPTIONS} {...form.register('type')} disabled={Boolean(existing)} />
        </Field>
        {/* The shared fields only touch base-schema fields, which the curated schema extends. */}
        <OpportunityFields form={form as unknown as UseFormReturn<OpportunityValues>} showApplications={false} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Source name" optional hint="e.g. “Organizer's website”">
            <TextInput maxLength={120} {...form.register('source_name')} />
          </Field>
          <Field label="Source link" optional>
            <TextInput type="url" {...form.register('source_url')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}

export default function AdminOpportunitiesPage() {
  useDocumentTitle('Curated opportunities')
  const toast = useToast()
  const [filters, update] = useUrlState({ type: 'hackathon', page: 1 })
  const { data, loading, error, reload } = useApi(
    (signal) => listAdminOpportunities({ type: filters.type, page: filters.page }, signal),
    [filters.type, filters.page],
  )
  const [editing, setEditing] = useState<Opportunity | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Opportunity | null>(null)
  const [syncing, setSyncing] = useState(false)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Curated opportunities</h1>
        <div className="flex gap-2">
          <Button variant="secondary" loading={syncing} icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={async () => {
            setSyncing(true)
            try {
              const results = await syncFeeds()
              const totals = results.reduce((acc, r) => ({ imported: acc.imported + r.imported, updated: acc.updated + r.updated, skipped: acc.skipped + r.skipped }), { imported: 0, updated: 0, skipped: 0 })
              const failed = results.filter((r) => r.error)
              toast.info(`Feeds synced: ${totals.imported} new, ${totals.updated} updated, ${totals.skipped} skipped${failed.length ? `, ${failed.length} feed(s) failed` : ''}.`)
              reload()
            } catch (err) {
              toast.error(getErrorMessage(err))
            } finally {
              setSyncing(false)
            }
          }}>Sync organizer feeds</Button>
          <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setEditing('new')}>Add listing</Button>
        </div>
      </div>
      <Tabs label="Opportunity type" className="mb-5" value={filters.type} onChange={(type) => update({ type })}
        items={OPPORTUNITY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <Spinner /> :
        data && data.items.length === 0 ? <EmptyState title="No listings of this type" description="Add verified listings with official links, or sync organizer feeds." /> : data ? (
          <>
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li key={item.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <OpportunityBadges opportunity={item} />
                    <Link to={`/opportunities/${item.id}`} className="mt-1 block truncate font-semibold text-fg hover:text-brand-200">{item.title}</Link>
                    <p className="text-xs text-subtle">{item.source.name} · Added {formatDate(item.created_at)}</p>
                  </div>
                  {item.source.kind !== 'community' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon={<Pencil className="size-4" aria-hidden="true" />} onClick={() => setEditing(item)}>Edit</Button>
                      <Button size="sm" variant="danger" icon={<Trash className="size-4" aria-hidden="true" />} onClick={() => setDeleting(item)}>Delete</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
      {editing && <CuratedForm existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Delete “${deleting?.title ?? ''}”?`}
        description="The listing is permanently deleted. Projects linked to it keep existing without the link." confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return
          await deleteCuratedOpportunity(deleting.id)
          toast.success('Listing deleted.')
          reload()
        }} />
    </div>
  )
}
