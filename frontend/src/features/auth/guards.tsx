import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { PageLoader } from '../../components/ui/display'
import { ButtonLink } from '../../components/ui/Button'
import { useAuth } from './AuthContext'

/**
 * UX-level route guard. The API enforces authentication and authorization on
 * every request regardless; this only avoids showing pages that would fail.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader label="Checking your session" />
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children ?? <Outlet />
}

export function RequireAdmin({ children }: { children?: ReactNode }) {
  const { status, isAdmin } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader label="Checking your session" />
  if (status === 'anonymous') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <ShieldAlert className="mb-4 size-10 text-warning" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <p className="mt-2 text-sm text-muted">Your account doesn't have access to the admin panel.</p>
        <ButtonLink to="/dashboard" variant="secondary" className="mt-6">
          Back to dashboard
        </ButtonLink>
      </div>
    )
  }
  return children ?? <Outlet />
}

/** Signed-in users visiting /login or /signup go straight to their dashboard. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />
  return children
}
