import { createContext, useContext, useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

interface FieldContextValue {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

interface FieldProps {
  label: ReactNode
  error?: string
  hint?: ReactNode
  required?: boolean
  optional?: boolean
  id?: string
  className?: string
  children: ReactNode
}

/**
 * Label + control + hint/error. Inputs inside pick up the id and the
 * aria-describedby/aria-invalid wiring from context.
 */
export function Field({ label, error, hint, required, optional, id, className, children }: FieldProps) {
  const generated = useId()
  const fieldId = id ?? `field-${generated}`
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext.Provider value={{ id: fieldId, describedBy, invalid: Boolean(error) }}>
      <div className={cn('space-y-1.5', className)}>
        <label htmlFor={fieldId} className="flex items-baseline gap-1.5 text-sm font-medium text-fg">
          {label}
          {required && <span className="text-danger" aria-hidden="true">*</span>}
          {optional && <span className="text-xs font-normal text-subtle">Optional</span>}
        </label>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-subtle">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

function useFieldProps(props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: unknown }) {
  const field = useContext(FieldContext)
  return {
    id: props.id ?? field?.id,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    'aria-invalid': (props['aria-invalid'] as boolean | undefined) ?? (field?.invalid || undefined),
  }
}

export function TextInput({ className, ...props }: ComponentPropsWithRef<'input'>) {
  const a11y = useFieldProps(props)
  return <input className={cn('field h-10', className)} {...props} {...a11y} />
}

export function TextArea({ className, rows = 4, ...props }: ComponentPropsWithRef<'textarea'>) {
  const a11y = useFieldProps(props)
  return <textarea rows={rows} className={cn('field min-h-24 resize-y leading-relaxed', className)} {...props} {...a11y} />
}

interface SelectProps extends ComponentPropsWithRef<'select'> {
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ options, placeholder, className, ...props }: SelectProps) {
  const a11y = useFieldProps(props)
  return (
    <div className="relative">
      <select className={cn('field h-10 cursor-pointer appearance-none pr-9', className)} {...props} {...a11y}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
    </div>
  )
}

interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: ReactNode
  description?: ReactNode
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const generated = useId()
  const checkboxId = id ?? `checkbox-${generated}`
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong bg-surface-2 accent-brand-500"
        aria-describedby={description ? `${checkboxId}-description` : undefined}
        {...props}
      />
      <div className="text-sm">
        <label htmlFor={checkboxId} className="cursor-pointer font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={`${checkboxId}-description`} className="text-xs text-subtle">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

interface RadioCardGroupProps<T extends string> {
  name: string
  legend: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string }[]
}

export function RadioCardGroup<T extends string>({ name, legend, value, onChange, options }: RadioCardGroupProps<T>) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium text-fg">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-400',
              value === option.value ? 'border-brand-400 bg-brand-500/10' : 'border-line bg-surface-2 hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="font-medium text-fg">{option.label}</span>
            {option.hint && <span className="text-xs text-subtle">{option.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
