import React from 'react'
import { cn } from '@/utils'

interface FooterProps {
  className?: string
}

const Footer: React.FC<FooterProps> = ({ className }) => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className={cn(
      'h-16 flex items-center bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6',
      className
    )}>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        © {currentYear} Patient Care Report. All rights reserved.
      </p>
    </footer>
  )
}

export default Footer
