import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Clock } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn } from '@/utils'
import type { VitalSign } from '@/types'

interface VitalSignsTableProps {
  data: VitalSign[] | any[]
  onChange: (data: VitalSign[] | any[]) => void
  maxRows?: number
  title?: string
  className?: string
  columns?: Array<{ key: string; label: string; width: string; hint?: string }>
}

const VitalSignsTable: React.FC<VitalSignsTableProps> = ({
  data,
  onChange,
  maxRows = 8,
  title = '',
  className,
  columns: customColumns,
}) => {
  const { t } = useTranslation()
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null)

  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    const newData = [...data]
    if (!newData[rowIndex]) {
      newData[rowIndex] = {}
    }
    newData[rowIndex] = { ...newData[rowIndex], [field]: value }
    onChange(newData)
  }, [data, onChange])

  const handleCellClick = useCallback((rowIndex: number, field: string) => {
    setEditingCell({ row: rowIndex, field })
  }, [])

  const handleCellBlur = useCallback(() => {
    setEditingCell(null)
  }, [])

  const addRow = useCallback(() => {
    if (data.length < maxRows) {
      onChange([...data, {}])
    }
  }, [data, onChange, maxRows])

  const removeRow = useCallback((index: number) => {
    const newData = data.filter((_, i) => i !== index)
    // Ensure we always have at least 1 row (even if empty)
    onChange(newData.length > 0 ? newData : [{}])
  }, [data, onChange])

  const defaultColumns = [
    { key: 'time', label: t('pcr.vitalSignsTable.time'), width: 'w-32', hint: t('pcr.vitalSignsTable.timeHint') },
    { key: 'pulse', label: 'HR', width: 'w-32', hint: t('pcr.vitalSignsTable.rateRhythmQualityHint') },
    { key: 'resp', label: 'RR', width: 'w-32', hint: t('pcr.vitalSignsTable.rateRhythmQualityHint') },
    { key: 'spo2', label: 'SpO2', width: 'w-32', hint: t('pcr.vitalSignsTable.spo2Hint') },
    { key: 'bp', label: 'B/P', width: 'w-28', hint: t('pcr.vitalSignsTable.bpHint') },
    { key: 'loc', label: 'LOC, GCS', width: 'w-32', hint: t('pcr.vitalSignsTable.locHint') },
    { key: 'skin', label: t('pcr.vitalSignsTable.skin'), width: 'w-32', hint: t('pcr.vitalSignsTable.skinHint') },
    { key: 'pupils', label: t('pcr.vitalSignsTable.pupils'), width: 'w-28', hint: t('pcr.vitalSignsTable.pupilsHint') },
  ]

  const columns = customColumns || defaultColumns

  // Textareas don't grow with their content on their own - resize on mount
  // (when a cell becomes editable) and on every keystroke.
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const renderCell = (rowIndex: number, column: typeof columns[0]) => {
    const value = data[rowIndex]?.[column.key] || ''
    const isEditing = editingCell?.row === rowIndex && editingCell?.field === column.key

    if (isEditing) {
      return (
        <textarea
          ref={autoGrow}
          rows={1}
          value={value}
          onChange={(e) => {
            handleCellChange(rowIndex, column.key, e.target.value)
            autoGrow(e.target)
          }}
          onBlur={handleCellBlur}
          onKeyDown={(e) => {
            // Enter saves (matches the "Press Enter to save" hint below);
            // Shift+Enter still allows a deliberate line break.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleCellBlur()
            }
          }}
          className="block w-full min-h-9 border-0 px-2.5 py-2 bg-primary-50 dark:bg-primary-900/20
                    text-gray-900 dark:text-gray-100 text-sm resize-none overflow-hidden
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
          autoFocus
        />
      )
    }

    return (
      <div
        onClick={() => handleCellClick(rowIndex, column.key)}
        className="w-full min-h-9 px-2.5 py-2 cursor-text hover:bg-primary-50/60 dark:hover:bg-gray-700/60 flex items-start text-sm text-gray-900 dark:text-gray-100 transition-colors"
      >
        {column.key === 'time' && value && (
          <div className="flex items-start gap-1.5">
            <Clock className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
            <span className="tabular-nums whitespace-pre-wrap break-words">{value}</span>
          </div>
        )}
        {column.key !== 'time' && value && (
          <span className="whitespace-pre-wrap break-words">{value}</span>
        )}
        {!value && <span className="text-gray-400 dark:text-gray-500 italic">{t('pcr.vitalSignsTable.clickToEdit')}</span>}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}

      <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 rounded-lg">
        {/* No min-w-full: with table-fixed, an ancestor forcing the table
            wider than the sum of its column widths would make browsers
            redistribute the extra space across every column - including
            ones whose content only shows up conditionally (the trash-icon
            column below), which is exactly what made columns "narrow" once
            a second row appeared. Letting the table be exactly as wide as
            its columns keeps every column's width constant regardless of
            row count; overflow-x-auto above still handles narrow screens. */}
        <table className="table-fixed border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'text-center align-top font-semibold text-sm uppercase tracking-wide text-gray-600 dark:text-gray-300 px-3 py-2.5 border-b border-l border-gray-200 dark:border-gray-700 first:border-l-0',
                    column.width,
                  )}
                >
                  {column.label}
                  {column.hint && (
                    <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
                      {column.hint}
                    </div>
                  )}
                </th>
              ))}
              <th className="w-9 border-b border-l border-gray-200 dark:border-gray-700" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {Array.from({ length: Math.max(data.length, 1) }).map((_, rowIndex) => (
              <tr
                key={rowIndex}
                className="bg-white dark:bg-gray-800 even:bg-gray-50/60 dark:even:bg-gray-800/60"
              >
                {columns.map((column) => (
                  <td key={column.key} className="p-0 border-l border-gray-100 dark:border-gray-700 first:border-l-0">
                    {renderCell(rowIndex, column)}
                  </td>
                ))}
                <td className="p-0 text-center align-top border-l border-gray-100 dark:border-gray-700">
                  {/* Always rendered (just hidden below the minimum of 1 row)
                      so this column's width is never dependent on whether
                      any row happens to show the button. */}
                  <Tooltip content={t('pcr.vitalSignsTable.removeRow', { index: rowIndex + 1 })}>
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      aria-label={t('pcr.vitalSignsTable.removeRow', { index: rowIndex + 1 })}
                      tabIndex={data.length > 1 ? 0 : -1}
                      className={cn(
                        'flex items-center justify-center h-9 w-9 rounded text-gray-400 hover:text-burgundy-600 hover:bg-burgundy-50 dark:text-gray-500 dark:hover:text-burgundy-400 dark:hover:bg-burgundy-900/20 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-burgundy-500 transition-colors',
                        data.length <= 1 && 'invisible',
                      )}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length < maxRows && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {t('pcr.vitalSignsTable.addRow')}
          </Button>
        </div>
      )}

      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
        <p>{t('pcr.vitalSignsTable.help24h')}</p>
        <p>{t('pcr.vitalSignsTable.helpDnoUto')}</p>
        <p>{t('pcr.vitalSignsTable.helpClickEdit')}</p>
      </div>
    </div>
  )
}

export default VitalSignsTable