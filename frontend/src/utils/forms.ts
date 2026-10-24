import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '../services/api'

/**
 * Copy server-side field errors onto react-hook-form fields. Returns the
 * message to show at form level, or null if every error landed on a field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldMap: Partial<Record<string, Path<T>>> = {},
  knownFields: readonly string[] = [],
): string | null {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Something went wrong.'
  const entries = Object.entries(error.fieldErrors)
  let unmapped = false
  for (const [field, message] of entries) {
    const target = (fieldMap[field] ?? (knownFields.includes(field) ? field : undefined)) as Path<T> | undefined
    if (target) setError(target, { type: 'server', message })
    else unmapped = true
  }
  if (!entries.length || unmapped || error.status !== 422) return error.message
  return null
}
