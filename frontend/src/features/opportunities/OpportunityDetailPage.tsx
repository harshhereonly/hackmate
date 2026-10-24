import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CalendarClock, ExternalLink, Flag, Globe, MapPin, Pencil, Send, Sparkles, Trash, Users } from 'lucide-react'
import { DeadlineText, OpportunityBadges, PersonLink, ProjectCard } from '../../components/cards'
import { MatchExplanation, ScorePill } from '../../components/MatchExplanation'
import { ReportDialog } from '../../components/ReportDialog'
import { SaveButton } from '../../components/SaveButton'
import { TagList } from '../../components/tags'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field, TextArea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { Avatar, Badge, EmptyState, ErrorState, Notice, PageLoader, SectionTitle, Spinner } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage } from '../../services/api'
import { applyToOpportunity, deleteOpportunity, fetchOpportunity, fetchTeamsForOpportunity } from '../../services/opportunities'
import { fetchOpportunityTeammates } from '../../services/social'
import type { Opportunity } from '../../types/api'
import { APPLICATION_STATUS_LABELS, OPPORTUNITY_MODE_OPTIONS, labelFor } from '../../utils/constants'
import { formatDateRange, formatDateTime } from '../../utils/format'
import { useAuth } from '../auth/AuthContext'
import { MessageButton } from '../projects/dialogs'

function ApplyDialog({ opportunity, open, onClose, onApplied }: { opportunity: Opportunity; open: boolean; onClose: () => void; onApplied: () => void }) {
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal open={open} onClose={() => !busy && onClose()} dismissible={!busy} title={`Apply to “${opportunity.title}”`}
      description="Your profile and message are shared with the person who posted this."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} icon={<Send className="size-4" aria-hidden="true" />} onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await applyToOpportunity(opportunity.id, message.trim())
              toast.success('Application sent.')
              onApplied()
              onClose()
            } catch (err) {
              setError(getErrorMessage(err))
            } finally {
              setBusy(false)
            }
          }}>Send application</Button>
        </>
      }>
      <Field label="Message" optional hint={`${message.length}/1000`}>
        <TextArea data-autofocus rows={5} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)}
          placeholder="Your relevant experience and what you'd like to contribute" />
      </Field>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  )
}

function TeammatesForOpportunity({ opportunityId }: { opportunityId: string }) {
  const { data, loading, error, reload } = useApi((signal) => fetchOpportunityTeammates(opportunityId, 4, signal), [opportunityId])
  if (loading && !data) return <Spinner label="Finding teammates" />
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data?.items.length) return <p className="text-sm text-subtle">No suggestions yet. Try the people directory.</p>
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.items.map((item) => (
        <div key={item.person.handle} className="rounded-xl border border-line bg-surface-2/50 p-4">
          <div className="flex items-start gap-3">
            <Avatar name={item.person.name} src={item.person.avatar_url} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/people/${item.person.handle}`} className="font-semibold text-fg hover:text-brand-200">{item.person.name}</Link>
                <ScorePill score={item.score} />
              </div>
              <TagList tags={item.person.skills} max={4} className="mt-2" />
              <div className="mt-2"><MatchExplanation match={item} compact /></div>
              <div className="mt-3"><MessageButton handle={item.person.handle} /></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function OpportunityDetailPage() {
  const { opportunityId = '' } = useParams()
  const { status } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: opportunity, loading, error, reload } = useApi((signal) => fetchOpportunity(opportunityId, signal), [opportunityId, status])
  const teams = useApi((signal) => fetchTeamsForOpportunity(opportunityId, signal), [opportunityId], { enabled: Boolean(opportunity) })
  const [dialog, setDialog] = useState<'apply' | 'delete' | 'report' | null>(null)
  useDocumentTitle(opportunity?.title ?? 'Opportunity')

  if (loading && !opportunity) return <PageLoader label="Loading opportunity" />
  if (error) {
    return (
      <PageContainer>
        {error.status === 404
          ? <EmptyState title="Opportunity not found" description="It may have been removed or never existed." action={<ButtonLink to="/opportunities">Back to explorer</ButtonLink>} />
          : <ErrorState message={error.message} onRetry={reload} />}
      </PageContainer>
    )
  }
  if (!opportunity) return null
  const viewer = opportunity.viewer
  const dates = formatDateRange(opportunity.starts_at, opportunity.ends_at)
  const canTeamUp = opportunity.type !== 'research' || opportunity.source.kind !== 'community'

  return (
    <PageContainer>
      {opportunity.is_demo && (
        <Notice tone="warning" title="Demo data" className="mb-6">
          This is a sample listing created for demonstration. It is not a real event, so there is no registration link.
        </Notice>
      )}
      {opportunity.is_removed && <Notice tone="danger" title="Removed by moderators" className="mb-6">This listing is hidden from other members.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-6">
            <OpportunityBadges opportunity={opportunity} />
            <div className="mt-3 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-fg sm:text-3xl">{opportunity.title}</h1>
              <SaveButton item={{ item_key: opportunity.key, title: opportunity.title, item_type: opportunity.type }} />
            </div>
            {opportunity.organizer && <p className="mt-1 text-sm text-subtle">Organized by {opportunity.organizer}</p>}
            <p className="mt-3 text-muted">{opportunity.summary}</p>
            {opportunity.description && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-muted">{opportunity.description}</p>}
            {opportunity.skills.length > 0 && (
              <>
                <h2 className="mt-6 text-sm font-semibold text-fg">Relevant skills</h2>
                <TagList tags={opportunity.skills} max={20} className="mt-2" />
              </>
            )}
            {opportunity.tags.length > 0 && <TagList tags={opportunity.tags} tone="muted" max={10} className="mt-3" label="Tags" />}
          </section>

          {canTeamUp && (
            <section aria-labelledby="teams-heading">
              <SectionTitle
                title={<span id="teams-heading" className="inline-flex items-center gap-2"><Users className="size-4 text-brand-300" aria-hidden="true" />Find teammates</span>}
                description="Join a team that's forming for this opportunity, or start your own."
                action={<ButtonLink to={status === 'authenticated' ? `/projects/new?opportunity=${opportunity.id}` : `/login?next=/projects/new?opportunity=${opportunity.id}`} size="sm">Start a team</ButtonLink>}
              />
              {teams.data && teams.data.items.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {teams.data.items.map((project) => <ProjectCard key={project.id} project={project} />)}
                </div>
              ) : (
                <p className="text-sm text-subtle">No teams are forming yet. Be the first.</p>
              )}
              {status === 'authenticated' && (
                <div className="mt-6">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-fg"><Sparkles className="size-4 text-brand-300" aria-hidden="true" />People who could team up with you</h3>
                  <TeammatesForOpportunity opportunityId={opportunity.id} />
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card space-y-4 p-5" aria-label="Key details">
            {dates && (
              <p className="flex items-start gap-2 text-sm text-muted">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                <span><span className="block font-medium text-fg">{dates}</span>{opportunity.starts_at && <span className="text-xs">Starts {formatDateTime(opportunity.starts_at)}</span>}</span>
              </p>
            )}
            {opportunity.deadline && <p className="text-sm"><DeadlineText deadline={opportunity.deadline} /></p>}
            {opportunity.mode && (
              <p className="flex items-center gap-2 text-sm text-muted">
                {opportunity.mode === 'online' ? <Globe className="size-4 text-subtle" aria-hidden="true" /> : <MapPin className="size-4 text-subtle" aria-hidden="true" />}
                {labelFor(OPPORTUNITY_MODE_OPTIONS, opportunity.mode)}{opportunity.location ? ` · ${opportunity.location}` : ''}
              </p>
            )}
            {!dates && !opportunity.deadline && <p className="text-sm text-subtle">Dates aren't listed. Check the official source.</p>}

            {opportunity.url ? (
              <a href={opportunity.url} target="_blank" rel="noopener noreferrer nofollow"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
                {opportunity.type === 'hackathon' ? 'Register on the official site' : 'Open official page'}
                <ExternalLink className="size-4" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : !opportunity.is_demo && opportunity.source.kind !== 'community' && (
              <p className="text-xs text-subtle">No official link was provided for this listing.</p>
            )}

            {opportunity.accepts_applications && (
              viewer?.is_owner ? (
                <div className="grid gap-2">
                  <ButtonLink to="/opportunities/applications?box=incoming" variant="secondary" fullWidth>View applications</ButtonLink>
                  <ButtonLink to={`/opportunities/${opportunity.id}/edit`} variant="ghost" fullWidth icon={<Pencil className="size-4" aria-hidden="true" />}>Edit post</ButtonLink>
                </div>
              ) : viewer?.application && viewer.application.status !== 'withdrawn' ? (
                <Badge tone={viewer.application.status === 'accepted' ? 'success' : 'warning'} className="w-full justify-center py-1.5">
                  Application {APPLICATION_STATUS_LABELS[viewer.application.status].toLowerCase()}
                </Badge>
              ) : viewer?.can_apply ? (
                <Button fullWidth onClick={() => setDialog('apply')} icon={<Send className="size-4" aria-hidden="true" />}>Apply to collaborate</Button>
              ) : status !== 'authenticated' ? (
                <ButtonLink to={`/login?next=/opportunities/${opportunity.id}`} fullWidth>Log in to apply</ButtonLink>
              ) : viewer?.cannot_apply_reason ? (
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{viewer.cannot_apply_reason}</p>
              ) : null
            )}
            {viewer?.is_owner && !opportunity.accepts_applications && opportunity.source.kind === 'community' && (
              <ButtonLink to={`/opportunities/${opportunity.id}/edit`} variant="secondary" fullWidth icon={<Pencil className="size-4" aria-hidden="true" />}>Edit post</ButtonLink>
            )}
            {viewer?.is_owner && (
              <Button variant="danger" fullWidth icon={<Trash className="size-4" aria-hidden="true" />} onClick={() => setDialog('delete')}>Delete post</Button>
            )}
          </section>

          <section className="card space-y-3 p-5" aria-labelledby="source-heading">
            <h2 id="source-heading" className="text-sm font-semibold text-fg">Source</h2>
            {opportunity.posted_by ? <PersonLink person={opportunity.posted_by} subtitle="Posted by" /> : (
              <p className="text-sm text-muted">{opportunity.source.name}</p>
            )}
            {opportunity.source.url && (
              <a href={opportunity.source.url} target="_blank" rel="noopener noreferrer nofollow" className="link inline-flex items-center gap-1 text-sm">
                Source website <ExternalLink className="size-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <p className="text-xs text-subtle">Always confirm dates and eligibility on the official source before registering.</p>
          </section>

          {status === 'authenticated' && !viewer?.is_owner && (
            <Button variant="ghost" size="sm" icon={<Flag className="size-4" aria-hidden="true" />} onClick={() => setDialog('report')}>Report this listing</Button>
          )}
        </aside>
      </div>

      <ApplyDialog opportunity={opportunity} open={dialog === 'apply'} onClose={() => setDialog(null)} onApplied={reload} />
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete this post?"
        description="The post and all of its applications will be permanently deleted."
        confirmLabel="Delete post"
        onConfirm={async () => {
          await deleteOpportunity(opportunity.id)
          toast.success('Post deleted.')
          navigate('/opportunities?tab=research', { replace: true })
        }} />
      <ReportDialog open={dialog === 'report'} onClose={() => setDialog(null)} targetType="opportunity" targetId={opportunity.id} targetLabel={opportunity.title} />
    </PageContainer>
  )
}
