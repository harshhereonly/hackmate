import { z } from 'zod'

// Mirrors backend/app/schemas/auth.py so most errors are caught before a request.
export const emailSchema = z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.')

export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.')

// Optional: leave blank to get a generated username. Mirrors the backend handle rules.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => !v || /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(v), '3–30 characters: letters, numbers and hyphens.')
  .refine((v) => !v.includes('--'), 'Use single hyphens only.')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(80, 'Name must be 80 characters or fewer.'),
    username: usernameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
export type SignupValues = z.infer<typeof signupSchema>

export const forgotSchema = z.object({ email: emailSchema })
export type ForgotValues = z.infer<typeof forgotSchema>

export const resetSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string().min(1, 'Please confirm your password.') })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
export type ResetValues = z.infer<typeof resetSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
