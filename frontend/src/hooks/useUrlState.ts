import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

type UrlValue = string | string[] | boolean | number
type UrlShape = Record<string, UrlValue>

/**
 * Filter state stored in the query string. Defaults are omitted from the URL,
 * and changing any filter except `page` resets `page` to 1.
 */
export function useUrlState<T extends UrlShape>(defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const [params, setParams] = useSearchParams()

  const state = useMemo(() => {
    const result = { ...defaults } as Record<string, UrlValue>
    for (const [key, fallback] of Object.entries(defaults)) {
      const raw = params.get(key)
      if (raw === null) continue
      if (Array.isArray(fallback)) result[key] = raw.split(',').map((v) => v.trim()).filter(Boolean)
      else if (typeof fallback === 'boolean') result[key] = raw === 'true'
      else if (typeof fallback === 'number') {
        const n = Number(raw)
        result[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
      } else result[key] = raw
    }
    return result as T
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const update = useCallback(
    (patch: Partial<T>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          const entries = Object.entries(patch) as [string, UrlValue][]
          for (const [key, value] of entries) {
            const fallback = defaults[key]
            const isDefault = Array.isArray(value)
              ? value.length === 0
              : value === fallback || value === ''
            if (isDefault) next.delete(key)
            else next.set(key, Array.isArray(value) ? value.join(',') : String(value))
          }
          if (!('page' in patch) && 'page' in defaults) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  )

  const reset = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const key of Object.keys(defaults)) next.delete(key)
        return next
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams])

  return [state, update, reset]
}
