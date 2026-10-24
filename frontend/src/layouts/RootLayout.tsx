import type { ReactNode } from 'react'
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { Database, MailWarning } from 'lucide-react'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/AuthContext'
import { Navbar } from './Navbar'

function EnvironmentBanner() {
  const { config, user } = useAuth()
  if (config?.in_memory_database) {
    return (
      <div className="border-b border-warning/20 bg-warning/10 px-4 py-2 text-center text-xs text-warning">
        <Database className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />
        Development mode: data is stored in a local in-memory database, not MongoDB. Configure MONGODB_URI for real persistence.
      </div>
    )
  }
  if (user && !user.email_verified && config?.email_delivery_enabled) {
    return (
      <div className="border-b border-info/20 bg-info/10 px-4 py-2 text-center text-xs text-info">
        <MailWarning className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />
        Please verify your email address. Lost the email?{' '}
        <Link to="/settings" className="underline underline-offset-2">Resend it from Settings</Link>.
      </div>
    )
  }
  return null
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Find teammates, hackathons, open-source projects and research collaborators, then build something together.
          </p>
        </div>
        <nav aria-label="Explore">
          <h2 className="text-sm font-semibold text-fg">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link to="/opportunities" className="hover:text-fg">Opportunities</Link></li>
            <li><Link to="/projects" className="hover:text-fg">Projects</Link></li>
            <li><Link to="/research" className="hover:text-fg">Research</Link></li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h2 className="text-sm font-semibold text-fg">Account</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link to="/signup" className="hover:text-fg">Create an account</Link></li>
            <li><Link to="/login" className="hover:text-fg">Log in</Link></li>
            <li><Link to="/forgot-password" className="hover:text-fg">Reset password</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold text-fg">Data sources</h2>
          <p className="mt-3 text-sm text-muted">
            Papers from OpenAlex and Crossref. Open-source tasks from the GitHub API. Listings marked “Demo data” are samples.
          </p>
        </div>
      </div>
      <p className="border-t border-line py-5 text-center text-xs text-subtle">© {new Date().getFullYear()} HackMate</p>
    </footer>
  )
}

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <EnvironmentBanner />
      <Navbar />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  )
}

/** Standard page container for app pages. */
export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 ${className}`}>{children}</div>
}
