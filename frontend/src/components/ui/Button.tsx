import type { ComponentPropsWithRef, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm shadow-brand-500/20',
  secondary: 'border border-line-strong bg-surface-2 text-fg hover:bg-surface-3 hover:border-subtle/50',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
  success: 'border border-success/40 bg-success/10 text-success hover:bg-success/20',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', fullWidth = false) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
  )
}

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size, fullWidth), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  fullWidth?: boolean
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, fullWidth, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses(variant, size, fullWidth), className)} {...props}>
      {icon}
      {children}
    </Link>
  )
}

interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  label: string
  size?: 'sm' | 'md'
}

/** Icon-only button. `label` becomes the accessible name. */
export function IconButton({ label, size = 'md', className, children, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:opacity-50',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
