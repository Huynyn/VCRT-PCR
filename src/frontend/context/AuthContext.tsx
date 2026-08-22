import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'
import type { AuthContextType, User } from '@/types'
import { sessionService } from '@/services/session.service'
import { runPcrCloseHandler } from '@/utils/electronCloseGuard'
import { pdfService } from '@/services/pdf.service'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionId: string | null
  sessionExpires: Date | null
}

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; sessionId: string; expiresAt: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'RESTORE_SESSION'; payload: { user: User; sessionId: string; expiresAt: string } }
  | { type: 'EXTEND_SESSION'; payload: { expiresAt: string } }

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  sessionId: null,
  sessionExpires: null,
}

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
      }
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        sessionId: action.payload.sessionId,
        sessionExpires: new Date(action.payload.expiresAt),
      }
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        sessionId: null,
        sessionExpires: null,
      }
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        sessionId: null,
        sessionExpires: null,
      }
    case 'RESTORE_SESSION':
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        sessionId: action.payload.sessionId,
        sessionExpires: new Date(action.payload.expiresAt),
      }
    case 'EXTEND_SESSION':
      return {
        ...state,
        sessionExpires: new Date(action.payload.expiresAt),
      }
    default:
      return state
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const [apiBaseUrl, setApiBaseUrl] = React.useState<string>('/api')

  // Initialize API base URL for Electron
  useEffect(() => {
    const initializeApiUrl = async () => {
      if (window.electronAPI) {
        try {
          const port = await window.electronAPI.getServerPort()
          const baseUrl = `http://localhost:${port}/api`
          setApiBaseUrl(baseUrl)
          console.log(`Electron mode: API base URL set to ${baseUrl}`)
        } catch (error) {
          console.error('Failed to get Electron server port:', error)
          setApiBaseUrl('/api')
        }
      }
    }
    initializeApiUrl()
  }, [])

  // Clear stored authentication data
  const clearStoredAuth = useCallback(() => {
    localStorage.removeItem('pcr_user')
    localStorage.removeItem('pcr_token')
    localStorage.removeItem('pcr_session_id')
    localStorage.removeItem('pcr_session_expiry')
    sessionService.clearAuthToken()
  }, [])

  // Restore session on app load
  useEffect(() => {
    const restoreSession = async () => {
      console.log('Attempting to restore session...')
      try {
        const storedUser = localStorage.getItem('pcr_user')
        const storedToken = localStorage.getItem('pcr_token')
        const storedSessionId = localStorage.getItem('pcr_session_id')
        const storedExpiry = localStorage.getItem('pcr_session_expiry')
        
        console.log('Stored session data:', { hasUser: !!storedUser, hasToken: !!storedToken })
        
        if (storedUser && storedToken && storedSessionId && storedExpiry) {
          const user = JSON.parse(storedUser)
          const expiryDate = new Date(storedExpiry)
          
          // Check if session is still valid
          if (expiryDate > new Date()) {
            sessionService.setAuthToken(storedToken)
            
            // For demo purposes, skip backend validation and just restore session
            console.log('Skipping backend validation for demo - restoring session')
            dispatch({ 
              type: 'RESTORE_SESSION', 
              payload: { user, sessionId: storedSessionId, expiresAt: storedExpiry }
            })
            return
          }
        }
        
        // If no valid session, clear storage
        console.log('No valid session found, setting loading to false')
        clearStoredAuth()
        dispatch({ type: 'LOGIN_FAILURE' })
      } catch (error) {
        console.error('Error restoring session:', error)
        clearStoredAuth()
        dispatch({ type: 'LOGIN_FAILURE' })
      }
    }

    restoreSession()
  }, [clearStoredAuth])


  const login = async (username: string, password: string): Promise<void> => {
    console.log('Login attempt:', { username })
    dispatch({ type: 'LOGIN_START' })

    try {
      // Call actual backend API
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        const loginError = new Error(result.message || 'Login failed') as Error & { status?: number }
        loginError.status = response.status
        throw loginError
      }

      const { user: userData, token, expiresIn } = result.data

      // Map backend user data to frontend User type
      const user: User = {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isActive: userData.isActive,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
        viaTempLogin: userData.viaTempLogin,
      }

      // Calculate session expiry
      const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString()
      const sessionId = 'session_' + Math.random().toString(36).substr(2, 9)

      sessionService.setAuthToken(token)

      // Store in localStorage
      localStorage.setItem('pcr_user', JSON.stringify(user))
      localStorage.setItem('pcr_token', token)
      localStorage.setItem('pcr_session_id', sessionId)
      localStorage.setItem('pcr_session_expiry', expiresAt)

      console.log('Login successful, dispatching LOGIN_SUCCESS')
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user, sessionId, expiresAt }
      })
      console.log('Login complete')
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE' })
      throw error
    }
  }

  const logout = useCallback(async (): Promise<void> => {
    // The PDF preview/confirm modals are raw DOM (appended to document.body,
    // not part of the React tree), so unmounting on logout wouldn't close
    // them on its own - and leaving a patient report on screen after the
    // session's timed out is a real privacy problem.
    pdfService.closeActiveModals()

    try {
      // Invalidate session on backend
      const token = localStorage.getItem('pcr_token')
      if (token) {
        await fetch(`${apiBaseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      }
    } catch (error) {
      console.warn('Failed to invalidate session on server:', error)
    }

    // Clear storage
    clearStoredAuth()

    // Clear any form drafts
    const draftKeys = Object.keys(localStorage).filter(key => key.startsWith('pcr_draft_'))
    draftKeys.forEach(key => localStorage.removeItem(key))

    dispatch({ type: 'LOGOUT' })
  }, [clearStoredAuth, apiBaseUrl])

  // Extend session
  const extendSession = useCallback(async (): Promise<void> => {
    try {
      // Mock extend session - in real app, call backend
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      
      // Update stored expiry
      localStorage.setItem('pcr_session_expiry', expiresAt)
      
      dispatch({ type: 'EXTEND_SESSION', payload: { expiresAt } })
    } catch (error) {
      console.error('Failed to extend session:', error)
      throw error
    }
  }, [])

  // Get current token
  const getToken = useCallback((): string | null => {
    return localStorage.getItem('pcr_token')
  }, [])

  // Handle session invalid event
  useEffect(() => {
    const handleSessionInvalid = () => {
      clearStoredAuth()
      dispatch({ type: 'LOGOUT' })
    }

    window.addEventListener('session-invalid', handleSessionInvalid)
    return () => window.removeEventListener('session-invalid', handleSessionInvalid)
  }, [clearStoredAuth])

  // Idle logout (10 minutes)
  useEffect(() => {
    // Don’t start until we’re done restoring auth AND authenticated
    if (state.isLoading || !state.isAuthenticated) return;

    const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
    let timeoutId: ReturnType<typeof setTimeout>;
    const isUnloadingRef = { current: false }; 
    let lastWrite = 0;

    const scheduleLogout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        // Don’t logout while the browser is unloading / refreshing
        if (isUnloadingRef.current) return;

        // Same "unsaved PCR draft?" prompt the Electron close handler uses
        // for the same situation - resolves immediately with true if there's
        // no active draft with unsaved changes, so this is a no-op except
        // when it actually matters.
        const okToLogout = await runPcrCloseHandler();
        if (!okToLogout || isUnloadingRef.current) return;
        logout();
      }, INACTIVITY_MS);
    };

    // Keep the events tame (scroll/wheel can be noisy)
    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart'
    ];

    const onActivity = () => {
      // Throttle cross-tab sync writes to once per 5s
      const now = Date.now();
      if (now - lastWrite > 5000) {
        localStorage.setItem('pcr_last_activity', now.toString());
        lastWrite = now;
      }
      scheduleLogout();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pcr_last_activity') {
        scheduleLogout();
      }
    };

    const onVisibility = () => {
      if (!document.hidden) onActivity();
    };

    const onBeforeUnload = () => {
      isUnloadingRef.current = true;
      clearTimeout(timeoutId);
    };

    // arm
    scheduleLogout();
    activityEvents.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach(ev => window.removeEventListener(ev, onActivity));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [state.isLoading, state.isAuthenticated, logout]);

  // Closing the Electron app counts as a logout, same as idle timeout above -
  // but if a PCR draft is being edited (PCRPage registers this via
  // electronCloseGuard), give the user a chance to save it first.
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleCloseRequested = async () => {
      const okToClose = await runPcrCloseHandler();
      if (okToClose && state.isAuthenticated) {
        await logout();
      }
      window.electronAPI?.confirmClose(okToClose);
    };

    return window.electronAPI.onCloseRequested(handleCloseRequested);
  }, [state.isAuthenticated, logout]);

  const contextValue: AuthContextType = {
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    sessionId: state.sessionId,
    sessionExpires: state.sessionExpires,
    token: getToken(),
    login,
    logout,
    extendSession,
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
