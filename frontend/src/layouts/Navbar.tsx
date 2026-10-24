import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import {
  Bell,
  Bookmark,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Pencil,
  Settings,
  Shield,
  User,
  X,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar } from '../components/ui/display'
import { ButtonLink } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { useActivity } from '../features/notifications/ActivityContext'
import { cn } from '../utils/cn'

const PUBLIC_LINKS = [
  { to: '/opportunities', label: 'Opportunities' },
  { to: '/projects', label: 'Projects' },
  { to: '/research', label: 'Research' },
]

const MEMBER_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/people', label: 'People' },
  ...PUBLIC_LINKS,
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
  )
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] leading-4 font-bold text-white">
      {count > 99 ? '99+' : count}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

function IconLink({ to, label, count, children }: { to: string; label: string; count: number; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('relative inline-flex size-10 items-center justify-center rounded-lg transition-colors',
          isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')
      }
      aria-label={count > 0 ? `${label} (${count} unread)` : label}
      title={label}
    >
      {children}
      <CountBadge count={count} label="unread" />
    </NavLink>
  )
}

function UserMenu() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const name = user.profile?.name ?? user.email
  const items = [
    ...(user.profile ? [{ to: `/people/${user.profile.handle}`, label: 'My profile', icon: User }] : []),
    { to: '/profile/edit', label: 'Edit profile', icon: Pencil },
    { to: '/saved', label: 'Saved', icon: Bookmark },
    { to: '/settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin panel', icon: Shield }] : []),
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-surface-2"
      >
        <Avatar name={name} src={user.profile?.avatar_url} size="sm" />
        <ChevronDown className="size-4 text-subtle" aria-hidden="true" />
        <span className="sr-only">Open account menu</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 animate-pop-in rounded-xl border border-line bg-surface-2 p-1.5 shadow-xl shadow-black/40">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-semibold text-fg">{name}</p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
          </div>
          <div className="py-1">
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-3 hover:text-fg">
                <Icon className="size-4" aria-hidden="true" /> {label}
              </Link>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              await logout()
              navigate('/')
            }}
            className="flex w-full items-center gap-2.5 rounded-lg border-t border-line px-3 py-2 text-sm text-muted hover:bg-surface-3 hover:text-fg"
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function Navbar() {
  const { status, user, isAdmin, logout } = useAuth()
  const activity = useActivity()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const signedIn = status === 'authenticated'
  const links = signedIn ? MEMBER_LINKS : PUBLIC_LINKS

  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo to={signedIn ? '/dashboard' : '/'} />
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={navClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {signedIn ? (
            <>
              <IconLink to="/messages" label="Messages" count={activity.messages}>
                <MessageSquare className="size-5" aria-hidden="true" />
              </IconLink>
              <IconLink to="/requests" label="Join requests" count={activity.incomingRequests}>
                <Inbox className="size-5" aria-hidden="true" />
              </IconLink>
              <IconLink to="/notifications" label="Notifications" count={activity.notifications}>
                <Bell className="size-5" aria-hidden="true" />
              </IconLink>
              <div className="ml-1 hidden lg:block">
                <UserMenu />
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <ButtonLink to="/login" variant="ghost" size="sm">Log in</ButtonLink>
              <ButtonLink to="/signup" size="sm">Sign up</ButtonLink>
            </div>
          )}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-nav" aria-label="Mobile" className="animate-fade-in border-t border-line bg-bg px-4 pt-3 pb-5 lg:hidden">
          <div className="grid gap-1">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={navClass}>
                {link.label}
              </NavLink>
            ))}
          </div>
          {signedIn && user ? (
            <div className="mt-3 grid gap-1 border-t border-line pt-3">
              {user.profile && <NavLink to={`/people/${user.profile.handle}`} className={navClass}>My profile</NavLink>}
              <NavLink to="/profile/edit" className={navClass}>Edit profile</NavLink>
              <NavLink to="/saved" className={navClass}>Saved</NavLink>
              <NavLink to="/settings" className={navClass}>Settings</NavLink>
              {isAdmin && (
                <NavLink to="/admin" className={navClass}>
                  <span className="inline-flex items-center gap-2"><LayoutDashboard className="size-4" aria-hidden="true" /> Admin panel</span>
                </NavLink>
              )}
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
                onClick={async () => {
                  await logout()
                  navigate('/')
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <ButtonLink to="/login" variant="secondary">Log in</ButtonLink>
              <ButtonLink to="/signup">Sign up</ButtonLink>
            </div>
          )}
        </nav>
      )}
    </header>
  )
}
