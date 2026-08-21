import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/utils'
import type { FormSectionProps } from '@/types'

const FormSection: React.FC<FormSectionProps> = ({
  title,
  subtitle,
  number,
  children,
  isCollapsible = false,
  defaultOpen = true,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const toggleOpen = () => {
    if (isCollapsible) {
      setIsOpen(!isOpen)
    }
  }

  return (
    <div className="mb-8">
      <div
        className={cn('mb-6', isCollapsible && 'cursor-pointer select-none')}
        onClick={toggleOpen}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {number !== undefined ? (
              <span className="inline-flex items-center gap-3 max-w-full min-w-0 rounded-full bg-primary-600 dark:bg-primary-500 text-white pl-2 pr-5 py-2.5">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-sm font-bold shrink-0">
                  {number}
                </span>
                <span className="text-base font-semibold truncate min-w-0">
                  {title}
                </span>
              </span>
            ) : (
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h2>
            )}
          </div>

          {isCollapsible && (
            <button
              type="button"
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-expanded={isOpen}
              aria-controls={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
            >
              {isOpen ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Divider comes right after the title now, with the description
            below it instead of above - swapped from the original order per
            request. */}
        <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3">
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {isOpen && (
        <div
          id={`section-${title.replace(/\s+/g, '-').toLowerCase()}`}
          className="space-y-6"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export default FormSection