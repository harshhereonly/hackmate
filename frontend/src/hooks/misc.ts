import { useEffect, useRef, useState } from 'react'

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Calls `callback` every `intervalMs` while the tab is visible (and once when it becomes visible). */
export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  const saved = useRef(callback)
  saved.current = callback

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current()
    }
    const start = () => {
      window.clearInterval(timer)
      timer = window.setInterval(tick, intervalMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        saved.current()
        start()
      } else {
        window.clearInterval(timer)
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · HackMate` : 'HackMate · Find teammates, hackathons and research'
  }, [title])
}
