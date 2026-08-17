import React, { forwardRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { cn, formatTime, validateTime, isDnoUtoValue } from '@/utils'

interface TimePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helpText?: string
  format24?: boolean
  /** Suppress the "explain in comment section" hint even if the value looks
   * like DNO/UTO - used on the comment fields themselves. */
  hideDnoUtoHint?: boolean
}

const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(({
  label,
  error,
  helpText,
  format24 = true,
  className,
  required,
  onChange,
  value,
  hideDnoUtoHint,
  ...props
}, ref) => {
  const { t } = useTranslation()
  const [displayValue, setDisplayValue] = useState(value || '')
  const [inputError, setInputError] = useState('')
  const inputId = props.id || `time-${Math.random().toString(36).substr(2, 9)}`
  const showDnoUtoHint = !hideDnoUtoHint && isDnoUtoValue(displayValue as string)

  useEffect(() => {
    if (value !== displayValue) {
      setDisplayValue(value || '')
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setDisplayValue(newValue)
    setInputError('')

    // DNO/UTO (or the French N.O./I.O.) is a valid "not obtained" answer
    // here too, so it bypasses the HH:MM format check instead of being
    // rejected as an invalid time.
    if (newValue && !validateTime(newValue) && !isDnoUtoValue(newValue)) {
      setInputError(t('common.invalidTime'))
      return
    }

    const formattedValue = formatTime(newValue)
    
    if (onChange) {
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: formattedValue,
        },
      }
      onChange(syntheticEvent)
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const formattedValue = formatTime(displayValue)
    setDisplayValue(formattedValue)
    
    if (props.onBlur) {
      props.onBlur(e)
    }
  }

  const currentTime = () => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  const setCurrentTime = () => {
    const time = currentTime()
    setDisplayValue(time)
    
    if (onChange) {
      const syntheticEvent = {
        target: { value: time },
      } as React.ChangeEvent<HTMLInputElement>
      onChange(syntheticEvent)
    }
  }

  const finalError = error || inputError

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
          ref={ref}
          type="text"
          id={inputId}
          placeholder={format24 ? 'HH:MM (24hr)' : 'HH:MM'}
          className={cn(
            'form-input pr-10',
            finalError && 'form-input-error',
            className
          )}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={finalError ? 'true' : 'false'}
          aria-describedby={
            finalError ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined
          }
          required={required}
          {...props}
        />
        
        <button
          type="button"
          onClick={setCurrentTime}
          tabIndex={-1}
          aria-label={t('common.setCurrentTime')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 focus:text-primary-600 dark:hover:text-primary-400 dark:hover:bg-primary-900/30 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>
      
      {finalError && (
        <p id={`${inputId}-error`} className="form-error" role="alert">
          {finalError}
        </p>
      )}

      {!finalError && showDnoUtoHint && (
        <p id={`${inputId}-dno-uto-hint`} className="form-help">
          {t('common.explainInComments')}
        </p>
      )}

      {!finalError && !showDnoUtoHint && helpText && (
        <p id={`${inputId}-help`} className="form-help">
          {helpText}
        </p>
      )}
    </div>
  )
})

TimePicker.displayName = 'TimePicker'

export default TimePicker