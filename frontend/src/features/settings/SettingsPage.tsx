import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Field } from '../../components/ui/Field'
import { Badge, EmptyState, PageHeader } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage, setCsrfToken } from '../../services/api'
import { changePassword, logoutEverywhere, resendVerification } from '../../services/auth'
import { listMyReports } from '../../services/social'
import { formatDate } from '../../utils/format'
import { applyServerErrors } from '../../utils/forms'
import { useAuth } from '../auth/AuthContext'
import { FormAlert, PasswordInput } from '../auth/AuthLayout'
import { changePasswordSchema, type ChangePasswordValues } from '../auth/schemas'

function ChangePasswordForm() {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      toast.success(await changePassword(values.currentPassword, values.newPassword))
      reset()
    } catch (error) {
      setFormError(applyServerErrors(error, setError, { current_password: 'currentPassword', new_password: 'newPassword' }))
    }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <Field label="Current password" error={errors.currentPassword?.message}>
        <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" error={errors.newPassword?.message} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput autoComplete="new-password" {...register('newPassword')} />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
      </div>
      <Button type="submit" loading={isSubmitting}>Update password</Button>
    </form>
  )
}

export default function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, config, setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false)
  const [sending, setSending] = useState(false)
  const reports = useApi((signal) => listMyReports(1, signal), [])
  if (!user) return null

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Account settings" description="Manage your sign-in details and security." />
      <div className="space-y-6">
        <section className="card p-6" aria-labelledby="account-heading">
          <h2 id="account-heading" className="flex items-center gap-2 text-lg font-semibold"><Mail className="size-5 text-subtle" aria-hidden="true" />Account</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-subtle">Email</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-fg">
                {user.email}
                {user.email_verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Member since</dt>
              <dd className="mt-0.5 text-fg">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
          {!user.email_verified && (
            <div className="mt-4 rounded-lg border border-line bg-surface-2/50 p-4 text-sm">
              {config?.email_delivery_enabled ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted">Didn't get the verification email?</p>
                  <Button size="sm" variant="secondary" loading={sending} onClick={async () => {
                    setSending(true)
                    try {
                      toast.success((await resendVerification(user.email)).message)
                    } catch (error) {
                      toast.error(getErrorMessage(error))
                    } finally {
                      setSending(false)
                    }
                  }}>Resend verification email</Button>
                </div>
              ) : (
                <p className="text-muted">Email delivery isn't configured on this server, so verification emails can't be sent right now.</p>
              )}
            </div>
          )}
        </section>

        <section className="card p-6" aria-labelledby="password-heading">
          <h2 id="password-heading" className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="size-5 text-subtle" aria-hidden="true" />Change password</h2>
          <p className="mt-1 mb-4 text-sm text-muted">Changing your password signs you out on your other devices.</p>
          <ChangePasswordForm />
        </section>

        <section className="card p-6" aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-subtle" aria-hidden="true" />Sessions</h2>
          <p className="mt-1 text-sm text-muted">Signed in on a shared or lost device? Sign out everywhere, including here.</p>
          <Button variant="danger" className="mt-4" icon={<LogOut className="size-4" aria-hidden="true" />} onClick={() => setConfirmLogoutAll(true)}>
            Sign out of all devices
          </Button>
        </section>

        <section className="card p-6" aria-labelledby="reports-heading">
          <h2 id="reports-heading" className="text-lg font-semibold">Your reports</h2>
          <p className="mt-1 mb-4 text-sm text-muted">Reports you've sent to moderators and their status.</p>
          {reports.data?.items.length ? (
            <ul className="divide-y divide-line text-sm">
              {reports.data.items.map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-muted">{report.target_label} · <span className="capitalize">{report.reason}</span></span>
                  <Badge tone={report.status === 'open' ? 'warning' : report.status === 'resolved' ? 'success' : 'neutral'}>{report.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No reports" className="py-6" />
          )}
        </section>
      </div>

      <ConfirmDialog open={confirmLogoutAll} onClose={() => setConfirmLogoutAll(false)} title="Sign out of all devices?"
        description="Every session, including this one, will end. You'll need to log in again." confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          await logoutEverywhere()
          setCsrfToken(null)
          setUser(null)
          navigate('/login', { replace: true })
        }} />
    </PageContainer>
  )
}
