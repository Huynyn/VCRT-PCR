import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/utils'

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  overlay?: boolean
  className?: string
}

interface LoadingSkeletonProps {
  className?: string
  rows?: number
}

const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  text,
  overlay = false,
  className,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  const content = (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <Loader2 className={cn('animate-spin text-primary-600', sizeClasses[size])} />
      {text && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text}</p>
      )}
    </div>
  )

  if (overlay) {
    return (
      // z-[1200] - above the Sidebar's own z-[1100] (see Sidebar.tsx), so
      // the dimming backdrop covers the sidebar too instead of leaving it
      // showing through undimmed while the rest of the page is covered.
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-xl">
          {content}
        </div>
      </div>
    )
  }

  return content
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  className,
  rows = 1,
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton h-4 w-full"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        />
      ))}
    </div>
  )
}

const LoadingSpinner: React.FC<{ className?: string }> = ({ className }) => {
  return <div className={cn('loading-spinner', className)} />
}

Loading.Skeleton = LoadingSkeleton
Loading.Spinner = LoadingSpinner

export default Loading