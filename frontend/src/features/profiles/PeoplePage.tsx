import { useEffect, useState } from 'react'
import { SlidersHorizontal, Sparkles, UserPlus, Users } from 'lucide-react'
import { ProfileCard } from '../../components/cards'
import { MatchExplanation, ScorePill } from '../../components/MatchExplanation'
import { ChipFilter, TagInput } from '../../components/tags'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Checkbox, Select } from '../../components/ui/Field'
import { EmptyState, ErrorState, GridSkeleton, Notice, PageHeader } from '../../components/ui/display'
import { Pagination, SearchInput, Tabs } from '../../components/ui/navigation'
import { useDebouncedValue, useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { listProfiles } from '../../services/profiles'
import { fetchSuggestedTeammates } from '../../services/social'
import { PageContainer } from '../../layouts/RootLayout'
import {
  AVAILABILITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  INTEREST_SUGGESTIONS,
  MODE_OPTIONS,
  ROLE_OPTIONS,
  SKILL_SUGGESTIONS,
} from '../../utils/constants'
import { InviteDialog, MessageButton } from '../projects/dialogs'

const DEFAULTS = {
  tab: 'suggested',
  q: '',
  skills: [] as string[],
  skills_mode: 'any',
  interests: [] as string[],
  experience: [] as string[],
  roles: [] as string[],
  availability: [] as string[],
  mode: [] as string[],
  open_only: false,
  sort: 'recent',
  page: 1,
}

function PersonActions({ handle, name }: { handle: string; name: string }) {
  const [inviting, setInviting] = useState(false)
  return (
    <>
      <MessageButton handle={handle} />
      <Button variant="ghost" size="sm" icon={<UserPlus className="size-4" aria-hidden="true" />} onClick={() => setInviting(true)}>
        Invite
      </Button>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} handle={handle} name={name} />
    </>
  )
}

function SuggestedTab() {
  const { data, loading, error, reload } = useApi((signal) => fetchSuggestedTeammates(12, signal), [])
  if (loading && !data) return <GridSkeleton count={6} />
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data) return null
  return (
    <div className="space-y-5">
      <Notice tone="info">
        {data.method_description}
      </Notice>
      {data.notice && (
        <Notice tone="warning" action={<ButtonLink to="/profile/edit" size="sm" variant="secondary">Edit profile</ButtonLink>}>
          {data.notice}
        </Notice>
      )}
      {data.items.length === 0 ? (
        <EmptyState icon={<Users />} title="No suggestions yet" description="As more members join and complete their profiles, suggestions will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item) => (
            <ProfileCard
              key={item.person.handle}
              profile={item.person}
              footer={
                <div className="relative z-10 mt-4 space-y-2 border-t border-line pt-4">
                  <ScorePill score={item.score} />
                  <MatchExplanation match={item} compact />
                </div>
              }
              action={<PersonActions handle={item.person.handle} name={item.person.name} />}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DirectoryTab({ filters, update, reset }: {
  filters: typeof DEFAULTS
  update: (patch: Partial<typeof DEFAULTS>) => void
  reset: () => void
}) {
  const [query, setQuery] = useState(filters.q)
  const debounced = useDebouncedValue(query, 350)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data, loading, error, reload } = useApi(
    (signal) =>
      listProfiles(
        {
          q: filters.q,
          skills: filters.skills,
          skills_mode: filters.skills_mode as 'any' | 'all',
          interests: filters.interests,
          experience: filters.experience,
          roles: filters.roles,
          availability: filters.availability,
          mode: filters.mode,
          open_only: filters.open_only,
          sort: filters.sort as 'recent' | 'name',
          page: filters.page,
          page_size: 12,
        },
        signal,
      ),
    [JSON.stringify({ ...filters, tab: undefined })],
  )

  const activeCount = [filters.skills, filters.interests, filters.experience, filters.roles, filters.availability, filters.mode]
    .filter((list) => list.length).length + (filters.open_only ? 1 : 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className={`${showFilters ? 'block' : 'hidden'} space-y-6 lg:block`} aria-label="Filters">
        <div className="card space-y-5 p-4">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Skills</p>
            <TagInput label="Filter by skills" value={filters.skills} onChange={(skills) => update({ skills })} suggestions={SKILL_SUGGESTIONS} max={10} placeholder="e.g. React" />
            {filters.skills.length > 1 && (
              <Select
                aria-label="Skill matching"
                className="mt-2 h-9 text-xs"
                value={filters.skills_mode}
                onChange={(event) => update({ skills_mode: event.target.value })}
                options={[{ value: 'any', label: 'Has any of these skills' }, { value: 'all', label: 'Has all of these skills' }]}
              />
            )}
          </div>
          <ChipFilter label="Experience" options={EXPERIENCE_OPTIONS} value={filters.experience} onChange={(experience) => update({ experience })} />
          <ChipFilter label="Preferred role" options={ROLE_OPTIONS} value={filters.roles} onChange={(roles) => update({ roles })} />
          <ChipFilter label="Availability" options={AVAILABILITY_OPTIONS.filter((o) => o.value !== 'unavailable')} value={filters.availability} onChange={(availability) => update({ availability })} />
          <ChipFilter label="Collaboration mode" options={MODE_OPTIONS} value={filters.mode} onChange={(mode) => update({ mode })} />
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Interests</p>
            <TagInput label="Filter by interests" value={filters.interests} onChange={(interests) => update({ interests })} suggestions={INTEREST_SUGGESTIONS} max={10} placeholder="e.g. Climate" />
          </div>
          <Checkbox label="Only people open to collaborate" checked={filters.open_only} onChange={(event) => update({ open_only: event.target.checked })} />
          {activeCount > 0 && <Button variant="ghost" size="sm" onClick={reset} fullWidth>Clear all filters</Button>}
        </div>
      </aside>

      <section aria-label="Directory results">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <SearchInput className="flex-1" label="Search people" value={query} onChange={setQuery} placeholder="Search by name, @username, skill or college" />
          <div className="flex gap-2">
            <Select aria-label="Sort" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}
              options={[{ value: 'recent', label: 'Recently active' }, { value: 'name', label: 'Name (A–Z)' }]} />
            <Button variant="secondary" className="lg:hidden" icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
              onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              Filters{activeCount ? ` (${activeCount})` : ''}
            </Button>
          </div>
        </div>
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : loading && !data ? (
          <GridSkeleton count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
        ) : data && data.items.length === 0 ? (
          <EmptyState icon={<Users />} title="No members match these filters"
            description="Try removing a filter or searching for a different skill."
            action={activeCount || filters.q ? <Button variant="secondary" onClick={() => { setQuery(''); reset() }}>Clear search and filters</Button> : undefined} />
        ) : data ? (
          <>
            <p className="mb-3 text-sm text-subtle" aria-live="polite">{data.total} member{data.total === 1 ? '' : 's'}</p>
            <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
              {data.items.map((profile) => (
                <ProfileCard key={profile.handle} profile={profile} action={<PersonActions handle={profile.handle} name={profile.name} />} />
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
      </section>
    </div>
  )
}

export default function PeoplePage() {
  useDocumentTitle('Find teammates')
  const [filters, update, reset] = useUrlState(DEFAULTS)
  return (
    <PageContainer>
      <PageHeader
        title="Find teammates"
        description="Discover people whose skills complement yours. Suggestions explain why each person might be a good fit."
        actions={<ButtonLink to="/profile/edit" variant="secondary">Improve my matches</ButtonLink>}
      />
      <Tabs
        label="Teammate views"
        className="mb-6"
        value={filters.tab as 'suggested' | 'browse'}
        onChange={(tab) => update({ tab })}
        items={[
          { value: 'suggested', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" aria-hidden="true" />Suggested for you</span> },
          { value: 'browse', label: <span className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden="true" />Browse everyone</span> },
        ]}
      />
      {filters.tab === 'browse' ? <DirectoryTab filters={filters} update={update} reset={reset} /> : <SuggestedTab />}
    </PageContainer>
  )
}
