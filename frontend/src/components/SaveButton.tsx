import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { SaveItemInput } from '../types/api'
import { useAuth } from '../features/auth/AuthContext'
import { useSaved } from '../features/saved/SavedContext'
import { cn } from '../utils/cn'

export function SaveButton({ item, compact = false, className }: { item: SaveItemInput; compact?: boolean; className?: string }) {
  const { status } = useAuth()
  const { isSaved, toggle, pending } = useSaved()
  const navigate = useNavigate()
  const saved = isSaved(item.item_key)
  const label = saved ? `Remove ${item.title ?? 'item'} from saved` : `Save ${item.title ?? 'item'}`

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      title={saved ? 'Saved' : 'Save for later'}
      disabled={pending(item.item_key)}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (status !== 'authenticated') {
          navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
          return
        }
        void toggle(item)
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        compact ? 'size-8' : 'h-9 px-3',
        saved ? 'text-brand-300 hover:bg-brand-500/10' : 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {saved ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
      {!compact && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  )
}
