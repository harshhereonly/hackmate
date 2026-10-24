const dateFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormatter.format(toDate(value)) : ''
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormatter.format(toDate(value)) : ''
}

export function formatTime(value: string): string {
  return timeFormatter.format(toDate(value))
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return ''
  if (start && !end) return formatDate(start)
  if (!start && end) return `Until ${formatDate(end)}`
  const a = toDate(start!)
  const b = toDate(end!)
  if (a.toDateString() === b.toDateString()) return formatDate(start)
  const sameYear = a.getFullYear() === b.getFullYear()
  return `${sameYear ? shortDateFormatter.format(a) : formatDate(start)} – ${formatDate(end)}`
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function relativeTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const seconds = Math.round((toDate(value).getTime() - now.getTime()) / 1000)
  if (Math.abs(seconds) < 45) return 'just now'
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      return relativeFormatter.format(Math.round(seconds / size), unit)
    }
  }
  return ''
}

export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null
  return Math.ceil((toDate(value).getTime() - now.getTime()) / (24 * 3600 * 1000))
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Convert an ISO timestamp to the value format of <input type="datetime-local"> (local time). */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = toDate(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Convert a datetime-local value (local time) to an ISO string, or null when empty. */
export function fromDateTimeLocal(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
