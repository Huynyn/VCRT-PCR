import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils'

interface SearchableSelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  error?: string
  required?: boolean
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Search or type a name...',
  error,
  required,
}) => {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputId = useRef(`searchable-select-${Math.random().toString(36).substr(2, 9)}`).current

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.toLowerCase().includes(q))
  }, [query, options])

  const exactMatch = options.some(o => o.toLowerCase() === query.trim().toLowerCase())

  const handleSelect = (name: string) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  const handleUseTyped = () => {
    const typed = query.trim()
    if (typed) {
      onChange(typed)
      setOpen(false)
    }
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className={cn('form-label', required && 'form-label-required')}>
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleUseTyped()
            } else if (e.key === 'Escape') {
              setOpen(false)
              setQuery(value)
            }
          }}
          placeholder={placeholder}
          className={cn('form-input pr-8', error && 'form-input-error')}
          autoComplete="off"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              onChange('')
              setOpen(true)
            }}
            className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {open && (
          <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">
                {options.length === 0 ? 'No responders on file yet' : 'No matches'}
              </div>
            )}
            {filtered.map(name => (
              <button
                type="button"
                key={name}
                onClick={() => handleSelect(name)}
                className={cn(
                  'block w-full text-left px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100',
                  value === name && 'bg-primary-50 dark:bg-gray-700 font-medium'
                )}
              >
                {name}
              </button>
            ))}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleUseTyped}
                className="block w-full text-left px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700"
              >
                Use &quot;{query.trim()}&quot; (not on list)
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default SearchableSelect
