import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Field'
import { useDocumentTitle } from '../../hooks/misc'
import { applyServerErrors } from '../../utils/forms'
import { safeNextPath, useAuth } from './AuthContext'
import { AuthCard, FormAlert, PasswordInput } from './AuthLayout'
import { loginSchema, type LoginValues } from './schemas'

export default function LoginPage() {
  useDocumentTitle('Log in')
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      navigate(safeNextPath(params.get('next')), { replace: true })
    } catch (error) {
      setFormError(applyServerErrors(error, setError, {}, ['email', 'password']))
    }
  })

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to find teammates, manage your projects and keep up with requests."
      footer={
        <>
          New to HackMate?{' '}
          <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <Field label="Email" error={errors.email?.message}>
          <TextInput type="email" autoComplete="email" autoFocus {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="link text-sm">Forgot password?</Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Log in'}
        </Button>
      </form>
    </AuthCard>
  )
}
