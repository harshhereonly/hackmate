import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { ApiError, toApiError } from '../services/api'
import { loginSchema, signupSchema } from '../features/auth/schemas'
import { safeNextPath } from '../features/auth/AuthContext'
import LoginPage from '../features/auth/LoginPage'
import { RequireAdmin, RequireAuth } from '../features/auth/guards'
import { ToastProvider } from '../components/ui/Toast'
import * as authModule from '../features/auth/AuthContext'

describe('form validation', () => {
  it('rejects weak signup passwords and mismatches', () => {
    const base = { name: 'Ada', username: '', email: 'ada@example.com', password: 'abcdefgh1', confirmPassword: 'abcdefgh1' }
    expect(signupSchema.safeParse(base).success).toBe(true)
    expect(signupSchema.safeParse({ ...base, password: 'short1', confirmPassword: 'short1' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...base, password: 'onlyletters', confirmPassword: 'onlyletters' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...base, confirmPassword: 'different1' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...base, username: 'Ada-Codes' }).success).toBe(true)
    expect(signupSchema.safeParse({ ...base, username: 'a' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...base, username: 'bad name!' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...base, username: 'a--b' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false)
  })
  it('only allows same-site redirect paths', () => {
    expect(safeNextPath('/projects/1')).toBe('/projects/1')
    expect(safeNextPath('//evil.com')).toBe('/dashboard')
    expect(safeNextPath('https://evil.com')).toBe('/dashboard')
  })
})

describe('API error handling', () => {
  it('normalizes server error envelopes and field errors', () => {
    const err = new AxiosError('x', '422', undefined, undefined, {
      status: 422, statusText: '', headers: {}, config: { headers: new AxiosHeaders() },
      data: { error: { code: 'validation_error', message: 'Bad', details: [{ field: 'email', message: 'Invalid' }] } },
    })
    const api = toApiError(err)
    expect(api).toBeInstanceOf(ApiError)
    expect(api.code).toBe('validation_error')
    expect(api.fieldErrors.email).toBe('Invalid')
  })
  it('reports network failures in plain language', () => {
    const api = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'))
    expect(api.code).toBe('network_error')
    expect(api.message).toMatch(/can't reach/i)
  })
})

function mockAuth(value: Partial<ReturnType<typeof authModule.useAuth>>) {
  vi.spyOn(authModule, 'useAuth').mockReturnValue({
    user: null, status: 'anonymous', config: null, isAdmin: false,
    login: vi.fn(), signup: vi.fn(), logout: vi.fn(), refresh: vi.fn(), setUser: vi.fn(), ...value,
  } as never)
}

describe('login journey', () => {
  it('shows validation errors without calling the API', async () => {
    const login = vi.fn()
    mockAuth({ login })
    render(<ToastProvider><MemoryRouter><LoginPage /></MemoryRouter></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByText('Email is required.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })
  it('shows the server error for wrong credentials', async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Incorrect email or password.'))
    mockAuth({ login })
    render(<ToastProvider><MemoryRouter><LoginPage /></MemoryRouter></ToastProvider>)
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Password1')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })
  it('signs in and redirects to the requested page', async () => {
    const login = vi.fn().mockResolvedValue({})
    mockAuth({ login })
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/login?next=/projects']}>
          <Routes><Route path="/login" element={<LoginPage />} /><Route path="/projects" element={<p>Projects page</p>} /></Routes>
        </MemoryRouter>
      </ToastProvider>,
    )
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'Password1')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(screen.getByText('Projects page')).toBeInTheDocument())
  })
})

describe('route guards', () => {
  const tree = (
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route element={<RequireAuth />}><Route path="/admin" element={<RequireAdmin><p>Admin area</p></RequireAdmin>} /></Route>
      </Routes>
    </MemoryRouter>
  )
  it('sends anonymous visitors to login', () => {
    mockAuth({ status: 'anonymous' })
    render(tree)
    expect(screen.getByText('Login screen')).toBeInTheDocument()
  })
  it('blocks non-admins and admits admins', () => {
    mockAuth({ status: 'authenticated', isAdmin: false })
    const { unmount } = render(tree)
    expect(screen.getByText('Administrators only')).toBeInTheDocument()
    unmount()
    mockAuth({ status: 'authenticated', isAdmin: true })
    render(tree)
    expect(screen.getByText('Admin area')).toBeInTheDocument()
  })
})
