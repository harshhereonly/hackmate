import { useState } from 'react'
import { useParams } from 'react-router'
import { Briefcase, Calendar, ExternalLink, Flag, GraduationCap, Link2, Pencil, UserPlus } from 'lucide-react'
import { ProjectCard } from '../../components/cards'
import { ReportDialog } from '../../components/ReportDialog'
import { TagList } from '../../components/tags'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Avatar, Badge, EmptyState, ErrorState, PageLoader, SectionTitle } from '../../components/ui/display'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { fetchProfile } from '../../services/profiles'
import { listProjects } from '../../services/projects'
import { AVAILABILITY_OPTIONS, EXPERIENCE_OPTIONS, MODE_OPTIONS, ROLE_OPTIONS, labelFor } from '../../utils/constants'
import { formatDate } from '../../utils/format'
import { useAuth } from '../auth/AuthContext'
import { InviteDialog, MessageButton } from '../projects/dialogs'

function ExternalProfileLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg">
      <Link2 className="size-4" aria-hidden="true" /> {label}
      <ExternalLink className="size-3" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

export default function ProfilePage() {
  const { handle = '' } = useParams()
  const { status } = useAuth()
  const { data: profile, loading, error, reload } = useApi((signal) => fetchProfile(handle, signal), [handle, status])
  const projects = useApi((signal) => listProjects({ member: handle, page_size: 6 }, signal), [handle, status], { enabled: Boolean(profile) })
  const [inviting, setInviting] = useState(false)
  const [reporting, setReporting] = useState(false)
  useDocumentTitle(profile?.name ?? 'Profile')

  if (loading && !profile) return <PageLoader label="Loading profile" />
  if (error) {
    return (
      <PageContainer>
        {error.status === 404 ? (
          <EmptyState
            title="Profile not available"
            description={status === 'authenticated'
              ? "This profile doesn't exist or its owner has made it private."
              : 'This profile is only visible to signed-in members, or it does not exist.'}
            action={status !== 'authenticated' ? <ButtonLink to={`/login?next=/people/${handle}`}>Log in</ButtonLink> : undefined}
          />
        ) : (
          <ErrorState message={error.message} onRetry={reload} />
        )}
      </PageContainer>
    )
  }
  if (!profile) return null

  const links = [
    profile.github_url && { href: profile.github_url, label: 'GitHub' },
    profile.portfolio_url && { href: profile.portfolio_url, label: 'Portfolio' },
    profile.linkedin_url && { href: profile.linkedin_url, label: 'LinkedIn' },
  ].filter(Boolean) as { href: string; label: string }[]

  return (
    <PageContainer>
      <section className="card overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand-500/25 via-brand-500/10 to-transparent" aria-hidden="true" />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Avatar name={profile.name} src={profile.avatar_url} size="xl" className="border-4 border-surface" />
            <div className="flex flex-wrap gap-2">
              {profile.is_self ? (
                <ButtonLink to="/profile/edit" variant="secondary" icon={<Pencil className="size-4" aria-hidden="true" />}>Edit profile</ButtonLink>
              ) : status === 'authenticated' ? (
                <>
                  {profile.can_message && <MessageButton handle={profile.handle} variant="primary" size="md" />}
                  {profile.open_to_collaborate && (
                    <Button variant="secondary" icon={<UserPlus className="size-4" aria-hidden="true" />} onClick={() => setInviting(true)}>
                      Invite to project
                    </Button>
                  )}
                  <Button variant="ghost" icon={<Flag className="size-4" aria-hidden="true" />} onClick={() => setReporting(true)}>Report</Button>
                </>
              ) : (
                <ButtonLink to={`/login?next=/people/${profile.handle}`}>Log in to connect</ButtonLink>
              )}
            </div>
          </div>
          <div className="mt-4">
            <h1 className="text-2xl font-bold text-fg">{profile.name}</h1>
            <p className="text-sm text-subtle">@{profile.handle}</p>
            {profile.headline && <p className="mt-2 text-base text-muted">{profile.headline}</p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-subtle">
              {profile.institution && <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-4" aria-hidden="true" />{profile.institution}</span>}
              {profile.background && <span className="inline-flex items-center gap-1.5"><Briefcase className="size-4" aria-hidden="true" />{profile.background}</span>}
              <span className="inline-flex items-center gap-1.5"><Calendar className="size-4" aria-hidden="true" />Joined {formatDate(profile.joined_at)}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.open_to_collaborate ? <Badge tone="success">Open to collaborate</Badge> : <Badge tone="warning">Not looking right now</Badge>}
              {profile.experience_level && <Badge tone="brand">{labelFor(EXPERIENCE_OPTIONS, profile.experience_level)}</Badge>}
              {profile.availability && <Badge>{labelFor(AVAILABILITY_OPTIONS, profile.availability)}</Badge>}
              {profile.collaboration_mode && <Badge tone="outline">{labelFor(MODE_OPTIONS, profile.collaboration_mode)}</Badge>}
            </div>
            {links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {links.map((link) => <ExternalProfileLink key={link.label} {...link} />)}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6" aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-lg font-semibold text-fg">About</h2>
            {profile.bio ? (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted">{profile.bio}</p>
            ) : (
              <p className="mt-3 text-sm text-subtle">{profile.is_self ? 'Add a short bio so people know what you like to build.' : 'No bio yet.'}</p>
            )}
          </section>
          <section aria-labelledby="projects-heading">
            <SectionTitle title={<span id="projects-heading">Projects</span>} />
            {projects.loading && !projects.data ? (
              <p className="text-sm text-subtle">Loading projects…</p>
            ) : projects.data && projects.data.items.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {projects.data.items.map((project) => <ProjectCard key={project.id} project={project} />)}
              </div>
            ) : (
              <EmptyState title="No projects yet" className="py-8" />
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <section className="card p-5" aria-labelledby="skills-heading">
            <h2 id="skills-heading" className="text-sm font-semibold text-fg">Skills</h2>
            {profile.skills.length ? <TagList tags={profile.skills} max={30} className="mt-3" /> : <p className="mt-2 text-sm text-subtle">None listed.</p>}
          </section>
          <section className="card p-5" aria-labelledby="interests-heading">
            <h2 id="interests-heading" className="text-sm font-semibold text-fg">Interests</h2>
            {profile.interests.length ? <TagList tags={profile.interests} max={20} tone="muted" className="mt-3" label="Interests" /> : <p className="mt-2 text-sm text-subtle">None listed.</p>}
          </section>
          <section className="card p-5" aria-labelledby="roles-heading">
            <h2 id="roles-heading" className="text-sm font-semibold text-fg">Preferred roles</h2>
            {profile.preferred_roles.length ? (
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {profile.preferred_roles.map((role) => <li key={role}>{labelFor(ROLE_OPTIONS, role)}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-subtle">None listed.</p>}
          </section>
        </aside>
      </div>

      {!profile.is_self && status === 'authenticated' && (
        <>
          <InviteDialog open={inviting} onClose={() => setInviting(false)} handle={profile.handle} name={profile.name} />
          <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={profile.handle} targetLabel={profile.name} />
        </>
      )}
    </PageContainer>
  )
}
