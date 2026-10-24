import { Link } from 'react-router'
import { Bookmark, ExternalLink, Trash } from 'lucide-react'
import { IconButton } from '../../components/ui/Button'
import { Badge, EmptyState, ErrorState, GridSkeleton, PageHeader } from '../../components/ui/display'
import { Pagination, Tabs } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage } from '../../services/api'
import { listSaved } from '../../services/opportunities'
import type { SavedItem, SavedItemType } from '../../types/api'
import { formatDate } from '../../utils/format'
import { useSaved } from '../saved/SavedContext'

const TYPE_LABELS: Record<SavedItemType, string> = {
  hackathon: 'Hackathon', project: 'Project', research: 'Research', paper: 'Paper', issue: 'Open-source issue',
}

function SavedRow({ item, onRemoved }: { item: SavedItem; onRemoved: () => void }) {
  const { remove } = useSaved()
  const toast = useToast()
  const title = item.internal_path && item.available ? (
    <Link to={item.internal_path} className="font-semibold text-fg hover:text-brand-200">{item.title}</Link>
  ) : item.url ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-fg hover:text-brand-200">
      {item.title} <ExternalLink className="size-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : <span className="font-semibold text-muted">{item.title}</span>

  return (
    <li className="card flex items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge tone="outline">{TYPE_LABELS[item.item_type]}</Badge>
          {!item.available && <Badge tone="danger">No longer available</Badge>}
          <span className="text-xs text-subtle">Saved {formatDate(item.saved_at)}</span>
        </div>
        {title}
        {item.subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.subtitle}</p>}
      </div>
      <IconButton label={`Remove ${item.title} from saved`} onClick={async () => {
        try {
          await remove(item.item_key)
          toast.success('Removed from saved')
          onRemoved()
        } catch (error) {
          toast.error(getErrorMessage(error))
        }
      }}>
        <Trash className="size-4" aria-hidden="true" />
      </IconButton>
    </li>
  )
}

export default function SavedPage() {
  useDocumentTitle('Saved')
  const [filters, update] = useUrlState({ type: 'all', page: 1 })
  const type = filters.type === 'all' ? undefined : (filters.type as SavedItemType)
  const { data, loading, error, reload } = useApi((signal) => listSaved(type, filters.page, signal), [type, filters.page])

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Saved" description="Hackathons, projects, papers and issues you bookmarked." />
      <Tabs label="Saved item types" className="mb-6" value={filters.type} onChange={(value) => update({ type: value })}
        items={[{ value: 'all', label: 'All' }, { value: 'hackathon', label: 'Hackathons' }, { value: 'project', label: 'Projects' },
          { value: 'research', label: 'Research' }, { value: 'paper', label: 'Papers' }, { value: 'issue', label: 'Issues' }]} />
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <GridSkeleton count={3} className="sm:grid-cols-1 lg:grid-cols-1" /> :
        data && data.items.length === 0 ? (
          <EmptyState icon={<Bookmark />} title="Nothing saved yet" description="Use the bookmark button on opportunities, projects and papers to keep them here." />
        ) : data ? (
          <>
            <ul className="space-y-3">
              {data.items.map((item) => <SavedRow key={item.item_key} item={item} onRemoved={reload} />)}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
    </PageContainer>
  )
}
