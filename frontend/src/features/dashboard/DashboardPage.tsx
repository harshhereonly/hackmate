import { Link } from 'react-router'
import { ArrowRight, Bell, Compass, FolderPlus, Inbox, MessageSquare, Sparkles, Users } from 'lucide-react'
import { ProjectCard } from '../../components/cards'
import { MatchExplanation, ScorePill } from '../../components/MatchExplanation'
import { TagList } from '../../components/tags'
import { ButtonLink } from '../../components/ui/Button'
import { Avatar, Badge, CardSkeleton, EmptyState, ErrorState, Notice, SectionTitle, Spinner } from '../../components/ui/display'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { fetchMyProfile } from '../../services/profiles'
import { listMyProjects } from '../../services/projects'
import { fetchSuggestedOpportunities, fetchSuggestedTeammates, listNotifications } from '../../services/social'
import { relativeTime } from '../../utils/format'
import { useAuth } from '../auth/AuthContext'
import { useActivity } from '../notifications/ActivityContext'

function StatTile({ to, icon: Icon, label, value }: { to: string; icon: typeof Inbox; label: string; value: number | string }) {
  return (
    <Link to={to} className="card-interactive flex items-center gap-4 p-4">
      <span className="flex size-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-2xl font-bold text-fg tabular-nums">{value}</span>
        <span className="block text-xs text-subtle">{label}</span>
      </span>
    </Link>
  )
}

function SuggestedTeammatesPanel() {
  const { data, loading, error, reload } = useApi((signal) => fetchSuggestedTeammates(4, signal), [])
  if (loading && !data) return <div className="grid gap-4 sm:grid-cols-2"><CardSkeleton /><CardSkeleton /></div>
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data) return null
  return (
    <div className="space-y-3">
      {data.notice && <Notice tone="warning" action={<ButtonLink to="/profile/edit" size="sm" variant="secondary">Edit profile</ButtonLink>}>{data.notice}</Notice>}
      {data.items.length === 0 ? (
        <EmptyState icon={<Users />} title="No suggestions yet" description="Suggestions appear as more members complete their profiles." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.items.map((item) => (
            <div key={item.person.handle} className="card p-4">
              <div className="flex items-start gap-3">
                <Avatar name={item.person.name} src={item.person.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/people/${item.person.handle}`} className="truncate font-semibold text-fg hover:text-brand-200">{item.person.name}</Link>
                    <ScorePill score={item.score} />
                  </div>
                  {item.person.headline && <p className="truncate text-xs text-subtle">{item.person.headline}</p>}
                  <TagList tags={item.person.skills} max={4} className="mt-2" />
                  <div className="mt-3"><MatchExplanation match={item} compact /></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestedOpportunitiesPanel() {
  const { data, loading, error, reload } = useApi((signal) => fetchSuggestedOpportunities(5, signal), [])
  if (loading && !data) return <Spinner label="Loading suggestions" />
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data?.items.length) {
    return <EmptyState icon={<Compass />} title="Nothing to suggest yet" description="Add skills and interests to your profile, or browse the explorer." className="py-8" />
  }
  return (
    <ul className="card divide-y divide-line">
      {data.items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">{item.kind === 'project' ? 'HackMate project' : item.type}</Badge>
            {item.is_demo && <Badge tone="warning">Demo data</Badge>}
            <ScorePill score={item.score} />
          </div>
          <Link to={item.path} className="mt-1.5 block font-semibold text-fg hover:text-brand-200">{item.title}</Link>
          <p className="line-clamp-1 text-sm text-muted">{item.summary}</p>
          {item.reasons.length > 0 && <p className="mt-1 text-xs text-subtle">{item.reasons.slice(0, 2).join(' · ')}</p>}
        </li>
      ))}
    </ul>
  )
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const activity = useActivity()
  const profile = useApi((signal) => fetchMyProfile(signal), [])
  const projects = useApi((signal) => listMyProjects('all', 1, signal), [])
  const notifications = useApi((signal) => listNotifications(false, 1, signal), [])
  const firstName = (user?.profile?.name ?? '').split(' ')[0]

  return (
    <PageContainer>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold text-fg sm:text-3xl">Welcome back{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/projects/new" icon={<FolderPlus className="size-4" aria-hidden="true" />}>Post a project</ButtonLink>
          <ButtonLink to="/opportunities" variant="secondary" icon={<Compass className="size-4" aria-hidden="true" />}>Explore</ButtonLink>
        </div>
      </div>

      {profile.data && profile.data.completeness.percent < 80 && (
        <Notice tone="info" title={`Your profile is ${profile.data.completeness.percent}% complete`} className="mb-6"
          action={<ButtonLink to="/profile/edit" size="sm">Complete profile</ButtonLink>}>
          Missing: {profile.data.completeness.missing.slice(0, 4).join(', ')}{profile.data.completeness.missing.length > 4 ? '…' : ''}. Complete profiles get better-explained matches.
        </Notice>
      )}

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile to="/projects?view=mine" icon={FolderPlus} label="Your projects" value={projects.data?.total ?? '–'} />
        <StatTile to="/requests" icon={Inbox} label="Requests awaiting you" value={activity.incomingRequests} />
        <StatTile to="/messages" icon={MessageSquare} label="Unread conversations" value={activity.messages} />
        <StatTile to="/notifications" icon={Bell} label="Unread notifications" value={activity.notifications} />
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="teammates-heading">
            <SectionTitle
              title={<span id="teammates-heading" className="inline-flex items-center gap-2"><Sparkles className="size-4 text-brand-300" aria-hidden="true" />Suggested teammates</span>}
              description="People who complement your skills, with the reasons why."
              action={<ButtonLink to="/people" variant="ghost" size="sm">See more <ArrowRight className="size-4" aria-hidden="true" /></ButtonLink>}
            />
            <SuggestedTeammatesPanel />
          </section>
          <section aria-labelledby="my-projects-heading">
            <SectionTitle title={<span id="my-projects-heading">Your projects</span>}
              action={<ButtonLink to="/projects?view=mine" variant="ghost" size="sm">All</ButtonLink>} />
            {projects.loading && !projects.data ? <Spinner /> : projects.error ? <ErrorState message={projects.error.message} onRetry={projects.reload} /> :
              projects.data?.items.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {projects.data.items.slice(0, 4).map((project) => <ProjectCard key={project.id} project={project} />)}
                </div>
              ) : (
                <EmptyState icon={<FolderPlus />} title="No projects yet" description="Post an idea to start recruiting, or join an existing team."
                  action={<ButtonLink to="/projects" variant="secondary">Browse projects</ButtonLink>} />
              )}
          </section>
        </div>
        <aside className="space-y-10">
          <section aria-labelledby="opps-heading">
            <SectionTitle title={<span id="opps-heading">Suggested opportunities</span>} />
            <SuggestedOpportunitiesPanel />
          </section>
          <section aria-labelledby="recent-heading">
            <SectionTitle title={<span id="recent-heading">Recent activity</span>} action={<ButtonLink to="/notifications" variant="ghost" size="sm">All</ButtonLink>} />
            {notifications.data?.items.length ? (
              <ul className="card divide-y divide-line">
                {notifications.data.items.slice(0, 5).map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    {n.link ? <Link to={n.link} className={`text-sm ${n.read ? 'text-muted' : 'font-semibold text-fg'} hover:text-brand-200`}>{n.title}</Link>
                      : <p className="text-sm text-muted">{n.title}</p>}
                    <p className="text-xs text-subtle">{relativeTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-subtle">No activity yet.</p>}
          </section>
        </aside>
      </div>
    </PageContainer>
  )
}
