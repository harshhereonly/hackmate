import { api, cleanParams } from './api'
import type { JoinRequest, Page, ProjectDetail, ProjectInput, ProjectListItem, ProjectMember, Role } from '../types/api'

export interface ProjectFilters {
  q?: string
  skills?: string[]
  category?: string[]
  status?: string[]
  mode?: string[]
  has_openings?: boolean
  member?: string
  sort?: 'recent' | 'title'
  page?: number
  page_size?: number
}

export async function listProjects(filters: ProjectFilters, signal?: AbortSignal): Promise<Page<ProjectListItem>> {
  const { data } = await api.get<Page<ProjectListItem>>('/projects', { params: cleanParams({ ...filters }), signal })
  return data
}

export async function listMyProjects(
  role: 'all' | 'owner' | 'member' = 'all',
  page = 1,
  signal?: AbortSignal,
): Promise<Page<ProjectListItem>> {
  const { data } = await api.get<Page<ProjectListItem>>('/projects/mine', { params: { role, page, page_size: 12 }, signal })
  return data
}

export async function fetchProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(`/projects/${id}`, { signal })
  return data
}

export async function createProject(input: ProjectInput): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>('/projects', input)
  return data
}

export async function updateProject(id: string, input: Partial<ProjectInput>): Promise<ProjectDetail> {
  const { data } = await api.patch<ProjectDetail>(`/projects/${id}`, input)
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`)
}

export async function fetchMembers(id: string, signal?: AbortSignal): Promise<ProjectMember[]> {
  const { data } = await api.get<ProjectMember[]>(`/projects/${id}/members`, { signal })
  return data
}

export async function removeMember(id: string, handle: string): Promise<void> {
  await api.delete(`/projects/${id}/members/${encodeURIComponent(handle)}`)
}

export async function leaveProject(id: string): Promise<void> {
  await api.post(`/projects/${id}/leave`)
}

export async function requestToJoin(id: string, message: string, role: Role | null): Promise<JoinRequest> {
  const { data } = await api.post<JoinRequest>(`/projects/${id}/requests`, { message, role })
  return data
}

export async function listProjectRequests(
  id: string,
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'all' = 'pending',
  signal?: AbortSignal,
): Promise<Page<JoinRequest>> {
  const { data } = await api.get<Page<JoinRequest>>(`/projects/${id}/requests`, { params: { status, page_size: 20 }, signal })
  return data
}

export async function inviteToProject(id: string, handle: string, message: string, role: Role | null): Promise<JoinRequest> {
  const { data } = await api.post<JoinRequest>(`/projects/${id}/invitations`, { handle, message, role })
  return data
}
