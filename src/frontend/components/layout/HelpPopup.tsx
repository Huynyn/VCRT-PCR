import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { HelpCircle, X, ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/utils'

const FEEDBACK_EMAIL = 'ebic-vcrt@uottawa.ca'

// lucide-react 0.263 doesn't ship a chat-bubble-with-exclamation-mark icon
// (that was added in later versions), so this composes one from the plain
// speech bubble outline plus an overlaid "!".
const FeedbackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('relative inline-flex items-center justify-center shrink-0', className)}>
    <MessageSquare className="w-full h-full" aria-hidden="true" />
    <span className="absolute text-[9px] font-bold leading-none -translate-y-[1px]" aria-hidden="true">
      !
    </span>
  </span>
)

interface HelpPopupProps {
  isOpen: boolean
  onClose: () => void
  isAdmin: boolean
}

interface FaqItem {
  q: string
  a: string
}

// Popup starts anchored near the header's Help icon (top-right) until the
// user drags it - then it switches to a fixed { top, left } that follows
// the pointer, clamped to stay on screen.
const DEFAULT_STYLE: React.CSSProperties = { top: 72, right: 16 }

const HelpPopup: React.FC<HelpPopupProps> = ({ isOpen, onClose, isAdmin }) => {
  const { t } = useTranslation()
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const dragState = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setPos(null)
      setOpenIndex(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = popupRef.current?.getBoundingClientRect()
    if (!rect) return
    dragState.current = { startX: e.clientX, startY: e.clientY, origTop: rect.top, origLeft: rect.left }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const rect = popupRef.current?.getBoundingClientRect()
    const width = rect?.width ?? 0
    const height = rect?.height ?? 0
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    const maxLeft = Math.max(window.innerWidth - width - 8, 8)
    const maxTop = Math.max(window.innerHeight - height - 8, 8)
    setPos({
      left: Math.min(Math.max(dragState.current.origLeft + dx, 8), maxLeft),
      top: Math.min(Math.max(dragState.current.origTop + dy, 8), maxTop),
    })
  }

  const handleDragEnd = () => {
    dragState.current = null
  }

  const faqs: FaqItem[] = t(isAdmin ? 'help.admin' : 'help.user', { returnObjects: true }) as FaqItem[]
  const sectionTitle = isAdmin ? t('help.adminHeading') : t('help.userHeading')

  return createPortal(
    <div
      ref={popupRef}
      style={pos ? { top: pos.top, left: pos.left } : DEFAULT_STYLE}
      className="fixed z-[1200] w-96 max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl"
      role="dialog"
      aria-label={t('help.title')}
    >
      {/* Drag handle */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 cursor-move select-none shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle className="w-4 h-4 text-primary-600 dark:text-primary-400 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{t('help.title')}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400 transition-colors"
          aria-label={t('common.closeModal')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          {sectionTitle}
        </p>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {faqs.map((faq, index) => {
            const isOpenItem = openIndex === index
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpenItem ? null : index)}
                  className="w-full flex items-start justify-between gap-2 py-2.5 text-left"
                  aria-expanded={isOpenItem}
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 mt-0.5 shrink-0 text-gray-400 transition-transform',
                      isOpenItem && 'rotate-180'
                    )}
                  />
                </button>
                {isOpenItem && (
                  <p className="pb-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{faq.a}</p>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-gray-100 dark:border-gray-700 px-4 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <FeedbackIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('help.feedbackHeading')}</span>
        </div>
        <p className="pl-6 text-sm text-primary-600 dark:text-primary-400">{FEEDBACK_EMAIL}</p>
      </div>
    </div>,
    document.body
  )
}

export default HelpPopup
