import React, { useState, useCallback } from 'react'
import { Plus, Trash2, Clock } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn, getCurrentTime } from '@/utils'
import type { VitalSign } from '@/types'

interface VitalSignsTableProps {
  data: VitalSign[] | any[]
  onChange: (data: VitalSign[] | any[]) => void
  maxRows?: number
  title?: string
  className?: string
  columns?: Array<{ key: string; label: string; width: string }>
}

const VitalSignsTable: React.FC<VitalSignsTableProps> = ({
  data,
  onChange,
  maxRows = 8,
  title = 'Vital Signs',
  className,
  columns: customColumns,
}) => {
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
      const newRow: any = { time: getCurrentTime() }
      onChange([...data, newRow])
    }
  }, [data, onChange, maxRows])

  const removeRow = useCallback((index: number) => {
    const newData = data.filter((_, i) => i !== index)
    // Ensure we always have at least 1 row (even if empty)
    onChange(newData.length > 0 ? newData : [{}])
  }, [data, onChange])

  const addCurrentTime = useCallback((rowIndex: number) => {
    handleCellChange(rowIndex, 'time', getCurrentTime())
  }, [handleCellChange])

  const defaultColumns = [
    { key: 'time', label: 'Time', width: 'w-24' },
    { key: 'pulse', label: 'Pulse (rate, rhythm, qual.)', width: 'w-34' },
    { key: 'resp', label: 'Resp (rate, rhythm, qual.)', width: 'w-34' },
    { key: 'spo2', label: 'SpO2 (%)', width: 'w-24' },
    { key: 'bp', label: 'B/P', width: 'w-24' },
    { key: 'loc', label: 'LOC, GCS', width: 'w-32' },
    { key: 'skin', label: 'Skin, Temp', width: 'w-32' },
    { key: 'pupils', label: 'Pupils', width: 'w-28' },
  ]

  const columns = customColumns || defaultColumns

  const renderCell = (rowIndex: number, column: typeof columns[0]) => {
    const value = data[rowIndex]?.[column.key] || ''
    const isEditing = editingCell?.row === rowIndex && editingCell?.field === column.key
    
    if (isEditing) {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleCellChange(rowIndex, column.key, e.target.value)}
          onBlur={handleCellBlur}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleCellBlur()
            }
          }}
          className="w-full border-0 px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 
                    text-gray-900 dark:text-gray-300 
                    focus:outline-none focus:ring-1 focus:ring-primary-500"
          autoFocus
        />
      )
    }

    return (
      <div
        onClick={() => handleCellClick(rowIndex, column.key)}
        className="w-full px-2 py-1 cursor-text hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[2rem] flex items-center text-gray-900 dark:text-gray-100"
      >
        {column.key === 'time' && value && (
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-gray-900 dark:text-gray-100">{value}</span>
          </div>
        )}
        {column.key !== 'time' && value && (
          <span className="text-gray-900 dark:text-gray-100">{value}</span>
        )}
        {!value && (
          <span className="text-gray-400 text-sm">Click to edit</span>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <div className="flex space-x-2">
          {data.length < maxRows && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Row
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="vital-signs-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn('text-center font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 px-3 py-2 border border-gray-200 dark:border-gray-600', column.width)}
                >
                  {column.label}
                  {column.key === 'time' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-1">
                      (24hr)
                    </div>
                  )}
                </th>
              ))}
              <th className="w-12 text-center font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 px-3 py-2 border border-gray-200 dark:border-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(data.length, 1) }).map((_, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {columns.map((column) => (
                  <td key={column.key} className="table-editable border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                    {renderCell(rowIndex, column)}
                  </td>
                ))}
                <td className="px-2 py-1 text-center border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-center space-x-1">
                    <Tooltip content="Add current time">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addCurrentTime(rowIndex)}
                        className="p-1 h-6 w-6"
                      >
                        <Clock className="w-3 h-3" />
                      </Button>
                    </Tooltip>
                    {rowIndex < data.length && data[rowIndex] && Object.values(data[rowIndex]).some(v => v) && data.length > 1 && (
                      <Tooltip content="Remove row">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(rowIndex)}
                          className="p-1 h-6 w-6 text-emergency-500 hover:text-emergency-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        <p>Click on any cell to edit. Press Enter to save changes.</p>
        <p>Use 24-hour format for time entries (e.g., 14:30 for 2:30 PM).</p>
      </div>
    </div>
  )
}

export default VitalSignsTable