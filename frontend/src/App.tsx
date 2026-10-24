import { RouterProvider } from 'react-router/dom'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider } from './features/auth/AuthContext'
import { ActivityProvider } from './features/notifications/ActivityContext'
import { SavedProvider } from './features/saved/SavedContext'
import { router } from './router'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SavedProvider>
          <ActivityProvider>
            <RouterProvider router={router} />
          </ActivityProvider>
        </SavedProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
