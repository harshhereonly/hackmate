import { Link } from 'react-router'
import { cn } from '../utils/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#6c63ff" />
      <path d="M10 8v16M22 8v16M10 16h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-lg font-bold tracking-tight text-fg', className)}>
      <LogoMark />
      <span className="text-lg">HackMate</span>
    </Link>
  )
}
