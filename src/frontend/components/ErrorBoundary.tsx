import React from 'react'
import { AlertTriangle } from 'lucide-react'
import i18n from '@/i18n'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-64 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center border border-red-200">
            <AlertTriangle className="w-9 h-9 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{i18n.t('errorBoundary.title')}</h3>
            <p className="text-gray-600 mb-4 text-sm">
              {i18n.t('errorBoundary.body')}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="btn-primary mr-2"
            >
              {i18n.t('errorBoundary.tryAgain')}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn-outline"
            >
              {i18n.t('errorBoundary.refreshPage')}
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                  {i18n.t('errorBoundary.errorDetailsDev')}
                </summary>
                <pre className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded overflow-auto max-h-32">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary