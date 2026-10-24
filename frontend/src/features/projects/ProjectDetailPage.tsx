import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Calendar,
  ExternalLink,
  Flag,
  LogOut,
  MessageSquare,
  Pencil,
  Sparkles,
  Trash,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { PersonLink, ProjectStatusBadge } from '../../components/cards'
import { MatchExplanation, ScorePill } from '../../components/MatchExplanation'
import { ReportDialog } from '../../components/ReportDialog'
import { SaveButton } from '../../components/SaveButton'
import { TagList } from '../../components/tags'
import { Button, ButtonLink, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Avatar, Badge, EmptyState, ErrorState, Notice, PageLoader, SectionTitle, Spinner } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage } from '../../services/api'
import { deleteProject, fetchMembers, fetchProject, leaveProject, listProjectRequests, removeMember } from '../../services/projects'
import { withdrawRequest } from '../../services/requests'
import { fetchProjectCandidates, openProjectConversation } from '../../services/social'
import type { ProjectDetail, ProjectMember } from '../../types/api'
import { MODE_OPTIONS, PREFERRED_EXPERIENCE_OPTIONS, PROJECT_CATEGORY_OPTIONS, ROLE_OPTIONS, labelFor } from '../../utils/constants'
import { formatDate } from '../../utils/format'
import { useAuth } from '../auth/AuthContext'
import { RequestCard } from '../requests/RequestCard'
import { InviteDialog, JoinRequestDialog } from './dialogs'

function TeamMeter({ project }: { project: ProjectDetail }) {
  const percent = Math.min(100, (project.member_count / project.max_team_size) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-fg">Team size</span>
        <span className="text-muted">{project.member_count} of {project.max_team_size}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Team filled"
        aria-valuemin={0} aria-valuemax={project.max_team_size} aria-valuenow={project.member_count}>
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-subtle">{project.open_spots > 0 ? `${project.open_spots} open spot${project.open_spots === 1 ? '' : 's'}` : 'The team is full'}</p>
    </div>
  )
}

function MembersList({ project, members, onRemoved }: { project: ProjectDetail; members: ProjectMember[]; onRemoved: () => void }) {
  const toast = useToast()
  const [removing, setRemoving] = useState<ProjectMember | null>(null)
  return (
    <>
      <ul className="divide-y divide-line">
        {members.map((member) => (
          <li key={member.person.handle ?? member.person.name} className="flex items-center justify-between gap-3 py-3">
            <PersonLink person={member.person} size="sm"
              subtitle={[member.role === 'owner' ? 'Owner' : 'Member', member.functional_role && labelFor(ROLE_OPTIONS, member.functional_role)].filter(Boolean).join(' · ')} />
            <div className="flex items-center gap-1">
              {member.is_you && <Badge tone="brand">You</Badge>}
              {project.viewer.is_owner && member.role !== 'owner' && member.person.handle && (
                <IconButton size="sm" label={`Remove ${member.person.name} from the team`} onClick={() => setRemoving(member)}>
                  <X className="size-4" aria-hidden="true" />
                </IconButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.person.name ?? 'member'}?`}
        description="They'll lose access to the team chat and be notified."
        confirmLabel="Remove member"
        onConfirm={async () => {
          if (!removing?.person.handle) return
          await removeMember(project.id, removing.person.handle)
          toast.success(`${removing.person.name} was removed.`)
          onRemoved()
        }}
      />
    </>
  )
}

function OwnerRequests({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const { data, loading, error, reload, setData } = useApi((signal) => listProjectRequests(project.id, 'pending', signal), [project.id])
  if (loading && !data) return <Spinner label="Loading requests" />
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data?.items.length) return <p className="text-sm text-subtle">No pending requests or invitations.</p>
  return (
    <div className="space-y-3">
      {data.items.map((request) => (
        <RequestCard key={request.id} request={request} showProject={false}
          onChange={(updated) => {
            setData((current) => current && { ...current, items: current.items.filter((r) => r.id !== updated.id) })
            onChange()
          }} />
      ))}
    </div>
  )
}

function Candidates({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useApi((signal) => fetchProjectCandidates(projectId, 6, signal), [projectId])
  const [inviting, setInviting] = useState<{ handle: string; name: string } | null>(null)
  if (loading && !data) return <Spinner label="Finding candidates" />
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data) return null
  return (
    <div className="space-y-3">
      {data.notice && <Notice tone="info">{data.notice}</Notice>}
      {data.items.length === 0 ? (
        <p className="text-sm text-subtle">No candidates yet. As more members complete their profiles, suggestions will appear here.</p>
      ) : (
        data.items.map((item) => (
          <div key={item.person.handle} className="rounded-xl border border-line bg-surface-2/50 p-4">
            <div className="flex items-start gap-3">
              <Avatar name={item.person.name} src={item.person.avatar_url} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/people/${item.person.handle}`} className="truncate font-semibold text-fg hover:text-brand-200">{item.person.name}</Link>
                  <ScorePill score={item.score} />
                </div>
                {item.person.headline && <p className="truncate text-xs text-subtle">{item.person.headline}</p>}
                <TagList tags={item.person.skills} max={5} className="mt-2" />
                <div className="mt-3"><MatchExplanation match={item} compact /></div>
                <Button size="sm" variant="secondary" className="mt-3" icon={<UserPlus className="size-4" aria-hidden="true" />}
                  onClick={() => setInviting({ handle: item.person.handle, name: item.person.name })}>
                  Invite
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
      <p className="text-xs text-subtle">{data.method_description}</p>
      {inviting && <InviteDialog open onClose={() => setInviting(null)} handle={inviting.handle} name={inviting.name} />}
    </div>
  )
}

export default function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const { status } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: project, loading, error, reload } = useApi((signal) => fetchProject(projectId, signal), [projectId, status])
  const members = useApi((signal) => fetchMembers(projectId, signal), [projectId, status], { enabled: Boolean(project) })
  const [dialog, setDialog] = useState<'join' | 'delete' | 'leave' | 'report' | null>(null)
  const [openingChat, setOpeningChat] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  useDocumentTitle(project?.title ?? 'Project')

  if (loading && !project) return <PageLoader label="Loading project" />
  if (error) {
    return (
      <PageContainer>
        {error.status === 404
          ? <EmptyState title="Project not found" description="It may have been deleted or removed." action={<ButtonLink to="/projects">Browse projects</ButtonLink>} />
          : <ErrorState message={error.message} onRetry={reload} />}
      </PageContainer>
    )
  }
  if (!project) return null

  const refreshAll = () => {
    reload()
    members.reload()
  }
  const viewer = project.viewer
  const pending = viewer.request?.status === 'pending' && viewer.request.kind === 'application' ? viewer.request : null

  const openChat = async () => {
    setOpeningChat(true)
    try {
      const conversation = await openProjectConversation(project.id)
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setOpeningChat(false)
    }
  }

  return (
    <PageContainer>
      {project.is_removed && (
        <Notice tone="danger" title="Removed by moderators" className="mb-6">
          This project is hidden from other members.{project.removed_reason ? ` Reason: ${project.removed_reason}` : ''}
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-6">
            <div className="flex flex-wrap items-center gap-2">
              <ProjectStatusBadge status={project.status} />
              <Badge tone="outline">{labelFor(PROJECT_CATEGORY_OPTIONS, project.category)}</Badge>
              <Badge>{labelFor(MODE_OPTIONS, project.collaboration_mode)}</Badge>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-fg sm:text-3xl">{project.title}</h1>
              <SaveButton compact item={{ item_key: `project:${project.id}`, title: project.title, item_type: 'project' }} />
            </div>
            <p className="mt-2 text-muted">{project.summary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-subtle">
              <PersonLink person={project.owner} size="sm" subtitle="Project owner" />
              <span className="inline-flex items-center gap-1.5"><Calendar className="size-4" aria-hidden="true" />Posted {formatDate(project.created_at)}</span>
              {project.repo_url && (
                <a href={project.repo_url} target="_blank" rel="noopener noreferrer nofollow" className="link inline-flex items-center gap-1">
                  Project link <ExternalLink className="size-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
            {project.opportunity && (
              <Link to={`/opportunities/${project.opportunity.id}`} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-line-strong hover:text-fg">
                <Trophy className="size-4 text-brand-300" aria-hidden="true" /> Team for {project.opportunity.title}
              </Link>
            )}
          </section>

          <section className="card p-6" aria-labelledby="description-heading">
            <h2 id="description-heading" className="text-lg font-semibold">Description</h2>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted">{project.description}</p>
            <h3 className="mt-6 text-sm font-semibold text-fg">Required skills</h3>
            <TagList tags={project.required_skills} max={20} className="mt-2" label="Required skills" />
            {project.roles_needed.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-fg">Roles needed</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {project.roles_needed.map((role) => <Badge key={role} tone="brand">{labelFor(ROLE_OPTIONS, role)}</Badge>)}
                </div>
              </>
            )}
            <p className="mt-5 text-sm text-subtle">Preferred experience: {labelFor(PREFERRED_EXPERIENCE_OPTIONS, project.preferred_experience)}</p>
          </section>

          {viewer.is_owner && (
            <section aria-labelledby="requests-heading">
              <SectionTitle title={<span id="requests-heading">Pending requests and invitations</span>} action={<ButtonLink to="/requests" variant="ghost" size="sm">All requests</ButtonLink>} />
              <OwnerRequests project={project} onChange={refreshAll} />
            </section>
          )}
          {(viewer.is_owner || viewer.is_member) && project.status !== 'completed' && (
            <section aria-labelledby="candidates-heading">
              <SectionTitle
                title={<span id="candidates-heading" className="inline-flex items-center gap-2"><Sparkles className="size-4 text-brand-300" aria-hidden="true" />Suggested candidates</span>}
                description="Ranked by how well each person fills your team's gaps."
              />
              <Candidates projectId={project.id} />
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card space-y-5 p-5" aria-label="Join this project">
            <TeamMeter project={project} />
            {status !== 'authenticated' ? (
              <ButtonLink to={`/login?next=/projects/${project.id}`} fullWidth>Log in to request to join</ButtonLink>
            ) : viewer.is_owner ? (
              <div className="grid gap-2">
                <ButtonLink to={`/projects/${project.id}/edit`} variant="secondary" fullWidth icon={<Pencil className="size-4" aria-hidden="true" />}>Edit project</ButtonLink>
                <Button variant="secondary" fullWidth loading={openingChat} icon={<MessageSquare className="size-4" aria-hidden="true" />} onClick={openChat}>Team chat</Button>
                <Button variant="danger" fullWidth icon={<Trash className="size-4" aria-hidden="true" />} onClick={() => setDialog('delete')}>Delete project</Button>
              </div>
            ) : viewer.is_member ? (
              <div className="grid gap-2">
                <Badge tone="success" className="justify-center py-1.5">You're on this team</Badge>
                <Button variant="secondary" fullWidth loading={openingChat} icon={<MessageSquare className="size-4" aria-hidden="true" />} onClick={openChat}>Team chat</Button>
                <Button variant="ghost" fullWidth icon={<LogOut className="size-4" aria-hidden="true" />} onClick={() => setDialog('leave')}>Leave team</Button>
              </div>
            ) : pending ? (
              <div className="grid gap-2">
                <Badge tone="warning" className="justify-center py-1.5">Your request is pending</Badge>
                <Button variant="secondary" fullWidth loading={withdrawing} onClick={async () => {
                  setWithdrawing(true)
                  try {
                    await withdrawRequest(pending.id)
                    toast.info('Request withdrawn.')
                    reload()
                  } catch (err) {
                    toast.error(getErrorMessage(err))
                  } finally {
                    setWithdrawing(false)
                  }
                }}>Withdraw request</Button>
              </div>
            ) : viewer.can_request ? (
              <Button fullWidth size="lg" icon={<Users className="size-4" aria-hidden="true" />} onClick={() => setDialog('join')}>Request to join</Button>
            ) : (
              <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted">{viewer.cannot_request_reason}</p>
            )}
            {viewer.request && viewer.request.status !== 'pending' && !viewer.is_member && (
              <p className="text-xs text-subtle">Your last request was {viewer.request.status}.</p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="members-heading">
            <h2 id="members-heading" className="text-sm font-semibold text-fg">Team members</h2>
            {members.loading && !members.data ? <Spinner label="Loading members" className="mt-3" /> :
              members.error ? <p className="mt-2 text-sm text-danger">{members.error.message}</p> :
                members.data && <MembersList project={project} members={members.data} onRemoved={refreshAll} />}
          </section>

          {status === 'authenticated' && !viewer.is_owner && (
            <Button variant="ghost" size="sm" icon={<Flag className="size-4" aria-hidden="true" />} onClick={() => setDialog('report')}>Report this project</Button>
          )}
        </aside>
      </div>

      <JoinRequestDialog open={dialog === 'join'} onClose={() => setDialog(null)} project={project} onSubmitted={() => reload()} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Delete this project?"
        description="This permanently deletes the project, its team chat and all requests. Members will be notified. This can't be undone."
        confirmLabel="Delete project"
        onConfirm={async () => {
          await deleteProject(project.id)
          toast.success('Project deleted.')
          navigate('/projects?view=mine', { replace: true })
        }}
      />
      <ConfirmDialog
        open={dialog === 'leave'}
        onClose={() => setDialog(null)}
        title="Leave this team?"
        description="You'll lose access to the team chat. You can request to join again later if there's space."
        confirmLabel="Leave team"
        onConfirm={async () => {
          await leaveProject(project.id)
          toast.info('You left the team.')
          refreshAll()
        }}
      />
      <ReportDialog open={dialog === 'report'} onClose={() => setDialog(null)} targetType="project" targetId={project.id} targetLabel={project.title} />
    </PageContainer>
  )
}
