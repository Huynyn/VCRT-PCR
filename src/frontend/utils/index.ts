import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(time: string): string {
  if (!time) return ''
  
  // If already in HH:MM format, return as is
  if (time.match(/^\d{2}:\d{2}$/)) return time
  
  // If in HHMM format, add colon
  if (time.match(/^\d{4}$/)) {
    return `${time.slice(0, 2)}:${time.slice(2)}`
  }
  
  return time
}

export function validateTime(time: string): boolean {
  if (!time) return false
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  return timeRegex.test(time)
}

// Matches the "Did Not Obtain"/"Unable to Obtain" shorthand (DNO/UTO) or its
// French equivalent ("N.O."/"I.O." - Non Obtenu / Impossible d'Obtenir),
// with or without periods between the letters (e.g. "DNO", "D.N.O.", "no",
// "N.O."). Used to let these values through fields that would otherwise
// reject non-numeric/non-time input, and to trigger the "explain in comment
// section" hint wherever they're entered.
export function isDnoUtoValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  const stripped = String(value).trim().replace(/\./g, '').toUpperCase()
  return stripped === 'DNO' || stripped === 'UTO' || stripped === 'NO' || stripped === 'IO'
}

export function validateDate(date: string): boolean {
  if (!date) return false
  const dateObj = new Date(date)
  return dateObj instanceof Date && !isNaN(dateObj.getTime())
}

export function validateEmail(email: string): boolean {
  if (!email) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePhone(phone: string): boolean {
  if (!phone) return false
  const phoneRegex = /^\+?[\d\s\-\(\)\.]+$/
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10
}

// Mirrors the backend's validatePasswordStrength (src/backend/src/utils/password.ts)
// so users see the same requirement client-side instead of only on submit.
export function getPasswordStrengthError(password: string, t: (key: string) => string): string | null {
  if (!password || password.length < 8) {
    return t('common.passwordMinLength')
  }
  if (!/[a-z]/.test(password)) {
    return t('common.passwordLowercase')
  }
  if (!/[A-Z]/.test(password)) {
    return t('common.passwordUppercase')
  }
  if (!/[0-9]/.test(password)) {
    return t('common.passwordNumber')
  }
  return null
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Parses a timestamp coming from the backend (SQLite's CURRENT_TIMESTAMP,
 * e.g. "2026-08-03 18:32:10") as UTC.
 *
 * SQLite stores these as UTC but with no timezone marker, and `new Date(...)`
 * parses that ambiguous format as *local* time rather than UTC - silently
 * shifting every displayed timestamp by the viewer's own UTC offset. Marking
 * it explicitly as UTC here makes `.toLocaleString()`/`.toLocaleDateString()`
 * (called with no `timeZone` override) correctly convert it to the viewer's
 * real local time, the same as any other `Date`.
 */
export function parseServerDate(dateString: string): Date {
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(dateString)) {
    return new Date(dateString)
  }
  return new Date(`${dateString.replace(' ', 'T')}Z`)
}

export function getCurrentTime(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

export function calculateAge(birthDate: string): string {
  if (!birthDate) return ''
  
  const birth = new Date(birthDate)
  const today = new Date()
  
  if (birth > today) return ''
  
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  
  return age.toString()
}

export function sanitizeInput(input: string): string {
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

export function exportToJSON(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

export function importFromJSON(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        resolve(data)
      } catch (error) {
        reject(new Error('Invalid JSON file'))
      }
    }
    
    reader.onerror = () => reject(new Error('Error reading file'))
    reader.readAsText(file)
  })
}

// Colors used to link an OPQRST assessment section (1-4) with its
// corresponding marker on the injury location body diagram.
export const MARKER_COLORS: Array<{ number: number; name: string; hex: string }> = [
  { number: 1, name: 'Red', hex: '#DC2626' },
  { number: 2, name: 'Blue', hex: '#2563EB' },
  { number: 3, name: 'Yellow', hex: '#D97706' },
  { number: 4, name: 'Green', hex: '#059669' },
]

export const validationRules = {
  required: (value: any) => {
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return value !== null && value !== undefined
  },
  
  minLength: (min: number) => (value: string) => {
    return value.length >= min
  },
  
  maxLength: (max: number) => (value: string) => {
    return value.length <= max
  },
  
  pattern: (regex: RegExp) => (value: string) => {
    return regex.test(value)
  },
  
  number: (value: string) => {
    return !isNaN(Number(value))
  },
  
  range: (min: number, max: number) => (value: string | number) => {
    const num = typeof value === 'string' ? Number(value) : value
    return num >= min && num <= max
  }
}