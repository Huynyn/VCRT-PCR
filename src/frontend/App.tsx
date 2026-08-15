import React, { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { Loading } from '@/components/ui'
import LoginPage from './pages/LoginPage'
import { AuthProvider, NotificationProvider, FormProvider, useAuth } from '@/context'
import { useTimeout } from '@/hooks'
import { runPcrNavigationGuard } from '@/utils/navigationGuard'

// Code-split by route: each page becomes its own chunk instead of all being
// eagerly bundled into main.js (which was pushing 1.3MB+), so the browser
// only has to parse/compile the page the user is actually on.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PCRPage = lazy(() => import('./pages/PCRPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ActivityLogsPage = lazy(() => import('./pages/ActivityLogsPage'))
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'))

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <Loading text="Loading..." overlay />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Main Application Component
const AppContent: React.FC = () => {
  const { user, logout, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('pcr_theme')
    return saved ? saved === 'dark' : true
  })
  const [currentPath, setCurrentPath] = useState(location.pathname)

  // Sync currentPath with location (for browser back/forward navigation)
  useEffect(() => {
    setCurrentPath(location.pathname)
  }, [location.pathname])

  // Session timeout management
  useTimeout({
    timeoutDuration: 30 * 60 * 1000, // 30 minutes
    warningDuration: 5 * 60 * 1000, // 5 minutes warning
    enabled: isAuthenticated,
  })

  // Theme toggle
  const toggleTheme = () => {
    const newTheme = !darkMode
    setDarkMode(newTheme)
    localStorage.setItem('pcr_theme', newTheme ? 'dark' : 'light')

    if (newTheme) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Initialize theme
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Handle navigation - if the New PCR page has unsaved changes, it gets a
  // chance to prompt "save draft before leaving?" first (see navigationGuard).
  const handleNavigate = async (href: string) => {
    if (href !== currentPath) {
      const okToLeave = await runPcrNavigationGuard()
      if (!okToLeave) return
    }
    navigate(href)
    setCurrentPath(href)
  }

  if (isLoading) {
    return <Loading text="Initializing application..." overlay />
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <Layout
      currentPath={currentPath}
      user={
        user
          ? {
              name: `${user.firstName} ${user.lastName}`,
              role: user.role,
            }
          : undefined
      }
      onLogout={logout}
      onNavigate={handleNavigate}
      darkMode={darkMode}
      onToggleTheme={toggleTheme}
    >
      <Suspense fallback={<Loading text="Loading..." overlay />}>
        <Routes>
          {/* Dashboard */}
          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          {/* New PCR Form */}
          <Route
            path="/pcr/new"
            element={
              <FormProvider>
                <PCRPage />
              </FormProvider>
            }
          />

          {/* PCR Reports */}
          <Route
            path="/pcr"
            element={<ReportsPage />}
          />

          {/* Reports Route (alias for /pcr) */}
          <Route
            path="/reports"
            element={<ReportsPage />}
          />

          {/* Activity Logs */}
          <Route
            path="/logs"
            element={<ActivityLogsPage />}
          />

          {/* Admin Routes */}
          <Route
            path="/admin/users"
            element={<UserManagementPage />}
          />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 Page */}
          <Route
            path="*"
            element={
              <div className="text-center space-y-4">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">404</h1>
                <p className="text-gray-600 dark:text-gray-400">Page not found</p>
                <button onClick={() => handleNavigate('/dashboard')} className="btn btn-primary">
                  Go to Dashboard
                </button>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </Layout>
  )
}

// Main App Component with Providers
const App: React.FC = () => {
  return (
    <NotificationProvider>
      <AuthProvider>
        <div className="App">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </NotificationProvider>
  )
}

export default App
