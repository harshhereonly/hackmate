import { useId, useState } from 'react'
import { ChevronDown, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { Explained } from '../types/api'
import { cn } from '../utils/cn'

const CONFIDENCE_LABEL = { high: 'Plenty of profile detail', medium: 'Some profile detail', low: 'Limited profile detail' }

export function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted">Not scored</span>
  const tone = score >= 70 ? 'bg-success/15 text-success' : score >= 45 ? 'bg-brand-500/15 text-brand-200' : 'bg-surface-3 text-muted'
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums', tone)} title="Rule-based match score out of 100">
      {score}<span className="font-normal opacity-70">/100 match</span>
    </span>
  )
}

/** Shows why something was recommended: reasons, cautions and the point breakdown. */
export function MatchExplanation({ match, compact = false }: { match: Explained; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const reasons = compact ? match.reasons.slice(0, 3) : match.reasons
  return (
    <div className="space-y-2">
      {reasons.length > 0 && (
        <ul className="space-y-1" aria-label="Why this is recommended">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2 text-xs text-muted">
              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      {match.cautions.length > 0 && (
        <ul className="space-y-1" aria-label="Things to consider">
          {match.cautions.map((caution) => (
            <li key={caution} className="flex gap-2 text-xs text-warning/90">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{caution}</span>
            </li>
          ))}
        </ul>
      )}
      {match.breakdown.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="inline-flex items-center gap-1 text-xs font-medium text-subtle hover:text-fg"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            Score breakdown
          </button>
          {open && (
            <div id={panelId} className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface-2/60 p-3">
              {match.breakdown.map((part) => (
                <div key={part.component} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-muted">{part.label}</span>
                  <span className="text-right text-subtle tabular-nums">
                    {part.points.toFixed(part.points % 1 ? 1 : 0)} / {part.max_points}
                  </span>
                  <div className="col-span-2 h-1 overflow-hidden rounded bg-surface-3" aria-hidden="true">
                    <div className="h-full rounded bg-brand-400" style={{ width: `${(part.points / part.max_points) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="flex gap-1.5 pt-1 text-[11px] text-subtle">
                <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
                {CONFIDENCE_LABEL[match.confidence]}. Scores come from transparent rules, not an AI model.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
