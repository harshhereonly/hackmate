import { useEffect, useState } from 'react'
import { FolderPlus, Layers } from 'lucide-react'
import { ProjectCard } from '../../components/cards'
import { ChipFilter, TagInput } from '../../components/tags'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Checkbox, Select } from '../../components/ui/Field'
import { EmptyState, ErrorState, GridSkeleton, PageHeader } from '../../components/ui/display'
import { Pagination, SearchInput, Tabs } from '../../components/ui/navigation'
import { useDebouncedValue, useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { listMyProjects, listProjects } from '../../services/projects'
import { MODE_OPTIONS, PROJECT_CATEGORY_OPTIONS, PROJECT_STATUS_OPTIONS, SKILL_SUGGESTIONS } from '../../utils/constants'
import { useAuth } from '../auth/AuthContext'

const DEFAULTS = {
  view: 'browse',
  q: '',
  skills: [] as string[],
  category: [] as string[],
  status: [] as string[],
  mode: [] as string[],
  has_openings: false,
  sort: 'recent',
  page: 1,
}

function MyProjects({ page, onPage }: { page: number; onPage: (page: number) => void }) {
  const { data, loading, error, reload } = useApi((signal) => listMyProjects('all', page, signal), [page])
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (loading && !data) return <GridSkeleton count={3} />
  if (!data?.items.length) {
    return (
      <EmptyState icon={<FolderPlus />} title="You're not on any projects yet"
        description="Post a project to start recruiting, or browse projects and request to join one."
        action={<ButtonLink to="/projects/new">Post a project</ButtonLink>} />
    )
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={onPage} />
    </>
  )
}

export default function ProjectsPage() {
  useDocumentTitle('Projects')
  const { status } = useAuth()
  const [filters, update, reset] = useUrlState(DEFAULTS)
  const [query, setQuery] = useState(filters.q)
  const debounced = useDebouncedValue(query, 350)

  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const browsing = filters.view !== 'mine' || status !== 'authenticated'
  const { data, loading, error, reload } = useApi(
    (signal) =>
      listProjects(
        {
          q: filters.q, skills: filters.skills, category: filters.category, status: filters.status, mode: filters.mode,
          has_openings: filters.has_openings, sort: filters.sort as 'recent' | 'title', page: filters.page, page_size: 12,
        },
        signal,
      ),
    [JSON.stringify({ ...filters, view: undefined })],
    { enabled: browsing },
  )
  const activeFilters = filters.skills.length + filters.category.length + filters.status.length + filters.mode.length + (filters.has_openings ? 1 : 0)

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Student and community projects looking for collaborators. Every listing shows its required skills, team size and status."
        actions={<ButtonLink to={status === 'authenticated' ? '/projects/new' : '/login?next=/projects/new'} icon={<FolderPlus className="size-4" aria-hidden="true" />}>Post a project</ButtonLink>}
      />
      {status === 'authenticated' && (
        <Tabs label="Project views" className="mb-6" value={filters.view as 'browse' | 'mine'} onChange={(view) => update({ view })}
          items={[{ value: 'browse', label: 'Browse all' }, { value: 'mine', label: 'My projects' }]} />
      )}

      {!browsing ? (
        <MyProjects page={filters.page} onPage={(page) => update({ page })} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-5" aria-label="Filters">
            <div className="card space-y-5 p-4">
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Required skills</p>
                <TagInput label="Filter by required skills" value={filters.skills} onChange={(skills) => update({ skills })} suggestions={SKILL_SUGGESTIONS} max={10} placeholder="e.g. Python" />
              </div>
              <ChipFilter label="Status" options={PROJECT_STATUS_OPTIONS} value={filters.status} onChange={(value) => update({ status: value })} />
              <ChipFilter label="Category" options={PROJECT_CATEGORY_OPTIONS} value={filters.category} onChange={(category) => update({ category })} />
              <ChipFilter label="Collaboration" options={MODE_OPTIONS} value={filters.mode} onChange={(mode) => update({ mode })} />
              <Checkbox label="Only projects with open spots" checked={filters.has_openings} onChange={(event) => update({ has_openings: event.target.checked })} />
              {activeFilters > 0 && <Button variant="ghost" size="sm" fullWidth onClick={() => { setQuery(''); reset() }}>Clear all filters</Button>}
            </div>
          </aside>
          <section aria-label="Project results">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row">
              <SearchInput className="flex-1" label="Search projects" value={query} onChange={setQuery} placeholder="Search titles, summaries and skills" />
              <Select aria-label="Sort" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}
                options={[{ value: 'recent', label: 'Newest first' }, { value: 'title', label: 'Title (A–Z)' }]} />
            </div>
            {error ? (
              <ErrorState message={error.message} onRetry={reload} />
            ) : loading && !data ? (
              <GridSkeleton count={6} className="lg:grid-cols-2 xl:grid-cols-3" />
            ) : data && data.items.length === 0 ? (
              <EmptyState icon={<Layers />} title="No projects match"
                description={activeFilters || filters.q ? 'Try a different search or remove some filters.' : 'Be the first to post a project.'}
                action={<ButtonLink to="/projects/new" variant="secondary">Post a project</ButtonLink>} />
            ) : data ? (
              <>
                <p className="mb-3 text-sm text-subtle" aria-live="polite">{data.total} project{data.total === 1 ? '' : 's'}</p>
                <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
                  {data.items.map((project) => <ProjectCard key={project.id} project={project} highlightSkills={filters.skills} />)}
                </div>
                <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
              </>
            ) : null}
          </section>
        </div>
      )}
    </PageContainer>
  )
}
