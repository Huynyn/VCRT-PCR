import { useEffect, useRef, useCallback, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context/NotificationContext'

interface UseTimeoutOptions {
  timeoutDuration?: number // in milliseconds
  warningDuration?: number // show warning before timeout
  onTimeout?: () => void
  onWarning?: () => void
  enabled?: boolean
}

export const useTimeout = ({
  timeoutDuration = 30 * 60 * 1000, // 30 minutes default
  warningDuration = 5 * 60 * 1000, // 5 minutes warning
  onTimeout,
  onWarning,
  enabled = true,
}: UseTimeoutOptions = {}) => {
  const { logout, isAuthenticated } = useAuth()
  const { showNotification } = useNotification()
  const [timeLeft, setTimeLeft] = useState(timeoutDuration)
  const [isWarningShown, setIsWarningShown] = useState(false)
  
  const timeoutRef = useRef<NodeJS.Timeout>()
  const warningRef = useRef<NodeJS.Timeout>()
  const intervalRef = useRef<NodeJS.Timeout>()
  const lastActivityRef = useRef(Date.now())

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    // Don't force setTimeLeft here - the countdown interval below already
    // re-derives it from lastActivityRef once a second. Only update
    // isWarningShown if it's actually changing, so routine activity
    // (mousemove, clicks) doesn't trigger an app-wide re-render every time.
    setIsWarningShown(prev => (prev ? false : prev))

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (warningRef.current) clearTimeout(warningRef.current)

    if (!enabled || !isAuthenticated) return

    // Set warning timer
    warningRef.current = setTimeout(() => {
      if (!isWarningShown) {
        setIsWarningShown(true)
        if (onWarning) {
          onWarning()
        } else {
          showNotification(
            'Your session will expire in 5 minutes. Please save your work.',
            'warning'
          )
        }
      }
    }, timeoutDuration - warningDuration)

    // Set timeout timer
    timeoutRef.current = setTimeout(() => {
      if (onTimeout) {
        onTimeout()
      } else {
        showNotification('Session expired. Logging out...', 'error')
        logout()
      }
    }, timeoutDuration)
  }, [
    enabled,
    isAuthenticated,
    timeoutDuration,
    warningDuration,
    isWarningShown,
    onTimeout,
    onWarning,
    showNotification,
    logout,
  ])

  const extendSession = useCallback(() => {
    resetTimer()
    showNotification('Session extended', 'success')
  }, [resetTimer, showNotification])

  // Update countdown timer
  useEffect(() => {
    if (!enabled || !isAuthenticated) return

    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastActivityRef.current
      const remaining = Math.max(0, timeoutDuration - elapsed)
      
      setTimeLeft(remaining)
      
      if (remaining === 0) {
        clearInterval(intervalRef.current!)
      }
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, isAuthenticated, timeoutDuration])

  // Activity listeners
  useEffect(() => {
    if (!enabled || !isAuthenticated) return

    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ]

    // Throttled to at most once/second - a 30-minute idle timeout doesn't
    // need finer resolution, and mousemove/scroll otherwise fire far too
    // often to reschedule timers on every event.
    const handleActivity = () => {
      if (Date.now() - lastActivityRef.current < 1000) return
      resetTimer()
    }

    // Add event listeners
    activityEvents.forEach((event) => {
      document.addEventListener(event, handleActivity, true)
    })

    // Initial timer setup
    resetTimer()

    return () => {
      // Remove event listeners
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity, true)
      })

      // Clear timers
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (warningRef.current) clearTimeout(warningRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, isAuthenticated, resetTimer])

  const formatTimeLeft = useCallback((ms: number): string => {
    const minutes = Math.floor(ms / (1000 * 60))
    const seconds = Math.floor((ms % (1000 * 60)) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [])

  const isInWarningPeriod = timeLeft <= warningDuration && timeLeft > 0

  return {
    timeLeft,
    timeLeftFormatted: formatTimeLeft(timeLeft),
    isInWarningPeriod,
    isWarningShown,
    resetTimer,
    extendSession,
  }
}