import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '../utils/cn'

export function SkillTag({ children, tone = 'default', onRemove, highlighted }: {
  children: string
  tone?: 'default' | 'muted'
  onRemove?: () => void
  highlighted?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        highlighted
          ? 'border-success/40 bg-success/10 text-success'
          : tone === 'muted'
            ? 'border-line bg-surface-2 text-muted'
            : 'border-brand-500/30 bg-brand-500/10 text-brand-200',
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded p-0.5 text-current opacity-70 hover:opacity-100"
          aria-label={`Remove ${children}`}
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

/** Shows up to `max` tags, then "+N". */
export function TagList({ tags, max = 6, tone, highlight, className, label = 'Skills' }: {
  tags: string[]
  max?: number
  tone?: 'default' | 'muted'
  highlight?: string[]
  className?: string
  label?: string
}) {
  if (!tags.length) return null
  const highlightSet = new Set((highlight ?? []).map((t) => t.toLowerCase()))
  const shown = tags.slice(0, max)
  const hidden = tags.length - shown.length
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label={label}>
      {shown.map((tag) => (
        <li key={tag}>
          <SkillTag tone={tone} highlighted={highlightSet.has(tag.toLowerCase())}>
            {tag}
          </SkillTag>
        </li>
      ))}
      {hidden > 0 && (
        <li className="self-center text-xs text-subtle" aria-label={`${hidden} more`}>
          +{hidden}
        </li>
      )}
    </ul>
  )
}

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  suggestions?: string[]
  placeholder?: string
  max?: number
  id?: string
  invalid?: boolean
  describedBy?: string
  maxLength?: number
  label: string
}

/**
 * Tag/skill selector: type and press Enter or comma to add, Backspace to remove
 * the last tag, and arrow keys to pick from suggestions (ARIA combobox pattern).
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Type and press Enter',
  max = 20,
  id,
  invalid,
  describedBy,
  maxLength = 40,
  label,
}: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [navigated, setNavigated] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const lower = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value])

  const matches = useMemo(() => {
    const query = draft.trim().toLowerCase()
    return suggestions
      .filter((s) => !lower.has(s.toLowerCase()) && (!query || s.toLowerCase().includes(query)))
      .slice(0, 8)
  }, [draft, suggestions, lower])

  const atLimit = value.length >= max

  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    if (!tag || lower.has(tag.toLowerCase()) || atLimit) {
      setDraft('')
      return
    }
    onChange([...value, tag])
    setDraft('')
    setActive(0)
    setNavigated(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      // Enter picks the highlighted suggestion only if the user moved to it.
      if (event.key === 'Enter' && open && navigated && matches[active]) add(matches[active])
      else add(draft)
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => (navigated ? Math.min(i + 1, Math.max(matches.length - 1, 0)) : 0))
      setNavigated(true)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
      setNavigated(true)
    } else if (event.key === 'Escape') {
      setOpen(false)
      setNavigated(false)
    }
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-surface-2 px-2 py-1.5 transition-colors',
          'focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/25',
          invalid ? 'border-danger/70' : 'border-line hover:border-line-strong',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <SkillTag key={tag} onRemove={() => onChange(value.filter((t) => t !== tag))}>
            {tag}
          </SkillTag>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && navigated && matches[active] ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={draft}
          disabled={atLimit}
          maxLength={maxLength}
          placeholder={atLimit ? `Limit of ${max} reached` : value.length ? '' : placeholder}
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
            setActive(0)
            setNavigated(false)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-subtle disabled:cursor-not-allowed"
        />
      </div>
      {open && matches.length > 0 && !atLimit && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface-2 p-1 shadow-xl shadow-black/30"
        >
          {matches.map((match, index) => (
            <li
              key={match}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={navigated && index === active}
              onMouseDown={(event) => {
                event.preventDefault()
                add(match)
              }}
              onMouseEnter={() => {
                setActive(index)
                setNavigated(true)
              }}
              className={cn('cursor-pointer rounded-md px-2.5 py-1.5 text-sm', navigated && index === active ? 'bg-brand-500/20 text-fg' : 'text-muted')}
            >
              {match}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-right text-xs text-subtle" aria-live="polite">
        {value.length}/{max}
      </p>
    </div>
  )
}

/** Multi-select chips for filter bars (aria-pressed toggle buttons). */
export function ChipFilter<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T[]
  onChange: (value: T[]) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? value.filter((v) => v !== option.value) : [...value, option.value])}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selected ? 'border-brand-400 bg-brand-500/15 text-brand-200' : 'border-line text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
