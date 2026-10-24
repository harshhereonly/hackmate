import { api, cleanParams } from './api'
import type {
  OpenSourceIssue,
  Opportunity,
  OpportunityApplication,
  OpportunityInput,
  Page,
  Paper,
  ProjectListItem,
  ProviderPage,
  ProviderStatus,
  ProfileCard,
  SaveItemInput,
  SavedItem,
  SavedItemType,
} from '../types/api'

export interface OpportunityFilters {
  type?: string[]
  q?: string
  skills?: string[]
  mode?: string[]
  timing?: 'active' | 'upcoming' | 'ongoing' | 'past' | 'all'
  source?: string[]
  include_demo?: boolean
  sort?: 'deadline' | 'recent'
  page?: number
  page_size?: number
}

export async function listOpportunities(filters: OpportunityFilters, signal?: AbortSignal): Promise<Page<Opportunity>> {
  const { data } = await api.get<Page<Opportunity>>('/opportunities', { params: cleanParams({ ...filters }), signal })
  return data
}

export async function fetchOpportunity(id: string, signal?: AbortSignal): Promise<Opportunity> {
  const { data } = await api.get<Opportunity>(`/opportunities/${id}`, { signal })
  return data
}

export async function createOpportunity(input: OpportunityInput): Promise<Opportunity> {
  const { data } = await api.post<Opportunity>('/opportunities', input)
  return data
}

export async function updateOpportunity(id: string, input: Partial<OpportunityInput>): Promise<Opportunity> {
  const { data } = await api.patch<Opportunity>(`/opportunities/${id}`, input)
  return data
}

export async function deleteOpportunity(id: string): Promise<void> {
  await api.delete(`/opportunities/${id}`)
}

export async function listMyOpportunities(page = 1, signal?: AbortSignal): Promise<Page<Opportunity>> {
  const { data } = await api.get<Page<Opportunity>>('/opportunities/mine', { params: { page }, signal })
  return data
}

export async function fetchTeamsForOpportunity(id: string, signal?: AbortSignal): Promise<Page<ProjectListItem>> {
  const { data } = await api.get<Page<ProjectListItem>>(`/opportunities/${id}/teams`, { params: { page_size: 6 }, signal })
  return data
}

export async function applyToOpportunity(id: string, message: string): Promise<OpportunityApplication> {
  const { data } = await api.post<OpportunityApplication>(`/opportunities/${id}/applications`, { message })
  return data
}

export async function listApplications(
  box: 'incoming' | 'outgoing',
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'all',
  page = 1,
  signal?: AbortSignal,
): Promise<Page<OpportunityApplication>> {
  const { data } = await api.get<Page<OpportunityApplication>>('/opportunities/applications', {
    params: { box, status, page, page_size: 10 },
    signal,
  })
  return data
}

export async function actOnApplication(id: string, action: 'accept' | 'decline' | 'withdraw'): Promise<OpportunityApplication> {
  const { data } = await api.post<OpportunityApplication>(`/opportunities/applications/${id}/${action}`)
  return data
}

export async function searchOpenSource(
  params: { q?: string; language?: string; page?: number },
  signal?: AbortSignal,
): Promise<ProviderPage<OpenSourceIssue>> {
  const { data } = await api.get<ProviderPage<OpenSourceIssue>>('/opportunities/open-source', {
    params: cleanParams({ ...params, page_size: 10 }),
    signal,
  })
  return data
}

export async function fetchProviderStatus(signal?: AbortSignal): Promise<ProviderStatus[]> {
  const { data } = await api.get<ProviderStatus[]>('/opportunities/sources', { signal })
  return data
}

// --- Research -------------------------------------------------------------------

export async function searchPapers(
  params: { q: string; field?: 'all' | 'title' | 'author'; page?: number },
  signal?: AbortSignal,
): Promise<ProviderPage<Paper>> {
  const { data } = await api.get<ProviderPage<Paper>>('/research/papers', {
    params: cleanParams({ ...params, page_size: 10 }),
    signal,
  })
  return data
}

export async function searchResearchPeople(q: string, page = 1, signal?: AbortSignal): Promise<Page<ProfileCard>> {
  const { data } = await api.get<Page<ProfileCard>>('/research/people', { params: { q, page, page_size: 6 }, signal })
  return data
}

// --- Saved items -------------------------------------------------------------------

export async function listSaved(itemType: SavedItemType | undefined, page = 1, signal?: AbortSignal): Promise<Page<SavedItem>> {
  const { data } = await api.get<Page<SavedItem>>('/saved', { params: cleanParams({ item_type: itemType, page }), signal })
  return data
}

export async function fetchSavedKeys(signal?: AbortSignal): Promise<string[]> {
  const { data } = await api.get<string[]>('/saved/keys', { signal })
  return data
}

export async function saveItem(input: SaveItemInput): Promise<SavedItem> {
  const { data } = await api.post<SavedItem>('/saved', input)
  return data
}

export async function unsaveItem(key: string): Promise<void> {
  await api.delete('/saved', { params: { key } })
}
