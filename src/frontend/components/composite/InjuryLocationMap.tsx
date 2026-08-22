import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn, generateId } from '@/utils'
import {
  BODY_VIEWBOX,
  FRONT_MUSCLE_PATHS,
  BACK_MUSCLE_PATHS,
  FRONT_BODY_TRANSFORM,
  BACK_BODY_TRANSFORM,
  type BodySubpath,
} from './bodyGeometry'
import type { InjuryMarker } from '@/types'

// Used for the PDF-export canvas snapshot, which always renders with the
// light-mode body colors on a white background regardless of the app's
// active theme - the on-screen SVG uses --body-fill/--body-stroke CSS
// variables instead so it can adapt to light/dark mode (see BodyPanel below).
const SNAPSHOT_BODY_FILL = '#ffffff'
const SNAPSHOT_BODY_STROKE = '#9da4b0'
// Supersample the canvas so the exported PNG stays crisp once jsPDF scales
// it up to its final print size.
const SNAPSHOT_SCALE = 4

const BODY_PATHS: Record<BodyView, BodySubpath[]> = { front: FRONT_MUSCLE_PATHS, back: BACK_MUSCLE_PATHS }
const BODY_TRANSFORM: Record<BodyView, { scale: number; tx: number; ty: number }> = {
  front: FRONT_BODY_TRANSFORM,
  back: BACK_BODY_TRANSFORM,
}

interface InjuryLocationMapProps {
  value?: string
  onChange: (value: string) => void
  /** Number of OPQRST sections currently on the form - unlocks that many marker numbers/colors. */
  opqrstCount?: number
  className?: string
}

type BodyView = 'front' | 'back'

const MIN_MARKER_SIZE = 5
const MAX_MARKER_SIZE = 17
const DEFAULT_MARKER_SIZE = 10
// Floor for the number's font size - independent of MIN_MARKER_SIZE, whose
// dot can be smaller than this looks fine to render text at (11 used to be
// the floor for both, but at the smallest dot size that meant text taller
// than the dot itself, clipping badly - this is deliberately smaller than
// the marker floor so the digit actually fits inside even the tiniest dot).
const MIN_FONT_SIZE = 8

const SNAPSHOT_GAP = 48

// All injury markers render in this one VCRT red (matches the app's
// burgundy-600 elsewhere) rather than a distinct color per OPQRST number -
// the number inside each marker is what ties it back to its OPQRST section,
// not color.
const MARKER_COLOR = '#95232a'

const parseMarkers = (value?: string): InjuryMarker[] => {
  if (!value || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed?.markers)) return parsed.markers
  } catch {
    // Empty or legacy payloads are simply discarded - user starts fresh
  }
  return []
}

const resolveSnapshotColor = (value: string): string =>
  value === 'var(--body-fill)' ? SNAPSHOT_BODY_FILL : value === 'var(--body-stroke)' ? SNAPSHOT_BODY_STROKE : value

const drawBodyOutline = (ctx: CanvasRenderingContext2D, view: BodyView, offsetX: number, offsetY: number) => {
  const t = BODY_TRANSFORM[view]
  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(t.scale, t.scale)
  ctx.translate(t.tx, t.ty)
  BODY_PATHS[view].forEach(sub => {
    const path = new Path2D(sub.d)
    if (sub.fill !== 'none') {
      ctx.fillStyle = resolveSnapshotColor(sub.fill)
      ctx.fill(path)
    }
    if (sub.stroke !== 'none') {
      ctx.strokeStyle = resolveSnapshotColor(sub.stroke)
      ctx.lineWidth = sub.strokeWidth
      ctx.stroke(path)
    }
  })
  ctx.restore()
}

const buildSnapshot = (markers: InjuryMarker[]): string => {
  const canvas = document.createElement('canvas')
  const panelW = BODY_VIEWBOX.width
  const panelH = BODY_VIEWBOX.height
  canvas.width = (panelW * 2 + SNAPSHOT_GAP) * SNAPSHOT_SCALE
  canvas.height = panelH * SNAPSHOT_SCALE

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.scale(SNAPSHOT_SCALE, SNAPSHOT_SCALE)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, panelW * 2 + SNAPSHOT_GAP, panelH)

  drawBodyOutline(ctx, 'front', 0, 0)
  drawBodyOutline(ctx, 'back', panelW + SNAPSHOT_GAP, 0)

  markers.forEach(marker => {
    const baseX = marker.view === 'front' ? 0 : panelW + SNAPSHOT_GAP
    const x = baseX + (marker.x / 100) * panelW
    const y = (marker.y / 100) * panelH

    ctx.beginPath()
    ctx.arc(x, y, marker.size, 0, Math.PI * 2)
    ctx.strokeStyle = MARKER_COLOR
    ctx.lineWidth = 2.5
    ctx.stroke()

    ctx.fillStyle = MARKER_COLOR
    ctx.font = `bold ${Math.max(marker.size, MIN_FONT_SIZE)}px Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(marker.number), x, y + 1)
  })

  return canvas.toDataURL('image/png')
}

interface BodyPanelProps {
  view: BodyView
  label: string
  isActive: boolean
  markers: InjuryMarker[]
  onSelect: () => void
  onClick: (e: React.MouseEvent<SVGSVGElement>) => void
  svgRef: React.RefObject<SVGSVGElement>
}

const BodyPanel: React.FC<BodyPanelProps> = ({
  view,
  label,
  isActive,
  markers,
  onSelect,
  onClick,
  svgRef,
}) => {
  const t = BODY_TRANSFORM[view]

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'text-sm font-semibold tracking-wide uppercase px-4 py-1 rounded-full transition-colors',
          isActive
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
        )}
      >
        {label}
      </button>

      <div className="w-full max-w-[240px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`}
          className={cn(
            'w-full h-auto cursor-crosshair select-none transition-opacity',
            '[--body-fill:#ffffff] [--body-stroke:#9da4b0] dark:[--body-fill:#101827] dark:[--body-stroke:#9ca3af]',
            isActive ? 'opacity-100' : 'opacity-70'
          )}
          onClick={onClick}
          data-testid={`injury-body-${view}`}
        >
          <g transform={`scale(${t.scale}) translate(${t.tx} ${t.ty})`}>
            {BODY_PATHS[view].map((sub, i) => (
              <path
                key={i}
                d={sub.d}
                fill={sub.fill}
                stroke={sub.stroke}
                strokeWidth={sub.strokeWidth}
                strokeLinecap={sub.strokeLinecap ?? 'round'}
                strokeLinejoin="round"
              />
            ))}
          </g>

          {markers.filter(m => m.view === view).map(m => {
            const cx = (m.x / 100) * BODY_VIEWBOX.width
            const cy = (m.y / 100) * BODY_VIEWBOX.height
            return (
              <g key={m.id} pointerEvents="none">
                <circle cx={cx} cy={cy} r={m.size} fill="none" stroke={MARKER_COLOR} strokeWidth={2.5} />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={MARKER_COLOR}
                  fontSize={Math.max(m.size, MIN_FONT_SIZE)}
                  fontWeight={700}
                >
                  {m.number}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

const InjuryLocationMap: React.FC<InjuryLocationMapProps> = ({
  value,
  onChange,
  opqrstCount = 0,
  className,
}) => {
  const { t } = useTranslation()
  const [markers, setMarkers] = useState<InjuryMarker[]>(() => parseMarkers(value))
  const [activeView, setActiveView] = useState<BodyView>('front')
  const [activeNumber, setActiveNumber] = useState(1)
  const [markerSize, setMarkerSize] = useState(DEFAULT_MARKER_SIZE)

  const frontRef = useRef<SVGSVGElement>(null)
  const backRef = useRef<SVGSVGElement>(null)
  const svgRefs: Record<BodyView, React.RefObject<SVGSVGElement>> = { front: frontRef, back: backRef }
  const lastSentRef = useRef<string>('')

  useEffect(() => {
    if (!value || value === lastSentRef.current) return
    setMarkers(parseMarkers(value))
  }, [value])

  const availableNumbers = useMemo(() => {
    const count = Math.max(1, Math.min(4, opqrstCount || 0))
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [opqrstCount])

  useEffect(() => {
    if (!availableNumbers.includes(activeNumber)) {
      setActiveNumber(availableNumbers[availableNumbers.length - 1])
    }
  }, [availableNumbers, activeNumber])

  // Removing an OPQRST section drops the marker numbers/colors past the new
  // count from the picker above, but any dots already drawn with one of
  // those now-unavailable numbers would otherwise just stay on the body
  // diagram forever - no longer selectable, no longer corresponding to any
  // OPQRST entry, but still rendered. Drop them here and re-commit so the
  // PDF snapshot reflects the same trim.
  useEffect(() => {
    const maxNumber = Math.max(1, Math.min(4, opqrstCount || 0))
    setMarkers(prev => {
      const trimmed = prev.filter(m => m.number <= maxNumber)
      if (trimmed.length === prev.length) return prev
      const serialized = JSON.stringify({ markers: trimmed, imageData: buildSnapshot(trimmed) })
      lastSentRef.current = serialized
      onChange(serialized)
      return trimmed
    })
  }, [opqrstCount, onChange])

  const commit = (next: InjuryMarker[]) => {
    setMarkers(next)
    const serialized = JSON.stringify({ markers: next, imageData: buildSnapshot(next) })
    lastSentRef.current = serialized
    onChange(serialized)
  }

  const handlePanelClick = (view: BodyView) => (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRefs[view].current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return

    setActiveView(view)

    const clickX = (xPct / 100) * BODY_VIEWBOX.width
    const clickY = (yPct / 100) * BODY_VIEWBOX.height
    const hit = markers.find(m => {
      if (m.view !== view) return false
      const mx = (m.x / 100) * BODY_VIEWBOX.width
      const my = (m.y / 100) * BODY_VIEWBOX.height
      return Math.hypot(mx - clickX, my - clickY) <= m.size + 4
    })

    if (hit) {
      commit(markers.filter(m => m.id !== hit.id))
    } else {
      commit([...markers, { id: generateId(), view, x: xPct, y: yPct, size: markerSize, number: activeNumber }])
    }
  }

  const handleClear = () => commit([])

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('pcr.opqrst.marker')}</span>
            <div className="flex gap-2">
              {availableNumbers.map(n => (
                <Tooltip key={n} content={t('pcr.opqrst.markerTooltip', { number: n })}>
                  <button
                    type="button"
                    onClick={() => setActiveNumber(n)}
                    aria-label={t('pcr.opqrst.selectMarker', { number: n })}
                    className={cn(
                      'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold',
                      'bg-white dark:bg-gray-900 transition-transform',
                      activeNumber === n ? 'scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'
                    )}
                    style={{
                      borderColor: MARKER_COLOR,
                      color: MARKER_COLOR,
                      boxShadow: activeNumber === n ? `0 0 0 3px ${MARKER_COLOR}33` : undefined,
                    }}
                  >
                    {n}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('pcr.opqrst.size')}</span>
            <input
              type="range"
              min={MIN_MARKER_SIZE}
              max={MAX_MARKER_SIZE}
              value={markerSize}
              onChange={e => setMarkerSize(Number(e.target.value))}
              className="w-24"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          leftIcon={<Eraser className="w-4 h-4" />}
        >
          {t('pcr.opqrst.clear')}
        </Button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t('pcr.opqrst.instructions')}
      </p>

      <div className="flex flex-col sm:flex-row items-start justify-center gap-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <BodyPanel
          view="front"
          label={t('pcr.opqrst.front')}
          isActive={activeView === 'front'}
          markers={markers}
          onSelect={() => setActiveView('front')}
          onClick={handlePanelClick('front')}
          svgRef={frontRef}
        />
        <BodyPanel
          view="back"
          label={t('pcr.opqrst.back')}
          isActive={activeView === 'back'}
          markers={markers}
          onSelect={() => setActiveView('back')}
          onClick={handlePanelClick('back')}
          svgRef={backRef}
        />
      </div>
    </div>
  )
}

export default InjuryLocationMap
