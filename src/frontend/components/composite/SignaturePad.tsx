import React, { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/utils'

interface SignaturePadProps {
  value?: string
  onChange: (value: string) => void
  className?: string
}

const CANVAS_HEIGHT = 130

const SignaturePad: React.FC<SignaturePadProps> = ({ value, onChange, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  // Once the user has drawn, ignore further `value` prop echoes (our own
  // onChange feeding back in) so we don't redraw over an in-progress signature.
  const userDrewRef = useRef(false)
  const restoredRef = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(!!value)

  // Size the backing canvas for the device pixel ratio once on mount.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = CANVAS_HEIGHT * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  // Restore a previously-saved signature (e.g. loading a draft that finishes
  // fetching after this pad has already mounted). Only ever applied once,
  // and never after the user has started drawing their own signature.
  useEffect(() => {
    if (!value || restoredRef.current || userDrewRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    restoredRef.current = true
    const img = new Image()
    img.onload = () => {
      const ratio = window.devicePixelRatio || 1
      ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio)
      setHasStrokes(true)
    }
    img.src = value
  }, [value])

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    userDrewRef.current = true
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(e)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const last = lastPointRef.current
    const point = pointFromEvent(e)
    if (ctx && last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
    lastPointRef.current = point
    setHasStrokes(true)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
    onChange(canvasRef.current?.toDataURL('image/png') || '')
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    userDrewRef.current = true
    setHasStrokes(false)
    onChange('')
  }

  return (
    <div className={cn('space-y-2', className)}>
      <canvas
        ref={canvasRef}
        style={{ height: CANVAS_HEIGHT, touchAction: 'none' }}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {hasStrokes ? 'Signed' : 'Sign above'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          leftIcon={<Eraser className="w-3.5 h-3.5" />}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}

export default SignaturePad
