import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Flag, MessageSquare, Send, Trash, Users } from 'lucide-react'
import { ReportDialog } from '../../components/ReportDialog'
import { Button, ButtonLink, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Avatar, EmptyState, ErrorState, Spinner } from '../../components/ui/display'
import { useToast } from '../../components/ui/Toast'
import { useDocumentTitle, usePolling } from '../../hooks/misc'
import { useApi } from '../../hooks/useApi'
import { getErrorMessage } from '../../services/api'
import { deleteMessage, fetchConversation, fetchMessages, listConversations, markConversationRead, sendMessage } from '../../services/social'
import type { Conversation, Message } from '../../types/api'
import { cn } from '../../utils/cn'
import { formatDate, formatTime, relativeTime } from '../../utils/format'
import { useActivity } from '../notifications/ActivityContext'

const MESSAGE_POLL_MS = 4000
const LIST_POLL_MS = 15000

function ConversationAvatar({ conversation }: { conversation: Conversation }) {
  if (conversation.kind === 'project') {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300" aria-hidden="true">
        <Users className="size-5" />
      </span>
    )
  }
  const other = conversation.participants.find((p) => p.name === conversation.title) ?? conversation.participants[0]
  return <Avatar name={conversation.title} src={other?.avatar_url} size="md" />
}

function ConversationList({ conversations, activeId }: { conversations: Conversation[]; activeId?: string }) {
  if (!conversations.length) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        No conversations yet. Start one from someone's profile or from a project's team chat.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-line" aria-label="Conversations">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link
            to={`/messages/${conversation.id}`}
            aria-current={conversation.id === activeId ? 'page' : undefined}
            className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2', conversation.id === activeId && 'bg-surface-2')}
          >
            <ConversationAvatar conversation={conversation} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn('truncate text-sm', conversation.unread_count ? 'font-semibold text-fg' : 'font-medium text-fg')}>{conversation.title}</p>
                {conversation.last_message && <span className="shrink-0 text-[11px] text-subtle">{relativeTime(conversation.last_message.created_at)}</span>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={cn('truncate text-xs', conversation.unread_count ? 'text-muted' : 'text-subtle')}>
                  {conversation.last_message
                    ? `${conversation.last_message.sender_is_me ? 'You: ' : ''}${conversation.last_message.preview}`
                    : 'No messages yet'}
                </p>
                {conversation.unread_count > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
                    {conversation.unread_count}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function MessageBubble({ message, showSender, isProject, lastMine, onDelete, onReport }: {
  message: Message
  showSender: boolean
  isProject: boolean
  lastMine: boolean
  onDelete: () => void
  onReport: () => void
}) {
  return (
    <div className={cn('group flex gap-2', message.is_mine ? 'justify-end' : 'justify-start')}>
      {!message.is_mine && (
        <div className="w-8 shrink-0">{showSender && <Avatar name={message.sender.name} src={message.sender.avatar_url} size="sm" />}</div>
      )}
      <div className={cn('flex max-w-[78%] flex-col', message.is_mine ? 'items-end' : 'items-start')}>
        {showSender && !message.is_mine && isProject && <span className="mb-0.5 px-1 text-xs text-subtle">{message.sender.name}</span>}
        <div className="flex items-center gap-1">
          {message.is_mine && !message.deleted && (
            <IconButton size="sm" label="Delete message" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onClick={onDelete}>
              <Trash className="size-3.5" aria-hidden="true" />
            </IconButton>
          )}
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
              message.deleted ? 'border border-dashed border-line text-subtle italic' :
                message.is_mine ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-surface-3 text-fg',
            )}
          >
            {message.deleted ? 'Message deleted' : message.body}
          </div>
          {!message.is_mine && !message.deleted && (
            <IconButton size="sm" label="Report message" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onClick={onReport}>
              <Flag className="size-3.5" aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <span className="mt-0.5 px-1 text-[11px] text-subtle">
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
          {lastMine && message.seen_by > 0 && <> · {isProject ? `Seen by ${message.seen_by}` : 'Seen'}</>}
        </span>
      </div>
    </div>
  )
}

function ConversationView({ conversationId, onActivity }: { conversationId: string; onActivity: () => void }) {
  const toast = useToast()
  const { data: conversation, error: convError } = useApi((signal) => fetchConversation(conversationId, signal), [conversationId])
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState<Message | null>(null)
  const [reporting, setReporting] = useState<Message | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  useDocumentTitle(conversation?.title ?? 'Messages')

  const scrollToBottom = () => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    setMessages([])
    fetchMessages(conversationId, { limit: 30 }, controller.signal)
      .then((page) => {
        setMessages(page.items)
        setHasMore(page.has_more)
        stickToBottom.current = true
        markConversationRead(conversationId).then(onActivity).catch(() => undefined)
      })
      .catch((error) => !controller.signal.aborted && setLoadError(getErrorMessage(error)))
      .finally(() => !controller.signal.aborted && setLoading(false))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useLayoutEffect(() => {
    if (stickToBottom.current) scrollToBottom()
  }, [messages])

  const poll = useCallback(async () => {
    const last = messages[messages.length - 1]
    try {
      const page = await fetchMessages(conversationId, last ? { after: last.id, limit: 50 } : { limit: 30 })
      if (page.items.length) {
        const el = scroller.current
        stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
        setMessages((current) => {
          const seen = new Set(current.map((m) => m.id))
          return [...current, ...page.items.filter((m) => !seen.has(m.id))]
        })
        if (page.items.some((m) => !m.is_mine)) {
          await markConversationRead(conversationId)
          onActivity()
        }
      }
    } catch {
      // Transient polling failures are ignored; the next tick retries.
    }
  }, [conversationId, messages, onActivity])

  usePolling(poll, MESSAGE_POLL_MS, !loading && !loadError)

  const loadOlder = async () => {
    if (!messages.length) return
    setLoadingOlder(true)
    const el = scroller.current
    const previousHeight = el?.scrollHeight ?? 0
    try {
      const page = await fetchMessages(conversationId, { before: messages[0].id, limit: 30 })
      stickToBottom.current = false
      setMessages((current) => [...page.items, ...current])
      setHasMore(page.has_more)
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - previousHeight
      })
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoadingOlder(false)
    }
  }

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const message = await sendMessage(conversationId, body)
      stickToBottom.current = true
      setMessages((current) => [...current, message])
      setDraft('')
      onActivity()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  if (convError) {
    return <div className="p-6"><ErrorState title="Conversation unavailable" message={convError.status === 404 ? "This conversation doesn't exist or you're no longer part of it." : convError.message} /></div>
  }

  const lastMineId = [...messages].reverse().find((m) => m.is_mine)?.id
  const isProject = conversation?.kind === 'project'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link to="/messages" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        {conversation && <ConversationAvatar conversation={conversation} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-fg">{conversation?.title ?? 'Loading…'}</h2>
          {conversation?.kind === 'project' && conversation.project ? (
            <Link to={`/projects/${conversation.project.id}`} className="text-xs text-subtle hover:text-fg">
              {conversation.participants.length} members · View project
            </Link>
          ) : conversation?.kind === 'direct' ? (
            (() => {
              const other = conversation.participants.find((p) => p.name === conversation.title)
              return other?.handle ? <Link to={`/people/${other.handle}`} className="text-xs text-subtle hover:text-fg">View profile</Link> : null
            })()
          ) : null}
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        onScroll={(event) => {
          const el = event.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}>
        {loading ? (
          <div className="flex h-full items-center justify-center"><Spinner label="Loading messages" /></div>
        ) : loadError ? (
          <ErrorState message={loadError} />
        ) : (
          <div role="log" aria-live="polite" aria-label="Messages" className="space-y-2">
            {hasMore && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" size="sm" loading={loadingOlder} onClick={loadOlder}>Load earlier messages</Button>
              </div>
            )}
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-subtle">No messages yet. Say hello!</p>
            )}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString()
              const showSender = newDay || !previous || previous.sender.handle !== message.sender.handle || previous.is_mine !== message.is_mine
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <div className="flex items-center gap-3 py-2 text-[11px] text-subtle" role="separator">
                      <span className="h-px flex-1 bg-line" /> {formatDate(message.created_at)} <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <MessageBubble message={message} showSender={showSender} isProject={isProject} lastMine={message.id === lastMineId}
                    onDelete={() => setDeleting(message)} onReport={() => setReporting(message)} />
                </Fragment>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        {conversation && !conversation.can_send ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-center text-sm text-muted">{conversation.cannot_send_reason}</p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); void send() }} className="flex items-end gap-2">
            <label htmlFor="message-composer" className="sr-only">Write a message</label>
            <textarea
              id="message-composer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={2000}
              placeholder="Write a message. Enter to send, Shift+Enter for a new line."
              className="field max-h-40 min-h-11 flex-1 resize-none py-2.5"
              disabled={!conversation}
            />
            <Button type="submit" size="md" className="h-11" loading={sending} disabled={!draft.trim()} icon={<Send className="size-4" aria-hidden="true" />}>
              <span className="sr-only sm:not-sr-only">Send</span>
            </Button>
          </form>
        )}
        {draft.length > 1800 && <p className="mt-1 text-right text-xs text-subtle">{draft.length}/2000</p>}
      </div>

      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this message?"
        description="It will be replaced with “Message deleted” for everyone in the conversation." confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return
          const updated = await deleteMessage(conversationId, deleting.id)
          setMessages((current) => current.map((m) => (m.id === updated.id ? updated : m)))
        }} />
      {reporting && (
        <ReportDialog open onClose={() => setReporting(null)} targetType="message" targetId={reporting.id}
          targetLabel={`a message from ${reporting.sender.name}`} />
      )}
    </div>
  )
}

export default function MessagesPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const activity = useActivity()
  const list = useApi((signal) => listConversations(1, signal), [])
  useDocumentTitle('Messages')
  usePolling(list.reload, LIST_POLL_MS)

  const refreshActivity = activity.refresh
  const reloadList = list.reload
  const onActivity = useCallback(() => {
    refreshActivity()
    reloadList()
  }, [refreshActivity, reloadList])

  // Desktop convenience: open the most recent conversation when none is selected.
  useEffect(() => {
    if (!conversationId && list.data?.items.length && window.matchMedia('(min-width: 768px)').matches) {
      navigate(`/messages/${list.data.items[0].id}`, { replace: true })
    }
  }, [conversationId, list.data, navigate])

  return (
    <div className="mx-auto w-full max-w-6xl px-0 py-0 sm:px-6 sm:py-6">
      <div className="card flex h-[calc(100vh-4rem)] overflow-hidden rounded-none border-x-0 sm:h-[calc(100vh-7.5rem)] sm:rounded-xl sm:border-x">
        <aside className={cn('w-full shrink-0 flex-col border-r border-line md:flex md:w-80', conversationId ? 'hidden' : 'flex')} aria-label="Conversation list">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h1 className="text-lg font-semibold">Messages</h1>
            <ButtonLink to="/people" variant="ghost" size="sm">New</ButtonLink>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.loading && !list.data ? <div className="p-6"><Spinner label="Loading conversations" /></div> :
              list.error ? <div className="p-4"><ErrorState message={list.error.message} onRetry={list.reload} /></div> :
                <ConversationList conversations={list.data?.items ?? []} activeId={conversationId} />}
          </div>
        </aside>
        <section className={cn('min-w-0 flex-1 flex-col', conversationId ? 'flex' : 'hidden md:flex')} aria-label="Conversation">
          {conversationId ? (
            <ConversationView key={conversationId} conversationId={conversationId} onActivity={onActivity} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState icon={<MessageSquare />} title="Your conversations"
                description="Message members from their profile, or open your project's team chat from the project page."
                action={<ButtonLink to="/people" variant="secondary">Find people</ButtonLink>} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
