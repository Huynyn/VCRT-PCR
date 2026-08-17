import React, { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, isDnoUtoValue } from '@/utils'
import type { InputProps as BaseInputProps } from '@/types'

type OurInputProps = BaseInputProps & {
  requireUnknown?: boolean
  /** Suppress the "explain in comment section" hint even if the value looks
   * like DNO/UTO - used on the comment fields themselves. */
  hideDnoUtoHint?: boolean
}

const Input = forwardRef<HTMLInputElement, OurInputProps>(({
  label,
  error,
  helpText,
  leftIcon,
  rightIcon,
  className,
  required,
  requireUnknown,
  hideDnoUtoHint,
  ...props
}, ref) => {
  const { t } = useTranslation()
  const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`
  const showDnoUtoHint = !hideDnoUtoHint && isDnoUtoValue(props.value as string | number | null | undefined)

  const handleInvalid: React.FormEventHandler<HTMLInputElement> = (e) => {
    if (requireUnknown) {
      e.currentTarget.setCustomValidity(t('common.fillRequiredDnoUto'))
    }
    // if you already passed an onInvalid via props, call it too
    if (props.onInvalid) props.onInvalid(e)
  }

  const handleInput: React.FormEventHandler<HTMLInputElement> = (e) => {
    // clear as soon as user types
    e.currentTarget.setCustomValidity('')
    if (props.onInput) props.onInput(e)
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
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400 sm:text-sm">{leftIcon}</span>
          </div>
        )}
        
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'form-input',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'form-input-error',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined
          }
          required={required || requireUnknown}     // <— make it required if requireUnknown is set
          onInvalid={handleInvalid}                 // <— NEW
          onInput={handleInput}                     // <— NEW
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
      
      {error && (
        <p id={`${inputId}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}

      {!error && showDnoUtoHint && (
        <p id={`${inputId}-dno-uto-hint`} className="form-help">
          {t('common.explainInComments')}
        </p>
      )}

      {!error && !showDnoUtoHint && helpText && (
        <p id={`${inputId}-help`} className="form-help">
          {helpText}
        </p>
      )}
    </div>
  )
})

Input.displayName = 'Input'

export default Input