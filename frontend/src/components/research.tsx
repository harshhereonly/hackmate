import { useState } from 'react'
import { ExternalLink, GitBranch, LockOpen, MessageSquare } from 'lucide-react'
import type { OpenSourceIssue, Paper } from '../types/api'
import { relativeTime } from '../utils/format'
import { Badge } from './ui/display'
import { SaveButton } from './SaveButton'

export function PaperCard({ paper }: { paper: Paper }) {
  const [expanded, setExpanded] = useState(false)
  const authors = paper.authors.length > 4 ? `${paper.authors.slice(0, 4).join(', ')} et al.` : paper.authors.join(', ')
  const abstract = paper.abstract ?? ''
  const long = abstract.length > 320
  return (
    <article className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {paper.open_access === true && (
              <Badge tone="success" icon={<LockOpen className="size-3" aria-hidden="true" />}>Open access (per OpenAlex)</Badge>
            )}
            {paper.type && <Badge tone="outline">{paper.type.replace(/-/g, ' ')}</Badge>}
            {paper.published && <Badge>{paper.published}</Badge>}
          </div>
          <h3 className="text-base font-semibold text-fg">{paper.title}</h3>
          {authors && <p className="mt-1 text-sm text-muted">{authors}</p>}
          {paper.venue && <p className="mt-0.5 text-xs text-subtle italic">{paper.venue}</p>}
        </div>
        <SaveButton compact item={{ item_key: paper.key, title: paper.title, url: paper.url, subtitle: authors || paper.venue, item_type: 'paper' }} />
      </div>
      {abstract ? (
        <div className="mt-3 text-sm leading-relaxed text-muted">
          <p className={expanded ? '' : 'line-clamp-3'}>{abstract}</p>
          {long && (
            <button type="button" className="link mt-1 text-xs" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? 'Show less' : 'Show full abstract'}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-subtle">No abstract available from the source.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-subtle">
        {paper.url && (
          <a href={paper.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
            {paper.doi ? `DOI: ${paper.doi}` : 'Publication page'} <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {paper.open_access_url && paper.open_access_url !== paper.url && (
          <a href={paper.open_access_url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
            Free full text <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {paper.cited_by !== null && <span>Cited by {paper.cited_by.toLocaleString()}</span>}
        <span className="ml-auto">Source: {paper.source === 'openalex' ? 'OpenAlex' : 'Crossref'}</span>
      </div>
    </article>
  )
}

export function IssueCard({ issue }: { issue: OpenSourceIssue }) {
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 text-xs text-subtle">
            <GitBranch className="size-3.5" aria-hidden="true" /> {issue.repository}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-fg">
            <a href={issue.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-200">
              {issue.title}
              <span className="sr-only"> (opens GitHub in a new tab)</span>
            </a>
          </h3>
        </div>
        <SaveButton compact item={{ item_key: issue.key, title: issue.title, url: issue.url, subtitle: issue.repository, item_type: 'issue' }} />
      </div>
      {issue.summary && <p className="mt-2 line-clamp-2 text-sm text-muted">{issue.summary}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
        {issue.labels.slice(0, 4).map((label) => (
          <Badge key={label} tone="outline">{label}</Badge>
        ))}
        <span className="ml-auto inline-flex items-center gap-1">
          <MessageSquare className="size-3.5" aria-hidden="true" /> {issue.comments}
        </span>
        {issue.updated_at && <span>Updated {relativeTime(issue.updated_at)}</span>}
      </div>
    </article>
  )
}
