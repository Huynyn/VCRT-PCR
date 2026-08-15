import React, { createContext, useContext, useState, useCallback } from 'react'
import toast, { Toaster, Toast } from 'react-hot-toast'
import type { NotificationContextType, NotificationType } from '@/types'

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

interface NotificationProviderProps {
  children: React.ReactNode
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const showNotification = useCallback((message: string, type: NotificationType = 'info', id?: string) => {
    const options = {
      ...(id ? { id } : {}),
      duration: 4000,
      position: 'top-right' as const,
      style: {
        borderRadius: '8px',
        background: 'white',
        color: '#374151',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
    }

    switch (type) {
      case 'success':
        toast.success(message, {
          ...options,
          iconTheme: {
            primary: '#10B981',
            secondary: '#FFFFFF',
          },
        })
        break
      case 'error':
        toast.error(message, {
          ...options,
          duration: 6000, // Show errors longer
          iconTheme: {
            primary: '#EF4444',
            secondary: '#FFFFFF',
          },
        })
        break
      case 'warning':
        toast(message, {
          ...options,
          icon: '⚠️',
          style: {
            ...options.style,
            borderLeft: '4px solid #F59E0B',
          },
        })
        break
      case 'info':
      default:
        toast(message, {
          ...options,
          icon: 'ℹ️',
          style: {
            ...options.style,
            borderLeft: '4px solid #3B82F6',
          },
        })
        break
    }
  }, [])

  const contextValue: NotificationContextType = {
    showNotification,
  }

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <Toaster
        position="top-right"
        gutter={8}
        containerClassName="z-50"
        toastOptions={{
          className: 'toast',
          success: {
            className: 'toast-success',
          },
          error: {
            className: 'toast-error',
          },
        }}
      />
    </NotificationContext.Provider>
  )
}

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

// Custom toast components for specific use cases
export const showSuccessToast = (message: string) => {
  toast.success(message, {
    duration: 4000,
    style: {
      borderRadius: '8px',
      background: '#F0FDF4',
      color: '#166534',
      border: '1px solid #BBF7D0',
    },
    iconTheme: {
      primary: '#16A34A',
      secondary: '#FFFFFF',
    },
  })
}

export const showErrorToast = (message: string) => {
  toast.error(message, {
    duration: 6000,
    style: {
      borderRadius: '8px',
      background: '#FEF2F2',
      color: '#991B1B',
      border: '1px solid #FECACA',
    },
    iconTheme: {
      primary: '#DC2626',
      secondary: '#FFFFFF',
    },
  })
}

export const showLoadingToast = (message: string): string => {
  return toast.loading(message, {
    style: {
      borderRadius: '8px',
      background: '#F8FAFC',
      color: '#475569',
      border: '1px solid #E2E8F0',
    },
  })
}

export const dismissToast = (toastId: string) => {
  toast.dismiss(toastId)
}
