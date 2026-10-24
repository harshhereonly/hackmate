import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Compass, TriangleAlert } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { useDocumentTitle } from '../hooks/misc'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-brand-300">404</p>
      <h1 className="mt-2 text-3xl font-bold text-fg">We couldn't find that page</h1>
      <p className="mt-3 text-muted">The link may be broken, or the page may have been moved, removed or made private.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/">Go home</ButtonLink>
        <ButtonLink to="/opportunities" variant="secondary" icon={<Compass className="size-4" aria-hidden="true" />}>
          Explore opportunities
        </ButtonLink>
      </div>
    </div>
  )
}

/** Route-level error boundary: unexpected rendering errors land here instead of a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <TriangleAlert className="size-10 text-warning" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold text-fg">Something went wrong</h1>
      <p className="mt-3 text-muted">An unexpected error occurred while showing this page. Try reloading it.</p>
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          Reload page
        </button>
        <a href="/" className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2">Go home</a>
      </div>
    </div>
  )
}
