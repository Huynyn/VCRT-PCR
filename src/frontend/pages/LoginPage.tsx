import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, Lock, Moon, Sun, X, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Tooltip } from '@/components/ui'
import { Input } from '@/components/forms'
import { useAuth } from '@/context'
import { cn } from '@/utils'

const LoginPage: React.FC = () => {
  const { login, isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [lockoutMessage, setLockoutMessage] = useState('')
  const [shake, setShake] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('pcr_theme')
    return saved ? saved === 'dark' : true
  })

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('User is authenticated, navigating to dashboard')
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // Keep the document in sync in case this page loads before the app shell
  // has had a chance to apply the saved theme (e.g. a fresh /login load).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const toggleTheme = () => {
    const newTheme = !darkMode
    setDarkMode(newTheme)
    localStorage.setItem('pcr_theme', newTheme ? 'dark' : 'light')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submitted with:', formData)
    setError('')
    setLockoutMessage('')

    if (!formData.username || !formData.password) {
      setError('Please enter both username and password')
      return
    }

    try {
      console.log('Calling login...')
      await login(formData.username, formData.password)
      console.log('Login returned successfully')
    } catch (err) {
      console.error('Login error:', err)
      const status = (err as { status?: number } | undefined)?.status

      if (status === 429) {
        // Account temporarily locked - the backend's message already
        // includes how long, so surface it as-is rather than our own copy.
        setLockoutMessage(err instanceof Error ? err.message : 'Too many failed attempts.')
      } else {
        // Wrong username/password (or any other failure): a generic message
        // so a mistyped username can't be distinguished from a wrong password.
        setError('Incorrect username or password.')
      }

      setFormData({ username: '', password: '' })
      setShake(true)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    if (error) setError('') // Clear error when user starts typing
    if (lockoutMessage) setLockoutMessage('')
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-primary-50 via-white to-burgundy-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4 overflow-hidden">
      {/* Theme toggle */}
      <div className="absolute top-4 right-4">
        <Tooltip content={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </Tooltip>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Left side - Branding and features */}
        <div className="hidden lg:grid grid-cols-[200px,1fr] gap-8 items-center">
          {/* Logo column (far left) */}
          <div className="flex justify-start">
            <img
              src="./images/vcrt_logo.png"
              alt="Patient Care Report"
              className="h-48 xl:h-56 w-auto object-contain drop-shadow-sm"
            />
          </div>

          {/* Text column (aligned with the logo) */}
          <div className="flex flex-col justify-center space-y-3">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-gray-100 leading-tight">
              PCR
            </h1>
            <p className="text-2xl lg:text-3xl font-semibold text-gray-800 dark:text-gray-200">
              Patient Care Report
            </p>
            <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
              Comprehensive documentation system designed for the Volunteer Crisis
              Response Team (VCRT) at the University of Ottawa.
            </p>
          </div>
        </div>

        {/* Right side - Login form */}
        <div className="w-full max-w-md mx-auto">
          <Card
            className={cn('overflow-hidden', shake && 'animate-shake motion-reduce:animate-none')}
            onAnimationEnd={() => setShake(false)}
          >
            <div className="h-1 bg-gradient-to-r from-primary-700 to-burgundy-700" />
            <Card.Body>
              <form onSubmit={handleSubmit} className="space-y-4">
                {lockoutMessage ? (
                  <div className="flex gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/20">
                    <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <Lock className="w-4 h-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        Account temporarily locked
                      </p>
                      <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
                        {lockoutMessage}
                      </p>
                    </div>
                  </div>
                ) : (
                  error && (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-burgundy-200 bg-burgundy-50 dark:border-burgundy-800/60 dark:bg-burgundy-900/20">
                      <XCircle className="w-5 h-5 text-burgundy-500 dark:text-burgundy-400 shrink-0" />
                      <p className="flex-1 text-sm text-burgundy-800 dark:text-burgundy-200">{error}</p>
                      <button
                        type="button"
                        onClick={() => setError('')}
                        aria-label="Dismiss"
                        className="shrink-0 p-1 rounded text-burgundy-500 hover:text-burgundy-700 hover:bg-burgundy-100 dark:text-burgundy-400 dark:hover:text-burgundy-200 dark:hover:bg-burgundy-900/40"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                )}

                <Input
                  label="Username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Enter your username"
                  required
                  disabled={isLoading}
                />

                <Input
                  label="Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />

                <Button
                  type="submit"
                  className="w-full"
                  loading={isLoading}
                  disabled={!formData.username || !formData.password}
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            </Card.Body>

            <Card.Footer>
              <div className="space-y-4">
                <div className="text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>© 2026 Patient Care Report</p>
                </div>
              </div>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
