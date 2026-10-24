import { useEffect, useState } from 'react'
import { BookOpen, Compass, FlaskConical, GitBranch, Info, Plus, Sparkles, Trophy } from 'lucide-react'
import { OpportunityCard, ProjectCard } from '../../components/cards'
import { IssueCard } from '../../components/research'
import { ChipFilter, TagInput } from '../../components/tags'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Checkbox, Select } from '../../components/ui/Field'
import { EmptyState, ErrorState, GridSkeleton, PageHeader, SectionTitle, Spinner } from '../../components/ui/display'
import { Pagination, SearchInput, Tabs } from '../../components/ui/navigation'
import { useDebouncedValue, useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { listOpportunities, searchOpenSource } from '../../services/opportunities'
import { listProjects } from '../../services/projects'
import type { OpportunityType } from '../../types/api'
import { OPPORTUNITY_MODE_OPTIONS, SKILL_SUGGESTIONS } from '../../utils/constants'
import { useAuth } from '../auth/AuthContext'

const DEFAULTS = {
  tab: 'hackathon',
  q: '',
  skills: [] as string[],
  mode: [] as string[],
  timing: 'active',
  sort: 'deadline',
  hide_demo: false,
  page: 1,
}

const TIMING_OPTIONS = [
  { value: 'active', label: 'Upcoming & ongoing' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Happening now' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'Any time' },
]

const TAB_COPY: Record<OpportunityType, { empty: string; icon: typeof Trophy }> = {
  hackathon: { empty: 'No hackathons match. Admins add verified listings with official registration links; check back soon.', icon: Trophy },
  project: { empty: 'No collaboration programs match these filters.', icon: GitBranch },
  research: { empty: 'No research collaborations match. Members can post one.', icon: FlaskConical },
}

function OpenSourcePanel() {
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(query, 500)
  const { data, loading, error, reload } = useApi(
    (signal) => searchOpenSource({ q: debounced, language, page }, signal),
    [debounced, language, page],
  )
  useEffect(() => setPage(1), [debounced, language])

  return (
    <section aria-labelledby="oss-heading" className="mt-12">
      <SectionTitle
        title={<span id="oss-heading" className="inline-flex items-center gap-2"><GitBranch className="size-4 text-brand-300" aria-hidden="true" />Open-source tasks for newcomers</span>}
        description="Live issues labelled “good first issue” on public GitHub repositories."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput className="flex-1" label="Search open-source issues" value={query} onChange={setQuery} placeholder="e.g. documentation, tests, accessibility" />
        <Select aria-label="Repository language" value={language} onChange={(event) => setLanguage(event.target.value)} className="sm:w-48"
          placeholder="Any language"
          options={['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java', 'C++', 'Kotlin', 'Swift', 'Ruby', 'PHP', 'C#'].map((l) => ({ value: l, label: l }))} />
      </div>
      {error ? (
        <ErrorState title="GitHub results unavailable" message={error.message} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner label="Loading GitHub issues" />
      ) : data && data.items.length === 0 ? (
        <EmptyState title="No matching issues" description="Try another search term or language." />
      ) : data ? (
        <>
          <div className={`grid gap-3 md:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
            {data.items.map((issue) => <IssueCard key={issue.key} issue={issue} />)}
          </div>
          <p className="mt-3 text-xs text-subtle">{data.attribution}. Showing up to 1,000 results.</p>
          <Pagination page={data.page} pages={Math.min(data.pages, 30)} onChange={setPage} />
        </>
      ) : null}
    </section>
  )
}

function RecruitingProjects() {
  const { data, loading } = useApi((signal) => listProjects({ status: ['recruiting'], has_openings: true, page_size: 3 }, signal), [])
  if (loading && !data) return null
  if (!data?.items.length) return null
  return (
    <section aria-labelledby="recruiting-heading" className="mb-10">
      <SectionTitle title={<span id="recruiting-heading">Recruiting on HackMate</span>} action={<ButtonLink to="/projects?has_openings=true" variant="ghost" size="sm">See all</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
    </section>
  )
}

export default function OpportunitiesPage() {
  useDocumentTitle('Opportunity Explorer')
  const { status } = useAuth()
  const [filters, update, reset] = useUrlState(DEFAULTS)
  const tab = (['hackathon', 'project', 'research'].includes(filters.tab) ? filters.tab : 'hackathon') as OpportunityType
  const [query, setQuery] = useState(filters.q)
  const debounced = useDebouncedValue(query, 350)

  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data, loading, error, reload } = useApi(
    (signal) =>
      listOpportunities(
        {
          type: [tab], q: filters.q, skills: filters.skills, mode: filters.mode,
          timing: filters.timing as 'active', sort: filters.sort as 'deadline' | 'recent',
          include_demo: !filters.hide_demo, page: filters.page, page_size: 12,
        },
        signal,
      ),
    [tab, JSON.stringify(filters)],
  )
  const copy = TAB_COPY[tab]
  const activeFilters = filters.skills.length + filters.mode.length + (filters.timing !== 'active' ? 1 : 0) + (filters.hide_demo ? 1 : 0)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Opportunity Explorer"
        title="Find something worth building"
        description="Hackathons, collaboration programs and research openings, with dates, deadlines and links to the official source."
        actions={
          <>
            <ButtonLink to="/research" variant="secondary" icon={<BookOpen className="size-4" aria-hidden="true" />}>Search papers</ButtonLink>
            <ButtonLink to={status === 'authenticated' ? '/opportunities/new' : '/login?next=/opportunities/new'} icon={<Plus className="size-4" aria-hidden="true" />}>
              Post research collaboration
            </ButtonLink>
          </>
        }
      />
      <Tabs
        label="Opportunity categories"
        className="mb-6"
        value={tab}
        onChange={(value) => { setQuery(''); update({ tab: value, q: '' }) }}
        items={[
          { value: 'hackathon', label: <span className="inline-flex items-center gap-1.5"><Trophy className="size-4" aria-hidden="true" />Hackathons</span> },
          { value: 'project', label: <span className="inline-flex items-center gap-1.5"><Compass className="size-4" aria-hidden="true" />Projects & collaboration</span> },
          { value: 'research', label: <span className="inline-flex items-center gap-1.5"><FlaskConical className="size-4" aria-hidden="true" />Research</span> },
        ]}
      />

      {tab === 'project' && <RecruitingProjects />}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5" aria-label="Filters">
          <div className="card space-y-5 p-4">
            <div>
              <label htmlFor="timing-filter" className="mb-2 block text-xs font-semibold tracking-wide text-subtle uppercase">When</label>
              <Select id="timing-filter" value={filters.timing} onChange={(event) => update({ timing: event.target.value })} options={TIMING_OPTIONS} />
            </div>
            <ChipFilter label="Format" options={OPPORTUNITY_MODE_OPTIONS} value={filters.mode} onChange={(mode) => update({ mode })} />
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Skills</p>
              <TagInput label="Filter by skills" value={filters.skills} onChange={(skills) => update({ skills })} suggestions={SKILL_SUGGESTIONS} max={10} placeholder="e.g. Python" />
            </div>
            <Checkbox label="Hide demo data" description="Sample listings used for demonstrations." checked={filters.hide_demo} onChange={(event) => update({ hide_demo: event.target.checked })} />
            {activeFilters > 0 && <Button variant="ghost" size="sm" fullWidth onClick={() => { setQuery(''); reset(); update({ tab }) }}>Clear filters</Button>}
          </div>
          <div className="flex gap-2 rounded-xl border border-line p-4 text-xs text-subtle">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>“Verified listing” means an admin added it with the official link. “Organizer feed” items come from a feed published by the organizer. “Demo data” is sample content.</p>
          </div>
        </aside>
        <section aria-label="Opportunity results">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <SearchInput className="flex-1" label="Search opportunities" value={query} onChange={setQuery} placeholder="Search titles, organizers and tags" />
            <Select aria-label="Sort" value={filters.sort} onChange={(event) => update({ sort: event.target.value })} className="sm:w-48"
              options={[{ value: 'deadline', label: 'Soonest deadline' }, { value: 'recent', label: 'Recently added' }]} />
          </div>
          {error ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : loading && !data ? (
            <GridSkeleton count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
          ) : data && data.items.length === 0 ? (
            <EmptyState icon={<copy.icon />} title="Nothing here yet" description={copy.empty}
              action={tab === 'research' ? <ButtonLink to="/opportunities/new" variant="secondary">Post a research collaboration</ButtonLink> : undefined} />
          ) : data ? (
            <>
              <p className="mb-3 text-sm text-subtle" aria-live="polite">{data.total} listing{data.total === 1 ? '' : 's'}</p>
              <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
                {data.items.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}
              </div>
              <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
            </>
          ) : null}
          {tab === 'research' && (
            <div className="mt-8 flex flex-col items-start gap-3 rounded-xl border border-line bg-surface/60 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted"><Sparkles className="mr-1.5 inline size-4 text-brand-300" aria-hidden="true" />Looking for papers? Search OpenAlex and Crossref, and find members with related interests.</p>
              <ButtonLink to="/research" variant="secondary" size="sm">Open research search</ButtonLink>
            </div>
          )}
        </section>
      </div>

      {tab === 'project' && <OpenSourcePanel />}
    </PageContainer>
  )
}
