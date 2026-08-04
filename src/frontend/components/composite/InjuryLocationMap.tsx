import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn, generateId, MARKER_COLORS } from '@/utils'
import {
  BODY_VIEWBOX,
  FRONT_BODY_PATH,
  BACK_BODY_PATH,
  FRONT_BODY_TRANSFORM,
  BACK_BODY_TRANSFORM,
} from './bodyGeometry'
import type { InjuryMarker } from '@/types'

// Used for the PDF-export canvas snapshot, which is always drawn on a white
// background - the on-screen SVG uses Tailwind's gray classes instead so it
// adapts to light/dark mode (see BodyPanel below).
const SNAPSHOT_BODY_COLOR = '#9ca3af'

const BODY_PATH: Record<BodyView, string> = { front: FRONT_BODY_PATH, back: BACK_BODY_PATH }
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

const MIN_MARKER_SIZE = 7
const MAX_MARKER_SIZE = 22
const DEFAULT_MARKER_SIZE = 12

const SNAPSHOT_GAP = 48
const SNAPSHOT_LABEL_HEIGHT = 40

const colorForNumber = (n: number): string =>
  MARKER_COLORS.find(c => c.number === n)?.hex || MARKER_COLORS[0].hex

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

const drawBodyOutline = (ctx: CanvasRenderingContext2D, view: BodyView, offsetX: number, offsetY: number) => {
  const t = BODY_TRANSFORM[view]
  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(t.scale, t.scale)
  ctx.translate(t.tx, t.ty)
  ctx.fillStyle = SNAPSHOT_BODY_COLOR
  ctx.fill(new Path2D(BODY_PATH[view]))
  ctx.restore()
}

const buildSnapshot = (markers: InjuryMarker[]): string => {
  const canvas = document.createElement('canvas')
  const panelW = BODY_VIEWBOX.width
  const panelH = BODY_VIEWBOX.height
  canvas.width = panelW * 2 + SNAPSHOT_GAP
  canvas.height = panelH + SNAPSHOT_LABEL_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 22px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('FRONT', panelW / 2, 28)
  ctx.fillText('BACK', panelW + SNAPSHOT_GAP + panelW / 2, 28)

  drawBodyOutline(ctx, 'front', 0, SNAPSHOT_LABEL_HEIGHT)
  drawBodyOutline(ctx, 'back', panelW + SNAPSHOT_GAP, SNAPSHOT_LABEL_HEIGHT)

  markers.forEach(marker => {
    const baseX = marker.view === 'front' ? 0 : panelW + SNAPSHOT_GAP
    const x = baseX + (marker.x / 100) * panelW
    const y = SNAPSHOT_LABEL_HEIGHT + (marker.y / 100) * panelH
    const color = colorForNumber(marker.number)

    ctx.beginPath()
    ctx.arc(x, y, marker.size, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.stroke()

    ctx.fillStyle = color
    ctx.font = `bold ${Math.max(marker.size, 11)}px Arial, sans-serif`
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

      <div
        className={cn(
          'w-full max-w-[240px] rounded-lg border-2 bg-gray-50 dark:bg-gray-800/50 transition-colors',
          isActive ? 'border-primary-500' : 'border-gray-200 dark:border-gray-700'
        )}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`}
          className="w-full h-auto cursor-crosshair select-none text-gray-400 dark:text-gray-500"
          onClick={onClick}
          data-testid={`injury-body-${view}`}
        >
          <g transform={`scale(${t.scale}) translate(${t.tx} ${t.ty})`}>
            <path d={BODY_PATH[view]} fill="currentColor" />
          </g>

          {markers.filter(m => m.view === view).map(m => {
            const cx = (m.x / 100) * BODY_VIEWBOX.width
            const cy = (m.y / 100) * BODY_VIEWBOX.height
            const color = colorForNumber(m.number)
            return (
              <g key={m.id} pointerEvents="none">
                <circle cx={cx} cy={cy} r={m.size} fill="none" stroke={color} strokeWidth={2.5} />
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={color}
                  fontSize={Math.max(m.size, 11)}
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

  const availableColors = useMemo(() => {
    const count = Math.max(1, Math.min(4, opqrstCount || 0))
    return MARKER_COLORS.slice(0, count)
  }, [opqrstCount])

  useEffect(() => {
    if (!availableColors.some(c => c.number === activeNumber)) {
      setActiveNumber(availableColors[availableColors.length - 1].number)
    }
  }, [availableColors, activeNumber])

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
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Marker:</span>
            <div className="flex gap-2">
              {availableColors.map(c => (
                <Tooltip key={c.number} content={`OPQRST #${c.number} - ${c.name}`}>
                  <button
                    type="button"
                    onClick={() => setActiveNumber(c.number)}
                    aria-label={`Select marker ${c.number} (${c.name})`}
                    className={cn(
                      'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold',
                      'bg-white dark:bg-gray-900 transition-transform',
                      activeNumber === c.number ? 'scale-110' : 'opacity-60 hover:opacity-100 hover:scale-105'
                    )}
                    style={{
                      borderColor: c.hex,
                      color: c.hex,
                      boxShadow: activeNumber === c.number ? `0 0 0 3px ${c.hex}33` : undefined,
                    }}
                  >
                    {c.number}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Size:</span>
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
          leftIcon={<Trash2 className="w-4 h-4" />}
        >
          Clear
        </Button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Select a marker number, then click Front or Back to place it. Click a placed marker to remove it.
      </p>

      <div className="flex flex-col sm:flex-row items-start justify-center gap-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <BodyPanel
          view="front"
          label="Front"
          isActive={activeView === 'front'}
          markers={markers}
          onSelect={() => setActiveView('front')}
          onClick={handlePanelClick('front')}
          svgRef={frontRef}
        />
        <BodyPanel
          view="back"
          label="Back"
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
