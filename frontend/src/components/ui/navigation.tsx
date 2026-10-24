// Tabs, pagination and search.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

/** Accessible tab list (arrow keys move between tabs). */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    refs.current[next]?.focus()
    onChange(items[next].value)
  }

  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((item, index) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              selected ? 'border-brand-400 text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className={cn('rounded-full px-1.5 text-xs', selected ? 'bg-brand-500/20 text-brand-200' : 'bg-surface-3 text-subtle')}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Pagination({ page, pages, onChange, className }: {
  page: number
  pages: number
  onChange: (page: number) => void
  className?: string
}) {
  if (pages <= 1) return null
  const windowStart = Math.max(1, Math.min(page - 2, pages - 4))
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => windowStart + i)
  const base = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40'
  return (
    <nav aria-label="Pagination" className={cn('mt-8 flex items-center justify-center gap-1', className)}>
      <button type="button" className={cn(base, 'text-muted hover:bg-surface-2')} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? 'page' : undefined}
          className={cn(base, n === page ? 'bg-brand-500 font-semibold text-white' : 'text-muted hover:bg-surface-2')}
        >
          {n}
        </button>
      ))}
      <button type="button" className={cn(base, 'text-muted hover:bg-surface-2')} onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page">
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  className?: string
  onSubmit?: () => void
}

export function SearchInput({ value, onChange, placeholder, label, className, onSubmit }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) {
            event.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        className="field h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        maxLength={80}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-subtle hover:text-fg"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
