import { api } from './api'
import type { AuthUser, EmailActionResponse, PublicConfig, SessionResponse, SignupResponse } from '../types/api'

export async function fetchMe(signal?: AbortSignal): Promise<AuthUser> {
  const { data } = await api.get<{ user: AuthUser }>('/auth/me', { signal })
  return data.user
}

export async function login(email: string, password: string): Promise<SessionResponse> {
  const { data } = await api.post<SessionResponse>('/auth/login', { email, password })
  return data
}

export async function signup(name: string, email: string, password: string, username?: string): Promise<SignupResponse> {
  const { data } = await api.post<SignupResponse>('/auth/signup', { name, email, password, username: username || undefined })
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function logoutEverywhere(): Promise<void> {
  await api.post('/auth/logout-all')
}

export async function forgotPassword(email: string): Promise<EmailActionResponse> {
  const { data } = await api.post<EmailActionResponse>('/auth/forgot-password', { email })
  return data
}

export async function resetPassword(token: string, password: string): Promise<string> {
  const { data } = await api.post<{ message: string }>('/auth/reset-password', { token, password })
  return data.message
}

export async function verifyEmail(token: string): Promise<string> {
  const { data } = await api.post<{ message: string }>('/auth/verify-email', { token })
  return data.message
}

export async function resendVerification(email: string): Promise<EmailActionResponse> {
  const { data } = await api.post<EmailActionResponse>('/auth/resend-verification', { email })
  return data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<string> {
  const { data } = await api.post<{ message: string }>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return data.message
}

export async function fetchPublicConfig(signal?: AbortSignal): Promise<PublicConfig> {
  const { data } = await api.get<PublicConfig>('/meta/config', { signal })
  return data
}
