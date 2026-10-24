import { useState } from 'react'
import { Link } from 'react-router'
import { Ban, Check, EyeOff, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, Select, TextArea } from '../../components/ui/Field'
import { Badge, EmptyState, ErrorState, GridSkeleton } from '../../components/ui/display'
import { Pagination, Tabs } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { listAdminReports, removeMessage, resolveReport, setListingRemoved, suspendUser } from '../../services/admin'
import type { AdminReport, ReportStatus } from '../../types/api'
import { REPORT_REASON_OPTIONS, labelFor } from '../../utils/constants'
import { formatDateTime } from '../../utils/format'

type Action = { kind: 'resolve' | 'dismiss' | 'remove' | 'suspend'; report: AdminReport }

function ReportCard({ report, onAction }: { report: AdminReport; onAction: (action: Action) => void }) {
  const target = report.target
  const open = report.status === 'open'
  const canRemove = open && target.exists && (report.target_type === 'message' ? !target.deleted : report.target_type !== 'user' && !target.is_removed)
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline" className="capitalize">{report.target_type}</Badge>
        <Badge tone="danger">{labelFor(REPORT_REASON_OPTIONS, report.reason)}</Badge>
        <Badge tone={open ? 'warning' : report.status === 'resolved' ? 'success' : 'neutral'}>{report.status}</Badge>
        <span className="text-xs text-subtle">{formatDateTime(report.created_at)}</span>
      </div>
      <h3 className="mt-2 font-semibold text-fg">
        {target.path ? <Link to={target.path} className="hover:text-brand-200">{target.label}</Link> : target.label}
        {!target.exists && <span className="ml-2 text-xs font-normal text-subtle">(no longer exists)</span>}
        {target.is_removed && <span className="ml-2 text-xs font-normal text-danger">(removed)</span>}
        {target.status === 'suspended' && <span className="ml-2 text-xs font-normal text-danger">(suspended)</span>}
      </h3>
      {report.target_type === 'message' && (
        <blockquote className="mt-2 rounded-lg border-l-2 border-danger/50 bg-surface-2/60 px-3 py-2 text-sm whitespace-pre-wrap text-muted">
          {target.body}
          {target.sender && <footer className="mt-1 text-xs text-subtle">Sent by {target.sender.name} (@{target.sender.handle})</footer>}
        </blockquote>
      )}
      {report.details && <p className="mt-2 text-sm text-muted">“{report.details}”</p>}
      <p className="mt-2 text-xs text-subtle">Reported by {report.reporter.name}</p>
      {report.resolution_note && <p className="mt-1 text-xs text-subtle">Resolution: {report.resolution_note}{report.resolved_by ? ` (by ${report.resolved_by})` : ''}</p>}
      {open && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {canRemove && (
            <Button size="sm" variant="danger" icon={<EyeOff className="size-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'remove', report })}>
              Remove {report.target_type}
            </Button>
          )}
          {report.target_type === 'user' && target.exists && target.status !== 'suspended' && (
            <Button size="sm" variant="danger" icon={<Ban className="size-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'suspend', report })}>Suspend user</Button>
          )}
          <Button size="sm" variant="success" icon={<Check className="size-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'resolve', report })}>Mark resolved</Button>
          <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden="true" />} onClick={() => onAction({ kind: 'dismiss', report })}>Dismiss</Button>
        </div>
      )}
    </article>
  )
}

export default function AdminReportsPage() {
  useDocumentTitle('Reports')
  const toast = useToast()
  const [filters, update] = useUrlState({ status: 'open', target_type: '', page: 1 })
  const { data, loading, error, reload } = useApi(
    (signal) => listAdminReports({ status: filters.status as ReportStatus | 'all', target_type: filters.target_type || undefined, page: filters.page }, signal),
    [filters.status, filters.target_type, filters.page],
  )
  const [action, setAction] = useState<Action | null>(null)
  const [note, setNote] = useState('')

  const titles = {
    resolve: 'Mark this report resolved?',
    dismiss: 'Dismiss this report?',
    remove: `Remove this ${action?.report.target_type ?? 'item'}?`,
    suspend: 'Suspend this account?',
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold">Reports</h1>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs label="Report status" value={filters.status} onChange={(status) => update({ status })}
          items={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }, { value: 'all', label: 'All' }]} />
        <Select aria-label="Target type" className="sm:w-44" value={filters.target_type} onChange={(event) => update({ target_type: event.target.value })} placeholder="All types"
          options={[{ value: 'user', label: 'Users' }, { value: 'project', label: 'Projects' }, { value: 'opportunity', label: 'Opportunities' }, { value: 'message', label: 'Messages' }]} />
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <GridSkeleton count={2} className="sm:grid-cols-1 lg:grid-cols-1" /> :
        data && data.items.length === 0 ? <EmptyState title="No reports here" description="Reports from members will appear in this queue." /> : data ? (
          <>
            <div className="space-y-3">{data.items.map((report) => <ReportCard key={report.id} report={report} onAction={(a) => { setNote(''); setAction(a) }} />)}</div>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? titles[action.kind] : ''}
        description={action?.kind === 'suspend' ? 'They will be signed out immediately and hidden from the directory, matching and messaging.' :
          action?.kind === 'remove' ? 'It will be hidden from members. The owner is notified. Resolve the report afterwards.' : 'The reporter will be told their report was reviewed.'}
        tone={action?.kind === 'resolve' || action?.kind === 'dismiss' ? 'primary' : 'danger'}
        confirmLabel={action ? { resolve: 'Resolve', dismiss: 'Dismiss', remove: 'Remove', suspend: 'Suspend' }[action.kind] : 'Confirm'}
        confirmDisabled={(action?.kind === 'remove' || action?.kind === 'suspend') && note.trim().length < 3}
        onConfirm={async () => {
          if (!action) return
          const { report } = action
          if (action.kind === 'resolve' || action.kind === 'dismiss') {
            await resolveReport(report.id, action.kind === 'resolve' ? 'resolved' : 'dismissed', note.trim())
          } else if (action.kind === 'suspend') {
            if (!report.target.user_id) throw new Error('User not found.')
            await suspendUser(report.target.user_id, note.trim())
          } else if (report.target_type === 'message') {
            await removeMessage(report.target_id, note.trim())
          } else {
            await setListingRemoved(report.target_type as 'project' | 'opportunity', report.target_id, true, note.trim())
          }
          toast.success('Done. The action was recorded in the audit log.')
          reload()
        }}
      >
        <Field label={action?.kind === 'remove' || action?.kind === 'suspend' ? 'Reason (required)' : 'Note'} optional={action?.kind === 'resolve' || action?.kind === 'dismiss'}
          hint={action?.kind === 'remove' ? 'Shared with the owner.' : 'Recorded in the audit log.'}>
          <TextArea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  )
}
