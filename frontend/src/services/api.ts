import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'

/** API root, e.g. "/api" (dev proxy or Vercel rewrite) or "https://api.example.com/api". */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export interface FieldErrors {
  [field: string]: string
}

/** Every failed request is normalized into this shape, so UI code handles errors one way. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly fieldErrors: FieldErrors
  readonly retryAfterSeconds: number | null

  constructor(status: number, code: string, message: string, details?: unknown, retryAfter?: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterSeconds = retryAfter ?? null
    this.fieldErrors = {}
    if (Array.isArray(details)) {
      for (const item of details) {
        if (item && typeof item === 'object' && 'field' in item && 'message' in item && item.field) {
          this.fieldErrors[String(item.field)] = String(item.message)
        }
      }
    }
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: 'That request could not be processed.',
  401: 'Please sign in to continue.',
  403: "You don't have permission to do that.",
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with the current state. Refresh and try again.',
  413: 'That file is too large.',
  422: 'Please check the highlighted fields.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const { status, data, headers } = error.response
      const body = (data as ErrorEnvelope | undefined)?.error
      const retryHeader = Number((headers as Record<string, unknown>)?.['retry-after'])
      return new ApiError(
        status,
        body?.code ?? 'http_error',
        body?.message ?? FALLBACK_MESSAGES[status] ?? 'Request failed.',
        body?.details,
        Number.isFinite(retryHeader) ? retryHeader : null,
      )
    }
    if (error.code === 'ECONNABORTED') {
      return new ApiError(0, 'timeout', 'The server took too long to respond. Please try again.')
    }
    if (error.code === 'ERR_CANCELED') return new ApiError(0, 'canceled', 'Request canceled.')
    return new ApiError(0, 'network_error', "Can't reach the HackMate server. Check your connection and try again.")
  }
  return new ApiError(0, 'unknown_error', error instanceof Error ? error.message : 'Something went wrong.')
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function isCanceled(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'canceled'
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send the HttpOnly session cookie
  timeout: 20_000,
  headers: { Accept: 'application/json' },
})

// --- CSRF (double-submit) ------------------------------------------------------
// The backend sets an HttpOnly CSRF cookie and returns the same token in JSON.
// The token is kept in memory and echoed in a header on every unsafe request.

let csrfToken: string | null = null
let csrfRequest: Promise<string> | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export async function ensureCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken
  if (!csrfRequest) {
    csrfRequest = axios
      .get<{ csrf_token: string }>(`${API_BASE_URL}/auth/csrf`, { withCredentials: true, timeout: 15_000 })
      .then((response) => {
        csrfToken = response.data.csrf_token
        return csrfToken
      })
      .catch((error) => {
        throw toApiError(error)
      })
      .finally(() => {
        csrfRequest = null
      })
  }
  return csrfRequest
}

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

type RetriableConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean }

api.interceptors.request.use(async (config) => {
  if (config.method && UNSAFE_METHODS.has(config.method.toLowerCase())) {
    const token = await ensureCsrfToken()
    const headers = AxiosHeaders.from(config.headers)
    headers.set('X-CSRF-Token', token)
    config.headers = headers
  }
  return config
})

type UnauthorizedListener = (error: ApiError) => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

/** Notified whenever an API call returns 401 (e.g. the session expired or was revoked). */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

api.interceptors.response.use(
  (response) => {
    const token = (response.data as { csrf_token?: unknown } | undefined)?.csrf_token
    if (typeof token === 'string') csrfToken = token // rotated on sign-in/sign-up
    return response
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const code = (error.response?.data as ErrorEnvelope | undefined)?.error?.code
    if (error.response?.status === 403 && code === 'csrf_failed' && config && !config._csrfRetried) {
      config._csrfRetried = true // token expired or cookie cleared: refresh once and retry
      await ensureCsrfToken(true)
      return api.request(config)
    }
    const apiError = toApiError(error)
    if (apiError.status === 401) unauthorizedListeners.forEach((listener) => listener(apiError))
    throw apiError
  },
)

/**
 * The API returns paths such as "/api/profiles/ada/avatar?v=1". When the API
 * lives on another origin (cross-site mode), prefix that origin.
 */
export function resolveApiUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return new URL(API_BASE_URL).origin + path
  }
  return path
}

/** Serialize list filters the way the backend expects ("a,b,c"); empty values are dropped. */
export function cleanParams(params: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) out[key] = value.join(',')
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}
