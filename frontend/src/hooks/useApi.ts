import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { ApiError, isCanceled, toApiError } from '../services/api'

export interface ApiState<T> {
  data: T | undefined
  error: ApiError | null
  loading: boolean
  /** Re-run the request. Keeps showing current data while loading. */
  reload: () => void
  setData: (updater: T | ((current: T | undefined) => T | undefined)) => void
}

/**
 * Minimal data-fetching hook: aborts stale requests, ignores out-of-order
 * responses, and exposes loading/error state in one consistent shape.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  options: { enabled?: boolean } = {},
): ApiState<T> {
  const enabled = options.enabled ?? true
  const [data, setDataState] = useState<T | undefined>(undefined)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState<boolean>(enabled)
  const [version, setVersion] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDataState(result)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isCanceled(err)) return
        setError(toApiError(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((updater: T | ((current: T | undefined) => T | undefined)) => {
    setDataState((current) =>
      typeof updater === 'function' ? (updater as (c: T | undefined) => T | undefined)(current) : updater,
    )
  }, [])

  return { data, error, loading, reload, setData }
}
