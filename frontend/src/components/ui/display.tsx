// Small presentational primitives: badges, avatars, spinners, skeletons and states.
import type { ReactNode } from 'react'
import { CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react'
import { resolveApiUrl } from '../../services/api'
import { cn } from '../../utils/cn'
import { initials } from '../../utils/format'
import { Button } from './Button'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-muted',
  brand: 'bg-brand-500/15 text-brand-300',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
  outline: 'border border-line-strong text-muted',
}

export function Badge({ tone = 'neutral', icon, className, children }: {
  tone?: BadgeTone
  icon?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

const AVATAR_COLORS = ['bg-brand-500/25 text-brand-200', 'bg-info/20 text-info', 'bg-success/20 text-success',
  'bg-warning/20 text-warning', 'bg-danger/20 text-danger', 'bg-surface-3 text-fg']

function colorFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

const AVATAR_SIZES = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-24 text-2xl' }

export function Avatar({ name, src, size = 'md', className }: {
  name: string
  src?: string | null
  size?: keyof typeof AVATAR_SIZES
  className?: string
}) {
  const url = resolveApiUrl(src)
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn('shrink-0 rounded-full border border-line object-cover', AVATAR_SIZES[size], className)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', colorFor(name), AVATAR_SIZES[size], className)}
    >
      {initials(name)}
    </span>
  )
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} className="[&_svg]:size-6" />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton h-4', className)} />
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card space-y-3 p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-1/2' : 'w-full')} />
      ))}
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-14" />
      </div>
    </div>
  )
}

export function GridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-subtle [&_svg]:size-6">{icon}</div>}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = "Couldn't load this", message, onRetry, className }: {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center rounded-xl border border-danger/25 bg-danger/5 px-6 py-10 text-center', className)}>
      <CircleAlert className="mb-3 size-7 text-danger" aria-hidden="true" />
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RotateCcw className="size-3.5" aria-hidden="true" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Notice({ tone = 'info', title, children, action, className }: {
  tone?: 'info' | 'warning' | 'success' | 'danger'
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const tones = {
    info: 'border-info/25 bg-info/5',
    warning: 'border-warning/25 bg-warning/5',
    success: 'border-success/25 bg-success/5',
    danger: 'border-danger/25 bg-danger/5',
  }
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center', tones[tone], className)}>
      <div className="flex-1">
        {title && <p className="font-semibold text-fg">{title}</p>}
        <div className="text-muted">{children}</div>
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow }: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ title, action, description }: { title: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
