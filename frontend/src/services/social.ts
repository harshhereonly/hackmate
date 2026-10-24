// Matching, messaging, notifications and reports.
import { api } from './api'
import type {
  AppNotification,
  Conversation,
  Message,
  MessagePage,
  OpportunitySuggestion,
  Page,
  Report,
  ReportReason,
  ReportTargetType,
  Suggestions,
  TeammateSuggestion,
  UnreadMessages,
} from '../types/api'

// --- Matching ---------------------------------------------------------------------

export async function fetchSuggestedTeammates(limit = 10, signal?: AbortSignal): Promise<Suggestions<TeammateSuggestion>> {
  const { data } = await api.get<Suggestions<TeammateSuggestion>>('/matching/teammates', { params: { limit }, signal })
  return data
}

export async function fetchProjectCandidates(projectId: string, limit = 10, signal?: AbortSignal): Promise<Suggestions<TeammateSuggestion>> {
  const { data } = await api.get<Suggestions<TeammateSuggestion>>(`/matching/projects/${projectId}/candidates`, {
    params: { limit },
    signal,
  })
  return data
}

export async function fetchSuggestedOpportunities(limit = 10, signal?: AbortSignal): Promise<Suggestions<OpportunitySuggestion>> {
  const { data } = await api.get<Suggestions<OpportunitySuggestion>>('/matching/opportunities', { params: { limit }, signal })
  return data
}

export async function fetchOpportunityTeammates(id: string, limit = 6, signal?: AbortSignal): Promise<Suggestions<TeammateSuggestion>> {
  const { data } = await api.get<Suggestions<TeammateSuggestion>>(`/matching/opportunities/${id}/teammates`, {
    params: { limit },
    signal,
  })
  return data
}

// --- Messaging ------------------------------------------------------------------------

export async function listConversations(page = 1, signal?: AbortSignal): Promise<Page<Conversation>> {
  const { data } = await api.get<Page<Conversation>>('/conversations', { params: { page, page_size: 50 }, signal })
  return data
}

export async function fetchConversation(id: string, signal?: AbortSignal): Promise<Conversation> {
  const { data } = await api.get<Conversation>(`/conversations/${id}`, { signal })
  return data
}

export async function openDirectConversation(handle: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>('/conversations/direct', { handle })
  return data
}

export async function openProjectConversation(projectId: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>(`/conversations/project/${projectId}`)
  return data
}

export async function fetchMessages(
  conversationId: string,
  params: { before?: string; after?: string; limit?: number },
  signal?: AbortSignal,
): Promise<MessagePage> {
  const { data } = await api.get<MessagePage>(`/conversations/${conversationId}/messages`, { params, signal })
  return data
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  const { data } = await api.post<Message>(`/conversations/${conversationId}/messages`, { body })
  return data
}

export async function deleteMessage(conversationId: string, messageId: string): Promise<Message> {
  const { data } = await api.delete<Message>(`/conversations/${conversationId}/messages/${messageId}`)
  return data
}

export async function markConversationRead(conversationId: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>(`/conversations/${conversationId}/read`)
  return data
}

export async function fetchUnreadMessages(signal?: AbortSignal): Promise<UnreadMessages> {
  const { data } = await api.get<UnreadMessages>('/conversations/unread', { signal })
  return data
}

// --- Notifications ------------------------------------------------------------------

export async function listNotifications(unreadOnly: boolean, page = 1, signal?: AbortSignal): Promise<Page<AppNotification>> {
  const { data } = await api.get<Page<AppNotification>>('/notifications', {
    params: { unread_only: unreadOnly, page, page_size: 15 },
    signal,
  })
  return data
}

export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count', { signal })
  return data.count
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  const { data } = await api.post<AppNotification>(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all')
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`)
}

// --- Reports ------------------------------------------------------------------------

export async function createReport(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string,
): Promise<Report> {
  const { data } = await api.post<Report>('/reports', { target_type: targetType, target_id: targetId, reason, details })
  return data
}

export async function listMyReports(page = 1, signal?: AbortSignal): Promise<Page<Report>> {
  const { data } = await api.get<Page<Report>>('/reports/mine', { params: { page }, signal })
  return data
}
