import React, { forwardRef, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar } from 'lucide-react'
import { cn } from '@/utils'

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helpText?: string
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(({
  label,
  error,
  helpText,
  className,
  required,
  ...props
}, ref) => {
  const { t } = useTranslation()
  const inputId = props.id || `date-${Math.random().toString(36).substr(2, 9)}`
  const internalRef = useRef<HTMLInputElement | null>(null)

  const setRefs = (el: HTMLInputElement | null) => {
    internalRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
  }

  const openPicker = () => {
    // showPicker() is the standard way to open a native date picker
    // programmatically (Chromium/Electron, and modern Firefox/Safari).
    internalRef.current?.showPicker?.()
  }

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={inputId}
          className={cn('form-label', required && 'form-label-required')}
        >
          {label}
        </label>
      )}

      <div className="relative">
        <input
          ref={setRefs}
          type="date"
          id={inputId}
          className={cn(
            'form-input pr-10',
            error && 'form-input-error',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined
          }
          required={required}
          {...props}
        />

        <button
          type="button"
          onClick={openPicker}
          tabIndex={-1}
          aria-label={t('common.openCalendar')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 focus:text-primary-600 dark:hover:text-primary-400 dark:hover:bg-primary-900/30 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>
      
      {error && (
        <p id={`${inputId}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p id={`${inputId}-help`} className="form-help">
          {helpText}
        </p>
      )}
    </div>
  )
})

DatePicker.displayName = 'DatePicker'

export default DatePicker