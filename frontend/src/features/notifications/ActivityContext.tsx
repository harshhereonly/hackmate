import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePolling } from '../../hooks/misc'
import { fetchRequestSummary } from '../../services/requests'
import { fetchUnreadMessages, fetchUnreadNotificationCount } from '../../services/social'
import { useAuth } from '../auth/AuthContext'

interface ActivityCounts {
  notifications: number
  messages: number
  incomingRequests: number
}

interface ActivityContextValue extends ActivityCounts {
  refresh: () => void
}

const EMPTY: ActivityCounts = { notifications: 0, messages: 0, incomingRequests: 0 }
const ActivityContext = createContext<ActivityContextValue>({ ...EMPTY, refresh: () => undefined })

/**
 * Unread counts for the navbar badges. Polls every 30 seconds while the tab is
 * visible. Messaging and notifications are database-backed, with no WebSockets.
 */
export function ActivityProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const [counts, setCounts] = useState<ActivityCounts>(EMPTY)
  const signedIn = status === 'authenticated'

  const refresh = useCallback(() => {
    if (!signedIn) return
    Promise.allSettled([fetchUnreadNotificationCount(), fetchUnreadMessages(), fetchRequestSummary()]).then(
      ([notifications, messages, requests]) => {
        setCounts((current) => ({
          notifications: notifications.status === 'fulfilled' ? notifications.value : current.notifications,
          messages: messages.status === 'fulfilled' ? messages.value.conversations : current.messages,
          incomingRequests: requests.status === 'fulfilled' ? requests.value.incoming_pending : current.incomingRequests,
        }))
      },
    )
  }, [signedIn])

  useEffect(() => {
    if (signedIn) refresh()
    else setCounts(EMPTY)
  }, [signedIn, refresh])

  usePolling(refresh, 30_000, signedIn)

  const value = useMemo(() => ({ ...counts, refresh }), [counts, refresh])
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export function useActivity(): ActivityContextValue {
  return useContext(ActivityContext)
}
