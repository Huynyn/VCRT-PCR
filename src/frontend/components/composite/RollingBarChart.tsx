import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils'

export interface BarDatum {
  label: string
  value: number
  highlight?: boolean
}

interface RollingBarChartProps {
  totalLabel: string
  totalCount: number
  bars: BarDatum[]
  emptyMessage?: string
  className?: string
}

const RollingBarChart: React.FC<RollingBarChartProps> = ({
  totalLabel,
  totalCount,
  bars,
  emptyMessage,
  className,
}) => {
  const { t } = useTranslation()
  const resolvedEmptyMessage = emptyMessage ?? t('callStats.emptyMessage')
  const signature = useMemo(() => bars.map(b => `${b.label}:${b.value}`).join('|'), [bars])
  const maxValue = useMemo(() => Math.max(1, ...bars.map(b => b.value)), [bars])
  const [widths, setWidths] = useState<number[]>(() => bars.map(() => 0))

  useEffect(() => {
    setWidths(bars.map(() => 0))
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setWidths(bars.map(b => (b.value / maxValue) * 100))
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{totalLabel}</div>
        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalCount}</div>
      </div>

      {bars.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{resolvedEmptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {bars.map((bar, i) => (
            <div key={`${bar.label}-${i}`} className="flex items-center gap-3">
              <div
                className="w-28 shrink-0 truncate text-sm text-gray-700 dark:text-gray-300"
                title={bar.label}
              >
                {bar.label}
              </div>
              <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded transition-[width] duration-700 ease-out',
                    bar.highlight
                      ? 'bg-burgundy-600 dark:bg-burgundy-400'
                      : 'bg-navy-700 dark:bg-navy-400'
                  )}
                  style={{ width: `${widths[i] ?? 0}%` }}
                />
              </div>
              <div className="w-8 shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">
                {bar.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RollingBarChart
