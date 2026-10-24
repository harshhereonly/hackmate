import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, Select, TextArea } from '../../components/ui/Field'
import { Badge, EmptyState, ErrorState, Spinner } from '../../components/ui/display'
import { Pagination, SearchInput, Tabs } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDebouncedValue, useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { listAdminListings, setListingRemoved } from '../../services/admin'
import type { AdminListing } from '../../types/api'
import { SOURCE_LABELS } from '../../utils/constants'
import { formatDate } from '../../utils/format'

export default function AdminListingsPage() {
  useDocumentTitle('Listings')
  const toast = useToast()
  const [filters, update] = useUrlState({ kind: 'project', removed: '', q: '', page: 1 })
  const [query, setQuery] = useState(filters.q)
  const debounced = useDebouncedValue(query, 350)
  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  const kind = filters.kind as 'project' | 'opportunity'
  const { data, loading, error, reload } = useApi(
    (signal) => listAdminListings({ kind, removed: filters.removed === '' ? undefined : filters.removed === 'true', q: filters.q, page: filters.page }, signal),
    [kind, filters.removed, filters.q, filters.page],
  )
  const [target, setTarget] = useState<AdminListing | null>(null)
  const [reason, setReason] = useState('')

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Listings</h1>
      <Tabs label="Listing type" className="mb-5" value={kind} onChange={(value) => update({ kind: value })}
        items={[{ value: 'project', label: 'Projects' }, { value: 'opportunity', label: 'Opportunities' }]} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" label="Search titles" value={query} onChange={setQuery} placeholder="Search titles" />
        <Select aria-label="Visibility" value={filters.removed} onChange={(e) => update({ removed: e.target.value })} placeholder="Visible and removed"
          options={[{ value: 'false', label: 'Visible only' }, { value: 'true', label: 'Removed only' }]} />
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <Spinner /> :
        data && data.items.length === 0 ? <EmptyState title="No listings match" /> : data ? (
          <>
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li key={item.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="outline">{item.type}</Badge>
                      {item.status && <Badge>{item.status}</Badge>}
                      {item.source_kind && <Badge tone="outline">{SOURCE_LABELS[item.source_kind]}</Badge>}
                      {item.is_removed && <Badge tone="danger">Removed</Badge>}
                      {item.is_demo && <Badge tone="warning">Demo</Badge>}
                      {item.open_reports > 0 && <Badge tone="danger">{item.open_reports} open report{item.open_reports === 1 ? '' : 's'}</Badge>}
                    </div>
                    <Link to={`/${kind === 'project' ? 'projects' : 'opportunities'}/${item.id}`} className="mt-1 block truncate font-semibold text-fg hover:text-brand-200">{item.title}</Link>
                    <p className="text-xs text-subtle">
                      {item.owner ? `By ${item.owner.name} · ` : ''}Created {formatDate(item.created_at)}
                      {item.removed_reason ? ` · Removed: ${item.removed_reason}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant={item.is_removed ? 'secondary' : 'danger'}
                    icon={item.is_removed ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                    onClick={() => { setReason(''); setTarget(item) }}>
                    {item.is_removed ? 'Restore' : 'Remove'}
                  </Button>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target?.is_removed ? `Restore “${target.title}”?` : `Remove “${target?.title ?? ''}”?`}
        description={target?.is_removed ? 'It becomes visible to members again. The owner is notified.' : 'It is hidden from members. The owner is notified with your reason.'}
        tone={target?.is_removed ? 'primary' : 'danger'}
        confirmLabel={target?.is_removed ? 'Restore' : 'Remove'}
        confirmDisabled={Boolean(target && !target.is_removed) && reason.trim().length < 3}
        onConfirm={async () => {
          if (!target) return
          await setListingRemoved(target.kind, target.id, !target.is_removed, reason.trim())
          toast.success(target.is_removed ? 'Listing restored.' : 'Listing removed.')
          reload()
        }}
      >
        {target && !target.is_removed && (
          <Field label="Reason (required)" hint="Shared with the owner and recorded in the audit log.">
            <TextArea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        )}
      </ConfirmDialog>
    </div>
  )
}
