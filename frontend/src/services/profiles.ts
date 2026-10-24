import { api, cleanParams } from './api'
import type { Page, ProfileCard, ProfileMe, ProfilePublic, ProfileUpdate } from '../types/api'

export interface ProfileFilters {
  q?: string
  skills?: string[]
  skills_mode?: 'any' | 'all'
  interests?: string[]
  experience?: string[]
  roles?: string[]
  availability?: string[]
  mode?: string[]
  open_only?: boolean
  sort?: 'recent' | 'name'
  page?: number
  page_size?: number
}

export interface HandleCheck {
  handle: string
  valid: boolean
  available: boolean
  message: string
}

export async function checkHandle(handle: string, signal?: AbortSignal): Promise<HandleCheck> {
  const { data } = await api.get<HandleCheck>('/profiles/handle-available', { params: { handle }, signal })
  return data
}

export async function fetchMyProfile(signal?: AbortSignal): Promise<ProfileMe> {
  const { data } = await api.get<ProfileMe>('/profiles/me', { signal })
  return data
}

export async function updateMyProfile(update: ProfileUpdate): Promise<ProfileMe> {
  const { data } = await api.patch<ProfileMe>('/profiles/me', update)
  return data
}

export async function uploadAvatar(file: File): Promise<ProfileMe> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<ProfileMe>('/profiles/me/avatar', form)
  return data
}

export async function deleteAvatar(): Promise<ProfileMe> {
  const { data } = await api.delete<ProfileMe>('/profiles/me/avatar')
  return data
}

export async function listProfiles(filters: ProfileFilters, signal?: AbortSignal): Promise<Page<ProfileCard>> {
  const { data } = await api.get<Page<ProfileCard>>('/profiles', { params: cleanParams({ ...filters }), signal })
  return data
}

export async function fetchProfile(handle: string, signal?: AbortSignal): Promise<ProfilePublic> {
  const { data } = await api.get<ProfilePublic>(`/profiles/${encodeURIComponent(handle)}`, { signal })
  return data
}
