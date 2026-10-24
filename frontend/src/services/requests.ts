import { api } from './api'
import type { JoinRequest, Page } from '../types/api'

export type RequestBox = 'incoming' | 'outgoing'
export type RequestStatusFilter = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'all'

export async function listRequests(
  box: RequestBox,
  status: RequestStatusFilter,
  page = 1,
  signal?: AbortSignal,
): Promise<Page<JoinRequest>> {
  const { data } = await api.get<Page<JoinRequest>>('/requests', { params: { box, status, page, page_size: 10 }, signal })
  return data
}

export async function fetchRequestSummary(signal?: AbortSignal): Promise<{ incoming_pending: number; outgoing_pending: number }> {
  const { data } = await api.get('/requests/summary', { signal })
  return data
}

export async function acceptRequest(id: string): Promise<JoinRequest> {
  const { data } = await api.post<JoinRequest>(`/requests/${id}/accept`)
  return data
}

export async function rejectRequest(id: string, note?: string): Promise<JoinRequest> {
  const { data } = await api.post<JoinRequest>(`/requests/${id}/reject`, note ? { note } : undefined)
  return data
}

export async function withdrawRequest(id: string): Promise<JoinRequest> {
  const { data } = await api.post<JoinRequest>(`/requests/${id}/withdraw`)
  return data
}
