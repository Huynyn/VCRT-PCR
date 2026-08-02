import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils'

interface CallCalendarProps {
  markedDates: Set<string>
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const CallCalendar: React.FC<CallCalendarProps> = ({ markedDates, selectedDate, onSelectDate }) => {
  const initialView = useMemo(() => {
    if (markedDates.size > 0) {
      const latest = Array.from(markedDates).sort().pop() as string
      const [y, m] = latest.split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
    // Only used to compute the initial view once; navigation takes over after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [viewDate, setViewDate] = useState(initialView)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate())

  const cells: Array<{ day: number; key: string } | null> = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: toDateKey(year, month, d) })

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 dark:text-gray-400 mb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />
          const hasCall = markedDates.has(cell.key)
          const isSelected = selectedDate === cell.key
          const isToday = cell.key === todayKey

          return (
            <button
              type="button"
              key={cell.key}
              onClick={() => hasCall && onSelectDate(cell.key)}
              disabled={!hasCall}
              title={hasCall ? `${cell.key} — has call(s)` : undefined}
              className={cn(
                'aspect-square rounded-full text-sm flex items-center justify-center',
                hasCall
                  ? 'cursor-pointer font-semibold text-primary-700 dark:text-primary-200 bg-primary-100 dark:bg-primary-700/50 hover:bg-primary-200 dark:hover:bg-primary-600/60'
                  : 'text-gray-300 dark:text-gray-600 cursor-default',
                isSelected && 'bg-primary-600 hover:bg-primary-600 text-white dark:text-white',
                isToday && !isSelected && 'ring-1 ring-primary-400'
              )}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CallCalendar
