import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { MailCheck } from 'lucide-react'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { checkHandle } from '../../services/profiles'
import { useDebouncedValue } from '../../hooks/misc'
import { applyServerErrors } from '../../utils/forms'
import { safeNextPath, useAuth } from './AuthContext'
import { AuthCard, FormAlert, PasswordInput } from './AuthLayout'
import { signupSchema, type SignupValues } from './schemas'

export default function SignupPage() {
  useDocumentTitle('Create an account')
  const { signup } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingVerification, setPendingVerification] = useState<{ email: string; delivered: boolean } | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', username: '', email: '', password: '', confirmPassword: '' },
  })

  const username = useDebouncedValue((watch('username') ?? '').trim().toLowerCase(), 400)
  const [usernameStatus, setUsernameStatus] = useState<{ ok: boolean; message: string } | null>(null)
  useEffect(() => {
    setUsernameStatus(null)
    if (username.length < 3) return
    const controller = new AbortController()
    checkHandle(username, controller.signal)
      .then((r) => setUsernameStatus({ ok: r.valid && r.available, message: r.message }))
      .catch(() => undefined) // the server re-checks on submit
    return () => controller.abort()
  }, [username])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const result = await signup(values.name, values.email, values.password, values.username)
      if (result.verification_required) {
        setPendingVerification({ email: values.email, delivered: result.email_delivery === 'sent' })
        return
      }
      if (result.email_delivery === 'sent') toast.info('We sent you an email to verify your address.')
      toast.success('Welcome to HackMate! Complete your profile to get better matches.')
      const next = params.get('next')
      navigate(next ? safeNextPath(next) : '/profile/edit?welcome=1', { replace: true })
    } catch (error) {
      setFormError(applyServerErrors(error, setError, {}, ['name', 'username', 'email', 'password']))
    }
  })

  if (pendingVerification) {
    return (
      <AuthCard title="Verify your email">
        <div className="flex flex-col items-center text-center">
          <MailCheck className="mb-4 size-10 text-brand-300" aria-hidden="true" />
          {pendingVerification.delivered ? (
            <p className="text-sm text-muted">
              Your account was created. We sent a verification link to <strong className="text-fg">{pendingVerification.email}</strong>.
              Open it to activate your account, then log in.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Your account was created, but this server could not send the verification email. Contact the site
              administrator. In local development, the link is printed in the backend console.
            </p>
          )}
          <ButtonLink to="/login" variant="secondary" className="mt-6">Go to login</ButtonLink>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join HackMate to find teammates, projects, hackathons and research collaborators."
      footer={<>Already have an account? <Link to="/login" className="link">Log in</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <Field label="Full name" error={errors.name?.message}>
          <TextInput autoComplete="name" autoFocus {...register('name')} />
        </Field>
        <Field label="Username" optional error={errors.username?.message}
          hint={usernameStatus ? undefined : 'Unique. People can find you by it. Leave blank to get one generated.'}>
          <TextInput autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} placeholder="e.g. ada-codes" {...register('username')} />
        </Field>
        {usernameStatus && !errors.username && (
          <p role="status" className={`-mt-2 text-xs ${usernameStatus.ok ? 'text-success' : 'text-danger'}`}>@{username}: {usernameStatus.message}</p>
        )}
        <Field label="Email" error={errors.email?.message}>
          <TextInput type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </Field>
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-xs text-subtle">
          Your email is never shown on your profile. You control who can see and message you.
        </p>
      </form>
    </AuthCard>
  )
}
