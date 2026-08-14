import React from 'react'
import { cn } from '@/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

interface CardHeaderProps extends CardProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

interface CardBodyProps extends CardProps {}

interface CardFooterProps extends CardProps {}

interface CardComponent extends React.FC<CardProps> {
  Header: React.FC<CardHeaderProps>
  Body: React.FC<CardBodyProps>
  Footer: React.FC<CardFooterProps>
}

const Card = (({ children, className, ...rest }) => {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  )
}) as CardComponent

const CardHeader: React.FC<CardHeaderProps> = ({ 
  children, 
  className, 
  title, 
  subtitle, 
  actions 
}) => {
  return (
    <div className={cn('card-header', className)}>
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="ml-4">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

const CardBody: React.FC<CardBodyProps> = ({ children, className }) => {
  return <div className={cn('card-body', className)}>{children}</div>
}

const CardFooter: React.FC<CardFooterProps> = ({ children, className }) => {
  return <div className={cn('card-footer', className)}>{children}</div>
}

Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter

export default Card