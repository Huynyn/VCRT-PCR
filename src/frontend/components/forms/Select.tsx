import React, { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils'
import type { SelectProps as BaseSelectProps } from '@/types'

type OurSelectProps = BaseSelectProps & {
  /** When true, treat this as required and show a custom validity message if empty */
  requireUnknown?: boolean
}

const Select = forwardRef<HTMLSelectElement, OurSelectProps>(({
  label,
  error,
  helpText,
  options,
  placeholder,
  className,
  required,
  requireUnknown,
  id,
  onInvalid,
  onInput,
  onChange,
  ...props
}, ref) => {
  const { t } = useTranslation()
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`

  const handleInvalid: React.FormEventHandler<HTMLSelectElement> = (e) => {
    if (requireUnknown) {
      // Message matches your DOB pattern (“DNO/UTO if unknown”), tweak as needed per field
      e.currentTarget.setCustomValidity(t('common.selectRequiredDnoUto'))
    }
    if (onInvalid) onInvalid(e)
  }

  // Clear the custom validity as soon as the user interacts
  const clearValidity = (el: HTMLSelectElement) => el.setCustomValidity('')

  const handleInput: React.FormEventHandler<HTMLSelectElement> = (e) => {
    clearValidity(e.currentTarget)
    if (onInput) onInput(e)
  }

  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    clearValidity(e.currentTarget)
    if (onChange) onChange(e)
  }

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={selectId}
          className={cn('form-label', (required || requireUnknown) && 'form-label-required')}
        >
          {label}
        </label>
      )}
      
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'form-input appearance-none pr-10',
            error && 'form-input-error',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${selectId}-error` : helpText ? `${selectId}-help` : undefined
          }
          required={required || requireUnknown}
          onInvalid={handleInvalid}
          onInput={handleInput}
          onChange={handleChange}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      
      {error && (
        <p id={`${selectId}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p id={`${selectId}-help`} className="form-help">
          {helpText}
        </p>
      )}
    </div>
  )
})

Select.displayName = 'Select'

export default Select