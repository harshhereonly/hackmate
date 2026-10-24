import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { RootLayout } from './layouts/RootLayout'
import { RedirectIfAuthenticated, RequireAdmin, RequireAuth } from './features/auth/guards'
import LoginPage from './features/auth/LoginPage'
import SignupPage from './features/auth/SignupPage'
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './features/auth/PasswordRecoveryPages'
import LandingPage from './pages/LandingPage'
import { NotFoundPage, RouteErrorPage } from './pages/SystemPages'
import { PageLoader } from './components/ui/display'

// Feature pages are code-split; each module's default export is the page component.
type PageModule = { default: ComponentType }
const page = (load: () => Promise<PageModule>) => async () => ({ Component: (await load()).default })

const memberRoutes: RouteObject[] = [
  { path: 'dashboard', lazy: page(() => import('./features/dashboard/DashboardPage')) },
  { path: 'people', lazy: page(() => import('./features/profiles/PeoplePage')) },
  { path: 'profile/edit', lazy: page(() => import('./features/profiles/EditProfilePage')) },
  { path: 'projects/new', lazy: page(() => import('./features/projects/ProjectFormPage')) },
  { path: 'projects/:projectId/edit', lazy: page(() => import('./features/projects/ProjectFormPage')) },
  { path: 'requests', lazy: page(() => import('./features/requests/RequestsPage')) },
  { path: 'opportunities/new', lazy: page(() => import('./features/opportunities/PostOpportunityPage')) },
  { path: 'opportunities/:opportunityId/edit', lazy: page(() => import('./features/opportunities/PostOpportunityPage')) },
  { path: 'opportunities/applications', lazy: page(() => import('./features/opportunities/ApplicationsPage')) },
  { path: 'saved', lazy: page(() => import('./features/opportunities/SavedPage')) },
  { path: 'messages', lazy: page(() => import('./features/messaging/MessagesPage')) },
  { path: 'messages/:conversationId', lazy: page(() => import('./features/messaging/MessagesPage')) },
  { path: 'notifications', lazy: page(() => import('./features/notifications/NotificationsPage')) },
  { path: 'settings', lazy: page(() => import('./features/settings/SettingsPage')) },
]

const adminRoutes: RouteObject[] = [
  {
    path: 'admin',
    lazy: page(() => import('./features/admin/AdminLayout')),
    children: [
      { index: true, lazy: page(() => import('./features/admin/AdminDashboardPage')) },
      { path: 'reports', lazy: page(() => import('./features/admin/AdminReportsPage')) },
      { path: 'users', lazy: page(() => import('./features/admin/AdminUsersPage')) },
      { path: 'listings', lazy: page(() => import('./features/admin/AdminListingsPage')) },
      { path: 'opportunities', lazy: page(() => import('./features/admin/AdminOpportunitiesPage')) },
      { path: 'audit', lazy: page(() => import('./features/admin/AdminAuditPage')) },
    ],
  },
]

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: PageLoader,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'login', element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
      { path: 'signup', element: <RedirectIfAuthenticated><SignupPage /></RedirectIfAuthenticated> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      // Public pages (the API decides what anonymous visitors may see).
      { path: 'projects', lazy: page(() => import('./features/projects/ProjectsPage')) },
      { path: 'projects/:projectId', lazy: page(() => import('./features/projects/ProjectDetailPage')) },
      { path: 'opportunities', lazy: page(() => import('./features/opportunities/OpportunitiesPage')) },
      { path: 'opportunities/:opportunityId', lazy: page(() => import('./features/opportunities/OpportunityDetailPage')) },
      { path: 'research', lazy: page(() => import('./features/research/ResearchPage')) },
      { path: 'people/:handle', lazy: page(() => import('./features/profiles/ProfilePage')) },
      { element: <RequireAuth />, children: memberRoutes },
      { element: <RequireAdmin />, children: adminRoutes },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
