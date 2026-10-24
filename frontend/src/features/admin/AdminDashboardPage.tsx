import { Link } from 'react-router'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Badge, ErrorState, PageLoader, SectionTitle } from '../../components/ui/display'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { fetchAdminProviders, fetchAdminStats } from '../../services/admin'
import { relativeTime } from '../../utils/format'

const GROUPS: { key: 'users' | 'projects' | 'requests' | 'opportunities' | 'reports' | 'messaging'; title: string; labels: Record<string, string> }[] = [
  { key: 'users', title: 'Users', labels: { total: 'Total', active: 'Active', suspended: 'Suspended', admins: 'Admins', new_last_7_days: 'New (7 days)' } },
  { key: 'projects', title: 'Projects', labels: { total: 'Total', recruiting: 'Recruiting', active: 'Active', completed: 'Completed', removed: 'Removed' } },
  { key: 'requests', title: 'Teams', labels: { pending: 'Pending requests', accepted_last_7_days: 'Accepted (7 days)', memberships: 'Memberships' } },
  { key: 'opportunities', title: 'Opportunities', labels: { total: 'Total', curated: 'Curated', community: 'Member posts', feed: 'From feeds', demo: 'Demo', removed: 'Removed' } },
  { key: 'reports', title: 'Reports', labels: { open: 'Open', resolved: 'Resolved', dismissed: 'Dismissed' } },
  { key: 'messaging', title: 'Messaging', labels: { conversations: 'Conversations', messages_last_7_days: 'Messages (7 days)' } },
]

export default function AdminDashboardPage() {
  useDocumentTitle('Admin overview')
  const stats = useApi((signal) => fetchAdminStats(signal), [])
  const providers = useApi((signal) => fetchAdminProviders(signal), [])
  if (stats.loading && !stats.data) return <PageLoader />
  if (stats.error) return <ErrorState message={stats.error.message} onRetry={stats.reload} />
  const data = stats.data
  if (!data) return null

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Overview</h1>
      {data.reports.open > 0 && (
        <Link to="/admin/reports" className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning hover:bg-warning/15">
          <CircleAlert className="size-5" aria-hidden="true" />
          {data.reports.open} open report{data.reports.open === 1 ? '' : 's'} waiting for review
        </Link>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((group) => (
          <section key={group.key} className="card p-5" aria-labelledby={`stat-${group.key}`}>
            <h2 id={`stat-${group.key}`} className="text-sm font-semibold text-fg">{group.title}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {Object.entries(group.labels).map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs text-subtle">{label}</dt>
                  <dd className="text-xl font-bold text-fg tabular-nums">{data[group.key][key] ?? 0}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <section>
        <SectionTitle title="Data providers" description="External sources used by the Opportunity Explorer and research search." />
        {providers.data ? (
          <ul className="card divide-y divide-line">
            {providers.data.map((provider) => (
              <li key={provider.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-fg">{provider.name}</p>
                  <p className="text-xs text-subtle">{provider.note}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!provider.enabled ? <Badge>Disabled</Badge> : provider.last_check ? (
                    provider.last_check.ok
                      ? <Badge tone="success" icon={<CircleCheck className="size-3" aria-hidden="true" />}>OK {relativeTime(provider.last_check.checked_at)}</Badge>
                      : <Badge tone="danger">Failed: {provider.last_check.reason}</Badge>
                  ) : <Badge tone="outline">Not used yet</Badge>}
                </div>
              </li>
            ))}
          </ul>
        ) : providers.error ? <ErrorState message={providers.error.message} /> : null}
      </section>
    </div>
  )
}
