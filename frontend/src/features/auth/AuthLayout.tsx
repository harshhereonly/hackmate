import { useState, type ComponentPropsWithRef, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { TextInput } from '../../components/ui/Field'

export function AuthCard({ title, subtitle, children, footer }: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-fg">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  )
}

export function FormAlert({ message, tone = 'danger' }: { message: string | null; tone?: 'danger' | 'success' | 'info' }) {
  if (!message) return null
  const tones = {
    danger: 'border-danger/30 bg-danger/10 text-danger',
    success: 'border-success/30 bg-success/10 text-success',
    info: 'border-info/30 bg-info/10 text-info',
  }
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2.5 text-sm ${tones[tone]}`}>
      {message}
    </div>
  )
}

export function PasswordInput(props: ComponentPropsWithRef<'input'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <TextInput {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-subtle hover:text-fg"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  )
}
