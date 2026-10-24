import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { BookOpen, FlaskConical, Plus, Search, Users } from 'lucide-react'
import { OpportunityCard } from '../../components/cards'
import { PaperCard } from '../../components/research'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { Avatar, CardSkeleton, EmptyState, ErrorState, Notice, PageHeader, SectionTitle, Spinner } from '../../components/ui/display'
import { Pagination } from '../../components/ui/navigation'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { listOpportunities, searchPapers, searchResearchPeople } from '../../services/opportunities'
import { useAuth } from '../auth/AuthContext'

const EXAMPLES = ['graph neural networks', 'climate modeling', 'web accessibility', 'federated learning', 'low-resource NLP']

function RelatedPeople({ topic }: { topic: string }) {
  const { status } = useAuth()
  const { data, loading, error } = useApi((signal) => searchResearchPeople(topic, 1, signal), [topic], { enabled: status === 'authenticated' && topic.length >= 2 })
  if (status !== 'authenticated') {
    return <p className="text-sm text-muted"><Link to="/login?next=/research" className="link">Log in</Link> to see members with related research interests.</p>
  }
  if (loading && !data) return <Spinner label="Finding people" />
  if (error) return <p className="text-sm text-danger">{error.message}</p>
  if (!data?.items.length) return <p className="text-sm text-subtle">No members list “{topic}” as an interest yet.</p>
  return (
    <ul className="space-y-3">
      {data.items.map((person) => (
        <li key={person.handle}>
          <Link to={`/people/${person.handle}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-surface-2">
            <Avatar name={person.name} src={person.avatar_url} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-fg">{person.name}</span>
              <span className="block truncate text-xs text-subtle">{person.headline ?? person.interests.slice(0, 3).join(', ')}</span>
            </span>
          </Link>
        </li>
      ))}
      {data.total > data.items.length && (
        <li><Link to={`/people?tab=browse&q=${encodeURIComponent(topic)}`} className="link text-sm">See all {data.total}</Link></li>
      )}
    </ul>
  )
}

export default function ResearchPage() {
  useDocumentTitle('Research')
  const [filters, update] = useUrlState({ q: '', field: 'all', page: 1 })
  const [draft, setDraft] = useState(filters.q)
  useEffect(() => setDraft(filters.q), [filters.q])
  const query = filters.q.trim()

  const papers = useApi(
    (signal) => searchPapers({ q: query, field: filters.field as 'all' | 'title' | 'author', page: filters.page }, signal),
    [query, filters.field, filters.page],
    { enabled: query.length >= 2 },
  )
  const collaborations = useApi(
    (signal) => listOpportunities({ type: ['research'], q: query.length >= 2 ? query : undefined, page_size: 4 }, signal),
    [query],
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    update({ q: draft.trim() })
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Research discovery"
        title="Search research and find collaborators"
        description="Search scholarly works by title, topic, keyword or author. Open the original publication, save papers, and connect with members who share the interest."
        actions={<ButtonLink to="/opportunities/new" icon={<Plus className="size-4" aria-hidden="true" />}>Post a collaboration</ButtonLink>}
      />

      <form onSubmit={submit} role="search" className="card mb-8 flex flex-col gap-3 p-4 sm:flex-row">
        <label htmlFor="paper-search" className="sr-only">Search papers</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input id="paper-search" type="search" value={draft} onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. graph neural networks, or an author's name" maxLength={200} className="field h-11 pl-9" />
        </div>
        <Select aria-label="Search in" value={filters.field} onChange={(event) => update({ field: event.target.value })} className="h-11 sm:w-44"
          options={[{ value: 'all', label: 'All fields' }, { value: 'title', label: 'Title only' }, { value: 'author', label: 'Author' }]} />
        <Button type="submit" size="lg" disabled={draft.trim().length < 2}>Search</Button>
      </form>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <section aria-label="Paper results" className="min-w-0">
          {query.length < 2 ? (
            <EmptyState icon={<BookOpen />} title="Start with a topic"
              description="Results come live from OpenAlex, with Crossref as a fallback."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((example) => (
                    <button key={example} type="button" onClick={() => update({ q: example })}
                      className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-line-strong hover:text-fg">
                      {example}
                    </button>
                  ))}
                </div>
              } />
          ) : papers.error ? (
            papers.error.code === 'providers_disabled'
              ? <Notice tone="warning" title="Paper search is turned off">This server has live external data disabled. Collaboration posts below still work.</Notice>
              : <ErrorState title="Paper search unavailable" message={papers.error.message} onRetry={papers.reload} />
          ) : papers.loading && !papers.data ? (
            <div className="space-y-4" role="status" aria-label="Searching papers">{[0, 1, 2].map((i) => <CardSkeleton key={i} lines={4} />)}</div>
          ) : papers.data ? (
            <>
              {papers.data.notice && <Notice tone="info" className="mb-4">{papers.data.notice}</Notice>}
              <p className="mb-3 text-sm text-subtle" aria-live="polite">
                About {papers.data.total.toLocaleString()} results for “{query}”
              </p>
              {papers.data.items.length === 0 ? (
                <EmptyState title="No papers found" description="Try different keywords or search all fields." />
              ) : (
                <div className={`space-y-4 ${papers.loading ? 'opacity-60' : ''}`}>
                  {papers.data.items.map((paper) => <PaperCard key={paper.key} paper={paper} />)}
                </div>
              )}
              <p className="mt-4 text-xs text-subtle">{papers.data.attribution}. Open access is shown only when the source confirms it.</p>
              <Pagination page={papers.data.page} pages={Math.min(papers.data.pages, 50)} onChange={(page) => update({ page })} />
            </>
          ) : null}
        </section>

        <aside className="space-y-6">
          {query.length >= 2 && (
            <section className="card p-5" aria-labelledby="people-heading">
              <h2 id="people-heading" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-fg">
                <Users className="size-4 text-brand-300" aria-hidden="true" /> Members interested in this
              </h2>
              <RelatedPeople topic={query} />
            </section>
          )}
          <section aria-labelledby="collab-heading">
            <SectionTitle title={<span id="collab-heading" className="inline-flex items-center gap-2 text-sm"><FlaskConical className="size-4 text-brand-300" aria-hidden="true" />Collaboration openings</span>}
              action={<ButtonLink to="/opportunities?tab=research" variant="ghost" size="sm">All</ButtonLink>} />
            {collaborations.loading && !collaborations.data ? <Spinner /> :
              collaborations.data?.items.length ? (
                <div className="space-y-3">
                  {collaborations.data.items.map((item) => <OpportunityCard key={item.id} opportunity={item} />)}
                </div>
              ) : <p className="text-sm text-subtle">No open collaborations{query ? ' for this topic' : ''} yet.</p>}
          </section>
        </aside>
      </div>
    </PageContainer>
  )
}
