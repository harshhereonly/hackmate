import { Inbox, Send } from 'lucide-react'
import { ButtonLink } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { EmptyState, ErrorState, GridSkeleton, PageHeader } from '../../components/ui/display'
import { Pagination, Tabs } from '../../components/ui/navigation'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { listRequests, type RequestBox, type RequestStatusFilter } from '../../services/requests'
import { useActivity } from '../notifications/ActivityContext'
import { RequestCard } from './RequestCard'

const DEFAULTS = { box: 'incoming', status: 'pending', page: 1 }
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'all', label: 'All statuses' },
]

export default function RequestsPage() {
  useDocumentTitle('Requests')
  const [filters, update] = useUrlState(DEFAULTS)
  const activity = useActivity()
  const box = filters.box as RequestBox
  const status = filters.status as RequestStatusFilter
  const { data, loading, error, reload, setData } = useApi((signal) => listRequests(box, status, filters.page, signal), [box, status, filters.page])

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Join requests"
        description="Requests to join your projects, invitations you've received, and everything you've sent."
        actions={<ButtonLink to="/opportunities/applications" variant="ghost" size="sm">Research applications</ButtonLink>}
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          label="Request direction"
          value={box}
          onChange={(value) => update({ box: value })}
          items={[
            { value: 'incoming', label: <span className="inline-flex items-center gap-1.5"><Inbox className="size-4" aria-hidden="true" />Incoming</span>, count: activity.incomingRequests },
            { value: 'outgoing', label: <span className="inline-flex items-center gap-1.5"><Send className="size-4" aria-hidden="true" />Sent</span> },
          ]}
        />
        <Select aria-label="Filter by status" value={status} onChange={(event) => update({ status: event.target.value })} options={STATUS_OPTIONS} className="sm:w-48" />
      </div>
      <p className="mb-4 text-sm text-subtle">
        {box === 'incoming'
          ? 'Incoming: people asking to join your projects, and invitations sent to you. You decide on these.'
          : 'Sent: your requests to join projects, and invitations you sent. You can withdraw pending ones.'}
      </p>
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <GridSkeleton count={3} className="sm:grid-cols-1 lg:grid-cols-1" />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={box === 'incoming' ? <Inbox /> : <Send />}
          title={status === 'pending' ? 'Nothing pending' : 'No requests here'}
          description={box === 'incoming'
            ? 'When someone asks to join your project or invites you, it will appear here.'
            : 'Browse projects and request to join one that fits you.'}
          action={box === 'outgoing' ? <ButtonLink to="/projects" variant="secondary">Browse projects</ButtonLink> : undefined}
        />
      ) : data ? (
        <>
          <div className="space-y-3">
            {data.items.map((request) => (
              <RequestCard key={request.id} request={request}
                onChange={(updated) => setData((current) => current && {
                  ...current,
                  items: current.items
                    .map((r) => (r.id === updated.id ? updated : r))
                    .filter((r) => status === 'all' || r.status === status),
                })} />
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
        </>
      ) : null}
    </PageContainer>
  )
}
