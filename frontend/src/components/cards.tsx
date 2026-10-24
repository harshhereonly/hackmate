import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CircleCheck, Globe, MapPin, ShieldCheck, Users } from 'lucide-react'
import type { Opportunity, PersonSummary, ProfileCard as ProfileCardData, ProjectListItem } from '../types/api'
import {
  AVAILABILITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  MODE_OPTIONS,
  OPPORTUNITY_MODE_OPTIONS,
  PROJECT_CATEGORY_OPTIONS,
  ROLE_OPTIONS,
  SOURCE_LABELS,
  TIMING_LABELS,
  labelFor,
} from '../utils/constants'
import { daysUntil, formatDate, formatDateRange, relativeTime } from '../utils/format'
import { cn } from '../utils/cn'
import { Avatar, Badge, type BadgeTone } from './ui/display'
import { TagList } from './tags'
import { SaveButton } from './SaveButton'

export function PersonLink({ person, size = 'sm', subtitle }: { person: PersonSummary; size?: 'xs' | 'sm' | 'md'; subtitle?: string }) {
  const content = (
    <>
      <Avatar name={person.name} src={person.avatar_url} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{person.name}</span>
        {(subtitle ?? person.headline) && <span className="block truncate text-xs text-subtle">{subtitle ?? person.headline}</span>}
      </span>
    </>
  )
  if (!person.handle || person.is_private) {
    return <span className="flex min-w-0 items-center gap-2.5" title="This member's profile is private">{content}</span>
  }
  return (
    <Link to={`/people/${person.handle}`} className="flex min-w-0 items-center gap-2.5 rounded-lg hover:[&_span.block:first-child]:text-brand-200">
      {content}
    </Link>
  )
}

const STATUS_TONES: Record<ProjectListItem['status'], BadgeTone> = { recruiting: 'success', active: 'info', completed: 'neutral' }

export function ProjectStatusBadge({ status }: { status: ProjectListItem['status'] }) {
  return <Badge tone={STATUS_TONES[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>
}

export function ProjectCard({ project, highlightSkills }: { project: ProjectListItem; highlightSkills?: string[] }) {
  return (
    <article className="card-interactive group relative flex h-full flex-col p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        <Badge tone="outline">{labelFor(PROJECT_CATEGORY_OPTIONS, project.category)}</Badge>
        {project.is_removed && <Badge tone="danger">Removed</Badge>}
      </div>
      <h3 className="text-base font-semibold text-fg">
        <Link to={`/projects/${project.id}`} className="after:absolute after:inset-0 after:rounded-xl group-hover:text-brand-200">
          {project.title}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-muted">{project.summary}</p>
      <TagList tags={project.required_skills} max={5} className="mt-4" label="Required skills" highlight={highlightSkills} />
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-xs text-subtle">
        <div className="relative z-10 min-w-0">
          <PersonLink person={project.owner} size="xs" subtitle={`Posted ${relativeTime(project.created_at)}`} />
        </div>
        <span className="inline-flex shrink-0 items-center gap-1" title="Current team size / maximum">
          <Users className="size-3.5" aria-hidden="true" />
          {project.member_count}/{project.max_team_size}
          <span className="sr-only">members</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-subtle">
        {labelFor(MODE_OPTIONS, project.collaboration_mode)} ·{' '}
        {project.open_spots > 0 ? `${project.open_spots} open spot${project.open_spots === 1 ? '' : 's'}` : 'Team full'}
      </p>
    </article>
  )
}

export function ProfileCard({ profile, action, footer }: { profile: ProfileCardData; action?: ReactNode; footer?: ReactNode }) {
  return (
    <article className="card-interactive group relative flex h-full flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={profile.name} src={profile.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-fg">
            <Link to={`/people/${profile.handle}`} className="after:absolute after:inset-0 after:rounded-xl group-hover:text-brand-200">
              {profile.name}
            </Link>
          </h3>
          <p className="truncate text-xs text-subtle">@{profile.handle}</p>
          {profile.headline && <p className="line-clamp-2 text-sm text-muted">{profile.headline}</p>}
          {profile.institution && <p className="mt-0.5 truncate text-xs text-subtle">{profile.institution}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {profile.experience_level && <Badge tone="brand">{labelFor(EXPERIENCE_OPTIONS, profile.experience_level)}</Badge>}
        {profile.availability && <Badge>{labelFor(AVAILABILITY_OPTIONS, profile.availability)}</Badge>}
        {profile.collaboration_mode && <Badge tone="outline">{labelFor(MODE_OPTIONS, profile.collaboration_mode)}</Badge>}
        {!profile.open_to_collaborate && <Badge tone="warning">Not looking right now</Badge>}
      </div>
      <TagList tags={profile.skills} max={6} className="mt-3" />
      {profile.preferred_roles.length > 0 && (
        <p className="mt-3 text-xs text-subtle">
          Prefers: {profile.preferred_roles.map((r) => labelFor(ROLE_OPTIONS, r)).join(', ')}
        </p>
      )}
      {footer}
      {action && <div className="relative z-10 mt-4 flex gap-2 border-t border-line pt-4">{action}</div>}
    </article>
  )
}

const TIMING_TONES: Record<Opportunity['timing'], BadgeTone> = {
  upcoming: 'info', ongoing: 'success', open: 'success', closed: 'neutral', past: 'neutral', unscheduled: 'outline',
}

export function OpportunityBadges({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opportunity.is_demo && <Badge tone="warning">Demo data</Badge>}
      {opportunity.verified && !opportunity.is_demo && (
        <Badge tone="success" icon={<ShieldCheck className="size-3" aria-hidden="true" />}>Verified listing</Badge>
      )}
      {!opportunity.verified && !opportunity.is_demo && <Badge tone="outline">{SOURCE_LABELS[opportunity.source.kind]}</Badge>}
      <Badge tone={TIMING_TONES[opportunity.timing]}>{TIMING_LABELS[opportunity.timing]}</Badge>
      {opportunity.is_removed && <Badge tone="danger">Removed</Badge>}
    </div>
  )
}

export function DeadlineText({ deadline }: { deadline: string | null }) {
  if (!deadline) return null
  const days = daysUntil(deadline)
  const urgent = days !== null && days >= 0 && days <= 7
  return (
    <span className={cn('inline-flex items-center gap-1', urgent ? 'text-warning' : 'text-subtle')}>
      <CalendarClock className="size-3.5" aria-hidden="true" />
      {days !== null && days < 0 ? `Closed ${formatDate(deadline)}` : `Deadline ${formatDate(deadline)}${urgent ? ` (${days === 0 ? 'today' : `in ${days}d`})` : ''}`}
    </span>
  )
}

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const dates = formatDateRange(opportunity.starts_at, opportunity.ends_at)
  return (
    <article className="card-interactive group relative flex h-full flex-col p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <OpportunityBadges opportunity={opportunity} />
        <div className="relative z-10 -mt-1 -mr-2">
          <SaveButton compact item={{ item_key: opportunity.key, title: opportunity.title, item_type: opportunity.type }} />
        </div>
      </div>
      <h3 className="text-base font-semibold text-fg">
        <Link to={`/opportunities/${opportunity.id}`} className="after:absolute after:inset-0 after:rounded-xl group-hover:text-brand-200">
          {opportunity.title}
        </Link>
      </h3>
      {opportunity.organizer && <p className="mt-0.5 text-xs text-subtle">{opportunity.organizer}</p>}
      <p className="mt-2 line-clamp-2 text-sm text-muted">{opportunity.summary}</p>
      <TagList tags={opportunity.skills} max={4} className="mt-4" />
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-4 text-xs text-subtle">
        {dates && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {dates}
          </span>
        )}
        <DeadlineText deadline={opportunity.deadline} />
        {opportunity.mode && (
          <span className="inline-flex items-center gap-1">
            {opportunity.mode === 'online' ? <Globe className="size-3.5" aria-hidden="true" /> : <MapPin className="size-3.5" aria-hidden="true" />}
            {opportunity.location || labelFor(OPPORTUNITY_MODE_OPTIONS, opportunity.mode)}
          </span>
        )}
        {opportunity.teams_forming > 0 && (
          <span className="inline-flex items-center gap-1 text-success">
            <CircleCheck className="size-3.5" aria-hidden="true" />
            {opportunity.teams_forming} team{opportunity.teams_forming === 1 ? '' : 's'} forming
          </span>
        )}
      </div>
    </article>
  )
}
