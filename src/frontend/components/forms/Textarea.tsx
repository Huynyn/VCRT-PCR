import React, { forwardRef, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Minimize2 } from 'lucide-react'
import { cn } from '@/utils'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helpText?: string
  resize?: 'none' | 'both' | 'horizontal' | 'vertical'
  /** Treat as required and, if empty, show a custom message suggesting DNO/UTO when unknown */
  requireUnknown?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helpText,
  resize = 'vertical',
  className,
  required,
  requireUnknown,
  id,
  onInvalid,
  onInput,
  ...props
}, ref) => {
  const { t } = useTranslation()
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`
  const innerRef = useRef<HTMLTextAreaElement | null>(null)

  const setRefs = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node
  }

  // Dragging the native resize handle sets an inline height/width on the
  // element - clearing it lets the box snap back to its CSS default size.
  const handleResetSize = () => {
    const node = innerRef.current
    if (!node) return
    node.style.height = ''
    node.style.width = ''
  }

  const resizeClasses = {
    none: 'resize-none',
    both: 'resize',
    horizontal: 'resize-x',
    vertical: 'resize-y',
  }

  const handleInvalid: React.FormEventHandler<HTMLTextAreaElement> = (e) => {
    if (requireUnknown) {
      e.currentTarget.setCustomValidity(t('common.fillRequiredDnoUto'))
    }
    if (onInvalid) onInvalid(e)
  }

  const handleInput: React.FormEventHandler<HTMLTextAreaElement> = (e) => {
    e.currentTarget.setCustomValidity('')
    if (onInput) onInput(e)
  }

  const isRequired = required || requireUnknown

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={textareaId}
          className={cn('form-label', isRequired && 'form-label-required')}
        >
          {label}
        </label>
      )}
      
      <div className="relative">
        <textarea
          ref={setRefs}
          id={textareaId}
          className={cn(
            'form-input min-h-[80px]',
            resizeClasses[resize],
            error && 'form-input-error',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={
            error ? `${textareaId}-error` : helpText ? `${textareaId}-help` : undefined
          }
          required={isRequired}
          onInvalid={handleInvalid}
          onInput={handleInput}
          {...props}
        />
        {resize !== 'none' && (
          <button
            type="button"
            onClick={handleResetSize}
            title={t('common.resetSize')}
            aria-label={t('common.resetSize')}
            tabIndex={-1}
            className="absolute top-1.5 right-1.5 p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:text-gray-500 dark:hover:text-primary-400 dark:hover:bg-primary-900/30 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <p id={`${textareaId}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p id={`${textareaId}-help`} className="form-help">
          {helpText}
        </p>
      )}
    </div>
  )
})

Textarea.displayName = 'Textarea'

export default Textarea