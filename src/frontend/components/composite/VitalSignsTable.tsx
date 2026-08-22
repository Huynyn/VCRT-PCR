import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Clock, ChevronDown } from 'lucide-react'
import { Tooltip } from '@/components/ui'
import { cn } from '@/utils'
import type { VitalSign } from '@/types'

interface VitalSignPart {
  key: string
  /** Shown as this field's placeholder text (there's no room for a label
   * above each stacked sub-field, so the name doubles as the placeholder). */
  label: string
  /** Fixed choices shown as a dropdown instead of free text. */
  options?: string[]
}

interface VitalSignGroup {
  key: string
  label: string
  /** Shown as the field's placeholder text - e.g. LOC's "AOx(1-3) or GCS
   * 3-15" format note. */
  placeholder?: string
  /** Sub-fields (e.g. rate/rhythm/quality for HR), stacked vertically inside
   * this group's cell. Each keystroke recomposes `partSeparator`-joined into
   * the flat `data[set][key]` string that PDF export etc. still read as one
   * value. */
  parts?: VitalSignPart[]
  partSeparator?: string
}

interface VitalSignsTableProps {
  data: VitalSign[] | any[]
  onChange: (data: VitalSign[] | any[]) => void
  maxRows?: number
  title?: string
  className?: string
}

const FIELD_BASE_CLASS =
  'w-full min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-400 text-sm px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500'

// Smaller than the shared Input component (which is sized for full-width
// form fields) - this table packs many labeled boxes into a narrow column
// per set, so every field here trades the standard form sizing for a
// denser one. When `options` is given, this is a "select or type" combobox
// (same idea as the app's SearchableSelect, at this table's compact scale):
// typing always saves as free text, and the dropdown just offers common
// values to pick from instead of typing them out - not a hard-restricted
// list.
const CompactField: React.FC<{
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  options?: string[]
}> = ({ value, onChange, placeholder, ariaLabel, leftIcon, rightIcon, options }) => {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The dropdown is portaled to <body> (see below) so it can float over the
  // table's own scroll container instead of getting cut off at its edge -
  // that means its position has to be computed from the field's actual
  // screen position rather than relying on CSS `absolute` inside the table.
  const positionMenu = useCallback(() => {
    const el = fieldRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setMenuStyle({ position: 'fixed', top: rect.bottom + 2, left: rect.left, width: rect.width })
  }, [])

  useEffect(() => {
    if (!options || !open) return
    positionMenu()
    const handleReposition = () => positionMenu()
    // capture: true so this also fires for scrolling inside the table's own
    // horizontal-scroll wrapper, not just the page itself.
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [options, open, positionMenu])

  useEffect(() => {
    if (!options) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [options])

  const filteredOptions = options
    ? options.filter(opt => opt.toLowerCase().includes(value.trim().toLowerCase()))
    : []

  return (
    <div ref={containerRef}>
      <div ref={fieldRef} className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-1.5 flex items-center pointer-events-none text-gray-400">
            {leftIcon}
          </div>
        )}
        <input
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value)
            if (options) setOpen(true)
          }}
          onFocus={() => options && setOpen(true)}
          onKeyDown={e => {
            if (options && (e.key === 'Escape' || e.key === 'Enter')) {
              e.preventDefault()
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel || placeholder}
          autoComplete="off"
          className={cn(FIELD_BASE_CLASS, leftIcon && 'pl-5', (rightIcon || options) && 'pr-5')}
        />
        {options && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setOpen(o => !o)}
            className="absolute inset-y-0 right-0 pr-1.5 flex items-center text-gray-400"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
        {rightIcon && !options && (
          <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center text-gray-400 text-xs">
            {rightIcon}
          </div>
        )}
      </div>

      {options && open && filteredOptions.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg max-h-32 overflow-y-auto"
        >
          {filteredOptions.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setOpen(false)
              }}
              className={cn(
                'block w-full text-left px-2 py-1 text-sm hover:bg-primary-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100',
                value === opt && 'bg-primary-50 dark:bg-gray-700 font-medium',
              )}
            >
              {opt}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

const RHYTHM_OPTIONS = ['Regular', 'Irregular']
const PULSE_QUALITY_OPTIONS = ['Strong', 'Weak', 'Bounding', 'Thready']
const RESP_QUALITY_OPTIONS = ['Unlaboured', 'Laboured', 'Shallow', 'Deep']
const SKIN_COLOR_OPTIONS = ['Normal', 'Pale', 'Flushed', 'Cyanotic', 'Jaundiced', 'Mottled']
const SKIN_WARMTH_OPTIONS = ['Warm', 'Hot', 'Cool', 'Cold']
const SKIN_MOISTURE_OPTIONS = ['Dry', 'Moist', 'Diaphoretic']
const PUPIL_REACTIVITY_OPTIONS = ['PERRLA', 'Sluggish', 'Fixed', 'Unequal', 'Dilated', 'Constricted']

// Flowsheet-style layout: vitals go down as rows, each recorded set of
// vitals is its own column - so a maximum of 6 columns still fits legibly
// without the table getting too cramped or needing to scroll far.
const MAX_SETS = 6

const VitalSignsTable: React.FC<VitalSignsTableProps> = ({
  data,
  onChange,
  maxRows = MAX_SETS,
  title = '',
  className,
}) => {
  const { t } = useTranslation()
  const maxSets = Math.min(maxRows, MAX_SETS)

  const updateSet = useCallback((setIndex: number, updater: (set: any) => any) => {
    const newData = [...data]
    newData[setIndex] = updater({ ...(newData[setIndex] || {}) })
    onChange(newData)
  }, [data, onChange])

  const handleFieldChange = useCallback((setIndex: number, key: string, value: string) => {
    updateSet(setIndex, set => ({ ...set, [key]: value }))
  }, [updateSet])

  const handlePartChange = useCallback((setIndex: number, group: VitalSignGroup, partKey: string, value: string) => {
    updateSet(setIndex, set => {
      const partsField = `${group.key}Parts`
      const parts = { ...(set[partsField] || {}), [partKey]: value }
      const composed = (group.parts || [])
        .map(p => (parts[p.key] || '').trim())
        .filter(Boolean)
        .join(group.partSeparator ?? ', ')
      return { ...set, [partsField]: parts, [group.key]: composed }
    })
  }, [updateSet])

  const addSet = useCallback(() => {
    if (data.length < maxSets) {
      onChange([...data, {}])
    }
  }, [data, onChange, maxSets])

  const removeSet = useCallback((index: number) => {
    const newData = data.filter((_, i) => i !== index)
    // Ensure we always have at least 1 set (even if empty)
    onChange(newData.length > 0 ? newData : [{}])
  }, [data, onChange])

  // Rate/rhythm/quality for HR and RR share a shape but not their options -
  // pulse quality (strong/weak/bounding/thready) and breathing quality
  // (laboured/shallow/deep) describe different things.
  const pulseParts: VitalSignPart[] = [
    { key: 'rate', label: t('pcr.vitalSignsTable.partRate') },
    { key: 'rhythm', label: t('pcr.vitalSignsTable.partRhythm'), options: RHYTHM_OPTIONS },
    { key: 'quality', label: t('pcr.vitalSignsTable.partQuality'), options: PULSE_QUALITY_OPTIONS },
  ]
  const respParts: VitalSignPart[] = [
    { key: 'rate', label: t('pcr.vitalSignsTable.partRate') },
    { key: 'rhythm', label: t('pcr.vitalSignsTable.partRhythm'), options: RHYTHM_OPTIONS },
    { key: 'quality', label: t('pcr.vitalSignsTable.partQuality'), options: RESP_QUALITY_OPTIONS },
  ]

  const groups: VitalSignGroup[] = [
    { key: 'pulse', label: 'HR', parts: pulseParts, partSeparator: ', ' },
    { key: 'resp', label: 'RR', parts: respParts, partSeparator: ', ' },
    { key: 'spo2', label: 'SpO2', placeholder: t('pcr.vitalSignsTable.spo2Hint') },
    {
      key: 'bp',
      label: 'B/P',
      parts: [
        { key: 'sys', label: t('pcr.vitalSignsTable.partSys') },
        { key: 'dia', label: t('pcr.vitalSignsTable.partDia') },
      ],
      partSeparator: '/',
    },
    {
      key: 'loc',
      label: 'LOC / GCS',
      placeholder: t('pcr.vitalSignsTable.locHint'),
    },
    {
      key: 'skin',
      label: t('pcr.vitalSignsTable.skin'),
      parts: [
        { key: 'tempC', label: t('pcr.vitalSignsTable.partTempC') },
        { key: 'color', label: t('pcr.vitalSignsTable.partColor'), options: SKIN_COLOR_OPTIONS },
        { key: 'warmth', label: t('pcr.vitalSignsTable.partWarmth'), options: SKIN_WARMTH_OPTIONS },
        { key: 'moisture', label: t('pcr.vitalSignsTable.partMoisture'), options: SKIN_MOISTURE_OPTIONS },
      ],
      partSeparator: ', ',
    },
    {
      key: 'pupils',
      label: t('pcr.vitalSignsTable.pupils'),
      parts: [
        { key: 'reactivity', label: t('pcr.vitalSignsTable.partReactivity'), options: PUPIL_REACTIVITY_OPTIONS },
        { key: 'sizeMm', label: t('pcr.vitalSignsTable.partSizeMm') },
      ],
      partSeparator: ', ',
    },
  ]

  const renderCell = (setIndex: number, group: VitalSignGroup) => {
    if (!group.parts) {
      return (
        <CompactField
          value={data[setIndex]?.[group.key] || ''}
          onChange={v => handleFieldChange(setIndex, group.key, v)}
          placeholder={group.placeholder}
          rightIcon={group.key === 'spo2' ? '%' : undefined}
          ariaLabel={group.label}
        />
      )
    }

    // Subsections stack vertically inside the group's own cell, rather than
    // side by side, so each column stays narrow enough for up to 6 to fit.
    // Each one's name is its placeholder (e.g. "Rate", "Rhythm") instead of
    // a separate label above, since there's no room to spare for both.
    return (
      <div className="space-y-1">
        {group.parts.map(part => (
          <CompactField
            key={part.key}
            value={data[setIndex]?.[`${group.key}Parts`]?.[part.key] || ''}
            onChange={v => handlePartChange(setIndex, group, part.key, v)}
            placeholder={part.label}
            ariaLabel={part.label}
            options={part.options}
          />
        ))}
      </div>
    )
  }

  const setCount = Math.max(data.length, 1)
  // Always show every column up to maxSets, not just the filled ones plus a
  // single "add" slot - the empty columns stay visible (as plain placeholder
  // cells) so the table's full extent is visible up front, and only the one
  // right after the last filled set gets the "+" affordance.
  const visibleSlots = maxSets

  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div
          className="grid"
          style={{ gridTemplateColumns: `minmax(72px, 108px) repeat(${visibleSlots}, minmax(100px, 1fr))` }}
        >
          {/* Corner cell above the row-label column */}
          <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900/40 border-b border-r border-gray-200 dark:border-gray-700" />

          {Array.from({ length: visibleSlots }).map((_, setIndex) => {
            const isFilled = setIndex < setCount
            const isNextToFill = setIndex === setCount

            if (!isFilled) {
              return (
                <div
                  key={setIndex}
                  className={cn(
                    'border-b border-l border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20',
                    setIndex === visibleSlots - 1 && 'border-r',
                  )}
                >
                  {/* Only the column right after the last filled set offers
                      "+" - the rest just sit there as plain empty columns so
                      the table's full extent reads as one flowsheet-style
                      box up front. */}
                  {isNextToFill && (
                    <button
                      type="button"
                      onClick={addSet}
                      aria-label={t('pcr.vitalSignsTable.addRow')}
                      className="flex items-center justify-center gap-1 w-full h-full py-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50/60 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            }

            return (
              <div
                key={setIndex}
                className="flex items-center justify-between gap-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-900/40 border-b border-l border-gray-200 dark:border-gray-700"
              >
                {/* Anchored to the cell's left edge; the remove button below
                    is pushed to the right edge via justify-between. */}
                <div className="w-[88px]">
                  <CompactField
                    leftIcon={<Clock className="w-3 h-3" />}
                    value={data[setIndex]?.time || ''}
                    onChange={v => handleFieldChange(setIndex, 'time', v)}
                    placeholder={t('pcr.vitalSignsTable.timeHint')}
                    ariaLabel={t('pcr.vitalSignsTable.time')}
                  />
                </div>

                {/* Always rendered (just hidden below the minimum of 1 set)
                    so this control's presence doesn't shift the header's
                    layout depending on whether any set happens to show it. */}
                <Tooltip content={t('pcr.vitalSignsTable.removeRow', { index: setIndex + 1 })}>
                  <button
                    type="button"
                    onClick={() => removeSet(setIndex)}
                    aria-label={t('pcr.vitalSignsTable.removeRow', { index: setIndex + 1 })}
                    tabIndex={data.length > 1 ? 0 : -1}
                    className={cn(
                      'flex items-center justify-center h-6 w-6 shrink-0 rounded text-gray-400 hover:text-burgundy-600 hover:bg-burgundy-50 dark:text-gray-500 dark:hover:text-burgundy-400 dark:hover:bg-burgundy-900/20 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-burgundy-500 transition-colors',
                      data.length <= 1 && 'invisible',
                    )}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </Tooltip>
              </div>
            )
          })}

          {groups.map((group, groupIndex) => (
            <React.Fragment key={group.key}>
              <div
                className={cn(
                  'sticky left-0 z-10 flex items-center justify-center text-center px-2 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700',
                  groupIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/60 dark:bg-gray-900/20',
                  groupIndex < groups.length - 1 && 'border-b',
                )}
              >
                {group.label}
              </div>

              {Array.from({ length: visibleSlots }).map((_, setIndex) => (
                <div
                  key={setIndex}
                  className={cn(
                    'px-2 py-1.5 border-l border-gray-200 dark:border-gray-700',
                    groupIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/60 dark:bg-gray-900/20',
                    groupIndex < groups.length - 1 && 'border-b',
                    // Closes off the table's right edge - matches the header
                    // row's own last-column border.
                    setIndex === visibleSlots - 1 && 'border-r',
                  )}
                >
                  {setIndex < setCount && renderCell(setIndex, group)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
        <p>{t('pcr.vitalSignsTable.help24h')}</p>
        <p>{t('pcr.vitalSignsTable.helpDnoUto')}</p>
        <p>{t('pcr.vitalSignsTable.helpUnusual')}</p>
      </div>
    </div>
  )
}

export default VitalSignsTable
