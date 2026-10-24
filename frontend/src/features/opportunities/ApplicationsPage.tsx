import { useState } from 'react'
import { Link } from 'react-router'
import { Check, FlaskConical, RotateCcw, X } from 'lucide-react'
import { PersonLink } from '../../components/cards'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { Badge, EmptyState, ErrorState, GridSkeleton, PageHeader } from '../../components/ui/display'
import { Pagination, Tabs } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage } from '../../services/api'
import { actOnApplication, listApplications } from '../../services/opportunities'
import type { OpportunityApplication } from '../../types/api'
import { APPLICATION_STATUS_LABELS } from '../../utils/constants'
import { relativeTime } from '../../utils/format'

function ApplicationCard({ application, onChange }: { application: OpportunityApplication; onChange: (a: OpportunityApplication) => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (action: 'accept' | 'decline' | 'withdraw') => {
    setBusy(action)
    try {
      onChange(await actOnApplication(application.id, action))
      toast.success({ accept: 'Application accepted.', decline: 'Application declined.', withdraw: 'Application withdrawn.' }[action])
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }
  return (
    <article className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge tone={application.status === 'accepted' ? 'success' : application.status === 'pending' ? 'warning' : 'neutral'}>
              {APPLICATION_STATUS_LABELS[application.status]}
            </Badge>
            <span className="text-xs text-subtle">{relativeTime(application.created_at)}</span>
          </div>
          <p className="text-sm text-muted">
            {application.direction === 'incoming' ? <><strong className="text-fg">{application.person.name}</strong> applied to </> : 'You applied to '}
            {application.opportunity ? <Link className="link" to={`/opportunities/${application.opportunity.id}`}>{application.opportunity.title}</Link> : 'a deleted post'}
          </p>
        </div>
        <PersonLink person={application.person} />
      </div>
      {application.message && <blockquote className="mt-4 rounded-lg border-l-2 border-brand-400/60 bg-surface-2/60 px-4 py-3 text-sm whitespace-pre-line text-muted">{application.message}</blockquote>}
      {(application.can_decide || application.can_withdraw) && (
        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          {application.can_decide && (
            <>
              <Button size="sm" variant="success" loading={busy === 'accept'} disabled={Boolean(busy)} icon={<Check className="size-4" aria-hidden="true" />} onClick={() => act('accept')}>Accept</Button>
              <Button size="sm" variant="danger" loading={busy === 'decline'} disabled={Boolean(busy)} icon={<X className="size-4" aria-hidden="true" />} onClick={() => act('decline')}>Decline</Button>
            </>
          )}
          {application.can_withdraw && (
            <Button size="sm" variant="secondary" loading={busy === 'withdraw'} disabled={Boolean(busy)} icon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={() => act('withdraw')}>Withdraw</Button>
          )}
        </div>
      )}
    </article>
  )
}

const DEFAULTS = { box: 'incoming', status: 'pending', page: 1 }

export default function ApplicationsPage() {
  useDocumentTitle('Research applications')
  const [filters, update] = useUrlState(DEFAULTS)
  const box = filters.box as 'incoming' | 'outgoing'
  const status = filters.status as 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'all'
  const { data, loading, error, reload, setData } = useApi((signal) => listApplications(box, status, filters.page, signal), [box, status, filters.page])

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Research applications" description="Applications to the research collaborations you posted, and the ones you sent."
        actions={<ButtonLink to="/opportunities/new" variant="secondary" size="sm">Post a collaboration</ButtonLink>} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs label="Application direction" value={box} onChange={(value) => update({ box: value })}
          items={[{ value: 'incoming', label: 'Received' }, { value: 'outgoing', label: 'Sent' }]} />
        <Select aria-label="Filter by status" className="sm:w-48" value={status} onChange={(event) => update({ status: event.target.value })}
          options={[{ value: 'pending', label: 'Pending' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' },
            { value: 'withdrawn', label: 'Withdrawn' }, { value: 'all', label: 'All statuses' }]} />
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <GridSkeleton count={2} className="sm:grid-cols-1 lg:grid-cols-1" /> :
        data && data.items.length === 0 ? (
          <EmptyState icon={<FlaskConical />} title="No applications" description={box === 'incoming' ? 'Applications to your research posts will appear here.' : 'Applications you send will appear here.'} />
        ) : data ? (
          <>
            <div className="space-y-3">
              {data.items.map((application) => (
                <ApplicationCard key={application.id} application={application}
                  onChange={(updated) => setData((current) => current && { ...current, items: current.items.map((a) => (a.id === updated.id ? updated : a)) })} />
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
    </PageContainer>
  )
}
