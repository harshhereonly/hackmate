import { EmptyState, ErrorState, Spinner } from '../../components/ui/display'
import { Pagination } from '../../components/ui/navigation'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { listAudit } from '../../services/admin'
import { formatDateTime } from '../../utils/format'

function humanize(action: string) {
  return action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export default function AdminAuditPage() {
  useDocumentTitle('Audit log')
  const [filters, update] = useUrlState({ page: 1 })
  const { data, loading, error, reload } = useApi((signal) => listAudit(filters.page, signal), [filters.page])
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Audit log</h1>
      <p className="mb-5 text-sm text-subtle">Every moderation and curation action, newest first.</p>
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <Spinner /> :
        data && data.items.length === 0 ? <EmptyState title="No actions recorded yet" /> : data ? (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Moderation actions</caption>
                <thead className="border-b border-line text-xs text-subtle uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">When</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Admin</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Target</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(entry.created_at)}</td>
                      <td className="px-4 py-3 text-fg">{entry.admin.name}</td>
                      <td className="px-4 py-3 text-fg">{humanize(entry.action)}</td>
                      <td className="px-4 py-3 text-muted"><span className="capitalize">{entry.target_type}</span>: {entry.target_label}</td>
                      <td className="px-4 py-3 text-muted">{entry.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
    </div>
  )
}
