import React from 'react'
import { cn } from '@/utils'

interface TitleBadgeProps {
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}

// Section-header label used on the Dashboard and Profile pages: icon + title
// together in one solid pill instead of a plain icon chip next to plain
// text, paired with `.card-header-flush` (no border) so the header blends
// straight into the body below it.
const TitleBadge: React.FC<TitleBadgeProps> = ({ icon, children, className }) => (
  <span
    className={cn(
      'inline-flex items-center gap-2.5 max-w-full min-w-0 rounded-full bg-primary-600 dark:bg-primary-500 text-white pl-4 pr-6 py-3',
      className,
    )}
  >
    <span className="flex items-center justify-center w-5 h-5 shrink-0">{icon}</span>
    <span className="text-base font-semibold truncate min-w-0">{children}</span>
  </span>
)

export default TitleBadge
