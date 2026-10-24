import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ensureCsrfToken, onUnauthorized, setCsrfToken } from '../../services/api'
import * as authService from '../../services/auth'
import type { AuthUser, PublicConfig, SignupResponse } from '../../types/api'
import { useToast } from '../../components/ui/Toast'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  config: PublicConfig | null
  isAdmin: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  signup: (name: string, email: string, password: string, username?: string) => Promise<SignupResponse>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: AuthUser | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// 401s that mean "wrong credentials", not "your session ended".
const NON_SESSION_401 = new Set(['invalid_credentials'])

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [config, setConfig] = useState<PublicConfig | null>(null)

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next)
    setStatus(next ? 'authenticated' : 'anonymous')
  }, [])

  const refresh = useCallback(async () => {
    try {
      setUser(await authService.fetchMe())
    } catch {
      setUser(null)
    }
  }, [setUser])

  useEffect(() => {
    let active = true
    // CSRF token first so the first form submit doesn't need an extra round trip.
    ensureCsrfToken().catch(() => undefined)
    authService.fetchPublicConfig().then((value) => active && setConfig(value)).catch(() => undefined)
    authService
      .fetchMe()
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null))
    return () => {
      active = false
    }
  }, [setUser])

  // A request returned 401 while we believed we were signed in: the session ended.
  const userRef = useRef<AuthUser | null>(null)
  userRef.current = user
  useEffect(() => {
    return onUnauthorized((error) => {
      if (NON_SESSION_401.has(error.code) || !userRef.current) return
      userRef.current = null
      toast.info('Your session has ended. Please sign in again.')
      setUser(null)
    })
  }, [toast, setUser])

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await authService.login(email, password)
      setUser(session.user)
      return session.user
    },
    [setUser],
  )

  const signup = useCallback(
    async (name: string, email: string, password: string, username?: string) => {
      const result = await authService.signup(name, email, password, username)
      if (result.user) setUser(result.user)
      return result
    },
    [setUser],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      setCsrfToken(null)
      setUser(null)
      ensureCsrfToken(true).catch(() => undefined)
    }
  }, [setUser])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, config, isAdmin: user?.role === 'admin', login, signup, logout, refresh, setUser }),
    [user, status, config, login, signup, logout, refresh, setUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** Only allow same-site relative paths as post-login redirects (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
