import { api, cleanParams } from './api'
import type {
  AdminListing,
  AdminReport,
  AdminStats,
  AdminUser,
  AuditEntry,
  CuratedOpportunityInput,
  FeedSyncResult,
  Opportunity,
  Page,
  ProviderStatus,
  ReportStatus,
} from '../types/api'

export async function fetchAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>('/admin/stats', { signal })
  return data
}

export async function listAdminUsers(
  params: { q?: string; status?: string; role?: string; page?: number },
  signal?: AbortSignal,
): Promise<Page<AdminUser>> {
  const { data } = await api.get<Page<AdminUser>>('/admin/users', { params: cleanParams({ ...params, page_size: 15 }), signal })
  return data
}

export async function suspendUser(id: string, reason: string): Promise<void> {
  await api.post(`/admin/users/${id}/suspend`, { reason })
}

export async function reactivateUser(id: string): Promise<void> {
  await api.post(`/admin/users/${id}/reactivate`)
}

export async function listAdminReports(
  params: { status?: ReportStatus | 'all'; target_type?: string; page?: number },
  signal?: AbortSignal,
): Promise<Page<AdminReport>> {
  const { data } = await api.get<Page<AdminReport>>('/admin/reports', { params: cleanParams({ ...params, page_size: 10 }), signal })
  return data
}

export async function resolveReport(id: string, resolution: 'resolved' | 'dismissed', note: string): Promise<void> {
  await api.post(`/admin/reports/${id}/resolve`, { resolution, note })
}

export async function listAdminListings(
  params: { kind: 'project' | 'opportunity'; removed?: boolean; q?: string; page?: number },
  signal?: AbortSignal,
): Promise<Page<AdminListing>> {
  const { data } = await api.get<Page<AdminListing>>('/admin/listings', { params: cleanParams({ ...params, page_size: 15 }), signal })
  return data
}

export async function setListingRemoved(kind: 'project' | 'opportunity', id: string, removed: boolean, reason?: string) {
  const base = kind === 'project' ? 'projects' : 'opportunities'
  await api.post(`/admin/${base}/${id}/${removed ? 'remove' : 'restore'}`, removed ? { reason } : undefined)
}

export async function removeMessage(id: string, reason: string): Promise<void> {
  await api.post(`/admin/messages/${id}/remove`, { reason })
}

export async function listAdminOpportunities(
  params: { type?: string; source?: string; page?: number },
  signal?: AbortSignal,
): Promise<Page<Opportunity>> {
  const { data } = await api.get<Page<Opportunity>>('/admin/opportunities', { params: cleanParams({ ...params, page_size: 15 }), signal })
  return data
}

export async function createCuratedOpportunity(input: CuratedOpportunityInput): Promise<Opportunity> {
  const { data } = await api.post<Opportunity>('/admin/opportunities', input)
  return data
}

export async function updateCuratedOpportunity(id: string, input: Partial<CuratedOpportunityInput>): Promise<Opportunity> {
  const { data } = await api.patch<Opportunity>(`/admin/opportunities/${id}`, input)
  return data
}

export async function deleteCuratedOpportunity(id: string): Promise<void> {
  await api.delete(`/admin/opportunities/${id}`)
}

export async function syncFeeds(): Promise<FeedSyncResult[]> {
  const { data } = await api.post<FeedSyncResult[]>('/admin/opportunities/sync-feeds')
  return data
}

export async function fetchAdminProviders(signal?: AbortSignal): Promise<ProviderStatus[]> {
  const { data } = await api.get<ProviderStatus[]>('/admin/providers', { signal })
  return data
}

export async function listAudit(page = 1, signal?: AbortSignal): Promise<Page<AuditEntry>> {
  const { data } = await api.get<Page<AuditEntry>>('/admin/audit', { params: { page, page_size: 20 }, signal })
  return data
}
