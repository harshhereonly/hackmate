import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CircleCheck, CircleX } from 'lucide-react'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Field'
import { Spinner } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { getErrorMessage } from '../../services/api'
import * as authService from '../../services/auth'
import { applyServerErrors } from '../../utils/forms'
import { AuthCard, FormAlert, PasswordInput } from './AuthLayout'
import { forgotSchema, resetSchema, type ForgotValues, type ResetValues } from './schemas'

export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password')
  const [result, setResult] = useState<{ message: string; delivery: 'enabled' | 'not_configured' } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      const response = await authService.forgotPassword(email)
      setResult({ message: response.message, delivery: response.email_delivery })
    } catch (error) {
      setFormError(applyServerErrors(error, setError, {}, ['email']))
    }
  })

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your account email. If it matches an account, we'll send a link to choose a new password."
      footer={<Link to="/login" className="link">Back to login</Link>}
    >
      {result ? (
        result.delivery === 'enabled' ? (
          <FormAlert tone="success" message={result.message} />
        ) : (
          <FormAlert
            tone="info"
            message="Email delivery isn't configured on this server, so no email was sent. In local development, the reset link is printed in the backend console. Otherwise, contact the site administrator."
          />
        )
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormAlert message={formError} />
          <Field label="Email" error={errors.email?.message}>
            <TextInput type="email" autoComplete="email" autoFocus {...register('email')} />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } })

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null)
    try {
      const message = await authService.resetPassword(token, password)
      toast.success(message)
      navigate('/login', { replace: true })
    } catch (error) {
      setFormError(applyServerErrors(error, setError, {}, ['password']))
    }
  })

  if (!token) {
    return (
      <AuthCard title="Invalid reset link">
        <p className="text-sm text-muted">This link is missing its token. Request a new one.</p>
        <ButtonLink to="/forgot-password" variant="secondary" className="mt-5">Request a new link</ButtonLink>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Reset links work once and expire after a short time.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        {formError?.includes('expired') && (
          <p className="text-sm"><Link to="/forgot-password" className="link">Request a new reset link</Link></p>
        )}
        <Field label="New password" error={errors.password?.message} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>Update password</Button>
      </form>
    </AuthCard>
  )
}

export function VerifyEmailPage() {
  useDocumentTitle('Verify email')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<{ status: 'working' | 'done' | 'failed'; message: string }>({
    status: token ? 'working' : 'failed',
    message: token ? '' : 'This link is missing its token.',
  })
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true // the token is single-use; never submit it twice (e.g. StrictMode)
    authService
      .verifyEmail(token)
      .then((message) => setState({ status: 'done', message }))
      .catch((error) => setState({ status: 'failed', message: getErrorMessage(error) }))
  }, [token])

  return (
    <AuthCard title="Email verification">
      <div className="flex flex-col items-center py-4 text-center">
        {state.status === 'working' && <Spinner label="Verifying your email" />}
        {state.status === 'done' && (
          <>
            <CircleCheck className="mb-3 size-10 text-success" aria-hidden="true" />
            <p className="text-sm text-muted">{state.message}</p>
            <ButtonLink to="/dashboard" className="mt-5">Continue</ButtonLink>
          </>
        )}
        {state.status === 'failed' && (
          <>
            <CircleX className="mb-3 size-10 text-danger" aria-hidden="true" />
            <p className="text-sm text-muted">{state.message}</p>
            <ButtonLink to="/settings" variant="secondary" className="mt-5">Request a new link</ButtonLink>
          </>
        )}
      </div>
    </AuthCard>
  )
}
