import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getErrorMessage } from '../../services/api'
import { fetchSavedKeys, saveItem, unsaveItem } from '../../services/opportunities'
import type { SaveItemInput } from '../../types/api'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../auth/AuthContext'

interface SavedContextValue {
  isSaved: (key: string) => boolean
  toggle: (item: SaveItemInput) => Promise<void>
  /** Always unsaves (never toggles), e.g. from the Saved page. Throws on failure. */
  remove: (key: string) => Promise<void>
  pending: (key: string) => boolean
}

const SavedContext = createContext<SavedContextValue | null>(null)

/** Tracks which items the user has bookmarked, so any card can show a save toggle. */
export function SavedProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const toast = useToast()
  const [keys, setKeys] = useState<Set<string>>(new Set())
  const [inFlight, setInFlight] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (status !== 'authenticated') {
      setKeys(new Set())
      return
    }
    const controller = new AbortController()
    fetchSavedKeys(controller.signal)
      .then((list) => setKeys(new Set(list)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [status])

  const toggle = useCallback(
    async (item: SaveItemInput) => {
      const key = item.item_key
      const wasSaved = keys.has(key)
      const update = (saved: boolean) =>
        setKeys((current) => {
          const next = new Set(current)
          if (saved) next.add(key)
          else next.delete(key)
          return next
        })
      update(!wasSaved) // optimistic
      setInFlight((current) => new Set(current).add(key))
      try {
        if (wasSaved) await unsaveItem(key)
        else await saveItem(item)
        toast.success(wasSaved ? 'Removed from saved' : 'Saved for later')
      } catch (error) {
        update(wasSaved)
        toast.error(getErrorMessage(error, 'Could not update your saved items.'))
      } finally {
        setInFlight((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    [keys, toast],
  )

  const remove = useCallback(async (key: string) => {
    await unsaveItem(key)
    setKeys((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }, [])

  const value = useMemo<SavedContextValue>(
    () => ({ isSaved: (key) => keys.has(key), toggle, remove, pending: (key) => inFlight.has(key) }),
    [keys, toggle, remove, inFlight],
  )
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSaved(): SavedContextValue {
  const context = useContext(SavedContext)
  if (!context) throw new Error('useSaved must be used inside <SavedProvider>')
  return context
}
