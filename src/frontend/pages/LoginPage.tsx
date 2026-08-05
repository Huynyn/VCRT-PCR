import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Alert, Tooltip } from '@/components/ui'
import { Input } from '@/components/forms'
import { useAuth } from '@/context'

const LoginPage: React.FC = () => {
  const { login, isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
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
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
    if (error) setError('') // Clear error when user starts typing
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-medical-50 to-primary-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />

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
          <Card>
            <Card.Body>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert type="error" message={error} dismissible onDismiss={() => setError('')} />
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
