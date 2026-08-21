import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils'

interface TooltipProps {
  content: string
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  disabled?: boolean
  className?: string
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 500,
  disabled = false,
  className,
}) => {
  const [visible, setVisible] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const showTooltip = () => {
    if (disabled) return
    
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  useEffect(() => {
    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return

      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      
      let top = 0
      let left = 0

      switch (position) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - 8
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
          break
        case 'bottom':
          top = triggerRect.bottom + 8
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
          break
        case 'left':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
          left = triggerRect.left - tooltipRect.width - 8
          break
        case 'right':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
          left = triggerRect.right + 8
          break
      }

      // Ensure tooltip stays within viewport
      const padding = 8
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding))
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding))

      setTooltipPosition({ top, left })
    }

    if (visible) {
      updatePosition()
      
      const handleScroll = () => updatePosition()
      const handleResize = () => updatePosition()
      
      window.addEventListener('scroll', handleScroll)
      window.addEventListener('resize', handleResize)
      
      return () => {
        window.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [visible, position])

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  const tooltip = visible && (
    <div
      ref={tooltipRef}
      className={cn(
        'fixed z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg',
        'animate-fade-in pointer-events-none',
        'dark:bg-gray-700',
        className
      )}
      style={{
        top: tooltipPosition.top,
        left: tooltipPosition.left,
      }}
      role="tooltip"
    >
      {content}
    </div>
  )

  const handleClick = (e: React.MouseEvent) => {
    // Clicking a button leaves it focused, which would otherwise keep the
    // tooltip pinned open (via onFocus) until the user clicks elsewhere.
    hideTooltip()
    triggerRef.current?.blur()
    children.props.onClick?.(e)
  }

  return (
    <>
      {React.cloneElement(children, {
        ref: triggerRef,
        onMouseEnter: showTooltip,
        onMouseLeave: hideTooltip,
        onFocus: showTooltip,
        onBlur: hideTooltip,
        onClick: handleClick,
        'aria-describedby': visible ? 'tooltip' : undefined,
      })}
      {createPortal(tooltip, document.body)}
    </>
  )
}

export default Tooltip