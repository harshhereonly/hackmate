import { useNavigate } from 'react-router'
import { Bell, CheckCheck, Trash } from 'lucide-react'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState, ErrorState, GridSkeleton, PageHeader } from '../../components/ui/display'
import { Pagination, Tabs } from '../../components/ui/navigation'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { useUrlState } from '../../hooks/useUrlState'
import { PageContainer } from '../../layouts/RootLayout'
import { getErrorMessage } from '../../services/api'
import { deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/social'
import type { AppNotification } from '../../types/api'
import { cn } from '../../utils/cn'
import { relativeTime } from '../../utils/format'
import { useActivity } from './ActivityContext'

export default function NotificationsPage() {
  useDocumentTitle('Notifications')
  const toast = useToast()
  const navigate = useNavigate()
  const activity = useActivity()
  const [filters, update] = useUrlState({ view: 'all', page: 1 })
  const unreadOnly = filters.view === 'unread'
  const { data, loading, error, reload, setData } = useApi((signal) => listNotifications(unreadOnly, filters.page, signal), [unreadOnly, filters.page])

  const open = async (notification: AppNotification) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
        activity.refresh()
      } catch {
        // Opening the link matters more than the read flag.
      }
    }
    if (notification.link?.startsWith('/')) navigate(notification.link)
    else setData((current) => current && { ...current, items: current.items.map((n) => (n.id === notification.id ? { ...n, read: true } : n)) })
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Notifications" description="Join requests, decisions and team activity."
        actions={
          <Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" aria-hidden="true" />}
            disabled={activity.notifications === 0}
            onClick={async () => {
              try {
                await markAllNotificationsRead()
                activity.refresh()
                reload()
              } catch (err) {
                toast.error(getErrorMessage(err))
              }
            }}>
            Mark all as read
          </Button>
        } />
      <Tabs label="Notification filter" className="mb-5" value={filters.view} onChange={(view) => update({ view })}
        items={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: activity.notifications }]} />
      {error ? <ErrorState message={error.message} onRetry={reload} /> : loading && !data ? <GridSkeleton count={3} className="sm:grid-cols-1 lg:grid-cols-1" /> :
        data && data.items.length === 0 ? (
          <EmptyState icon={<Bell />} title={unreadOnly ? "You're all caught up" : 'No notifications yet'}
            description="You'll be notified about join requests, decisions and changes to your teams." />
        ) : data ? (
          <>
            <ul className="card divide-y divide-line">
              {data.items.map((notification) => (
                <li key={notification.id} className={cn('flex items-start gap-3 px-4 py-3.5', !notification.read && 'bg-brand-500/5')}>
                  <span className={cn('mt-2 size-2 shrink-0 rounded-full', notification.read ? 'bg-transparent' : 'bg-brand-400')} aria-hidden="true" />
                  <button type="button" onClick={() => open(notification)} className="min-w-0 flex-1 text-left">
                    <p className={cn('text-sm', notification.read ? 'text-muted' : 'font-semibold text-fg')}>
                      {notification.title}
                      {!notification.read && <span className="sr-only"> (unread)</span>}
                    </p>
                    {notification.body && <p className="mt-0.5 line-clamp-2 text-sm text-subtle">{notification.body}</p>}
                    <p className="mt-1 text-xs text-subtle">{relativeTime(notification.created_at)}</p>
                  </button>
                  <IconButton size="sm" label="Delete notification" onClick={async () => {
                    try {
                      await deleteNotification(notification.id)
                      setData((current) => current && { ...current, items: current.items.filter((n) => n.id !== notification.id), total: current.total - 1 })
                      activity.refresh()
                    } catch (err) {
                      toast.error(getErrorMessage(err))
                    }
                  }}>
                    <Trash className="size-4" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page })} />
          </>
        ) : null}
    </PageContainer>
  )
}
