import { NavLink, Outlet } from 'react-router'
import { Flag, LayoutDashboard, Layers, ScrollText, Trophy, Users } from 'lucide-react'
import { cn } from '../../utils/cn'

const LINKS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/listings', label: 'Listings', icon: Layers },
  { to: '/admin/opportunities', label: 'Curated opportunities', icon: Trophy },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
]

export default function AdminLayout() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="eyebrow">Admin panel</p>
        <p className="mt-1 text-sm text-subtle">Every action here is recorded in the audit log. Access is enforced by the server.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto lg:flex-col">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn('inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}>
              <Icon className="size-4" aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  )
}
