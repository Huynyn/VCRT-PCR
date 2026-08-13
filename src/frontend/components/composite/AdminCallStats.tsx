import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { apiRequest } from '@/utils/api'

type Period = 'daily' | 'weekly' | 'monthly' | 'semesterly'

interface DigestRow {
  id: string
  date: string | null
  time_notified: string | null
  on_scene: string | null
  cleared_scene: string | null
  patient_care_transferred: string | null
  supervisor: string | null
  /** JSON-encoded array of responder names, as returned by the backend. */
  responders: string | null
}

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'semesterly', label: 'Semesterly' },
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfWeek(d: Date): Date {
  const diffToMonday = (d.getDay() + 6) % 7
  const start = new Date(d)
  start.setDate(d.getDate() - diffToMonday)
  return start
}

function getPeriodRange(period: Period, now: Date): { start: string; end: string; label: string } {
  if (period === 'daily') {
    return {
      start: formatDate(now),
      end: formatDate(now),
      label: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    }
  }

  if (period === 'weekly') {
    const start = startOfWeek(now)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      start: formatDate(start),
      end: formatDate(end),
      label: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    }
  }

  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
      start: formatDate(start),
      end: formatDate(end),
      label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    }
  }

  // Semesterly - VCRT runs Fall (Sep-Dec) and Winter (Jan-Apr) terms
  const year = now.getFullYear()
  const isWinter = now.getMonth() <= 3
  const start = isWinter ? new Date(year, 0, 1) : new Date(year, 8, 1)
  const end = isWinter ? new Date(year, 3, 30) : new Date(year, 11, 31)
  return {
    start: formatDate(start),
    end: formatDate(end),
    label: `${isWinter ? 'Winter' : 'Fall'} ${year}`,
  }
}

function parseResponders(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => !!name && typeof name === 'string') : []
  } catch {
    return []
  }
}

function parseMinutesOfDay(time: string | null | undefined): number | null {
  if (!time) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function diffMinutes(startTime: string | null, endTime: string | null): number | null {
  const start = parseMinutesOfDay(startTime)
  const end = parseMinutesOfDay(endTime)
  if (start === null || end === null) return null
  let diff = end - start
  if (diff < 0) diff += 24 * 60
  return diff
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
}

function topEntry(counts: Map<string, number>): { names: string[]; count: number } | null {
  let maxCount = 0
  counts.forEach(count => {
    if (count > maxCount) maxCount = count
  })
  if (maxCount === 0) return null

  const names = Array.from(counts.entries())
    .filter(([, count]) => count === maxCount)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))

  return { names, count: maxCount }
}

function useCountUp(value: number, resetKey: string, durationMs = 800): number {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let raf: number
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(value * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    setDisplay(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, resetKey, durationMs])

  return display
}

const StatTile: React.FC<{
  label: string
  value: number
  periodKey: string
  decimals?: number
  suffix?: string
  sublabel?: string
}> = ({ label, value, periodKey, decimals = 0, suffix = '', sublabel }) => {
  const animated = useCountUp(value, periodKey)
  const shown = decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toString()

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
        {shown}
        {suffix}
      </p>
      <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate" title={sublabel}>
          {sublabel}
        </p>
      )}
    </div>
  )
}

const AdminCallStats: React.FC = () => {
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  const [period, setPeriod] = useState<Period>('daily')
  const [rows, setRows] = useState<DigestRow[]>([])
  const [digestLoading, setDigestLoading] = useState(true)
  const [digestError, setDigestError] = useState('')

  useEffect(() => {
    apiRequest('/pcr/stats/pending-approval-count')
      .then(res => setPendingCount(res.data?.count ?? 0))
      .catch(() => {
        // Silently fail - banner is non-critical
      })
  }, [])

  const range = useMemo(() => getPeriodRange(period, new Date()), [period])

  useEffect(() => {
    setDigestLoading(true)
    setDigestError('')
    apiRequest(`/pcr/stats/approved-range?start=${range.start}&end=${range.end}`)
      .then(res => setRows(res.data || []))
      .catch(err => setDigestError(err instanceof Error ? err.message : 'Failed to load digest'))
      .finally(() => setDigestLoading(false))
  }, [range.start, range.end])

  const stats = useMemo(() => {
    const totalCalls = rows.length
    const paramedicCalls = rows.filter(r => r.patient_care_transferred === 'Paramedics').length

    const timeToSceneValues = rows
      .map(r => diffMinutes(r.time_notified, r.on_scene))
      .filter((v): v is number => v !== null)
    const timeOnSceneValues = rows
      .map(r => diffMinutes(r.on_scene, r.cleared_scene))
      .filter((v): v is number => v !== null)

    const responderCounts = new Map<string, number>()
    const supervisorCounts = new Map<string, number>()
    rows.forEach(r => {
      parseResponders(r.responders).forEach(name => {
        responderCounts.set(name, (responderCounts.get(name) || 0) + 1)
      })
      if (r.supervisor) {
        supervisorCounts.set(r.supervisor, (supervisorCounts.get(r.supervisor) || 0) + 1)
      }
    })

    return {
      totalCalls,
      paramedicCalls,
      avgTimeToScene: average(timeToSceneValues),
      avgTimeOnScene: average(timeOnSceneValues),
      topResponder: topEntry(responderCounts),
      topSupervisor: topEntry(supervisorCounts),
    }
  }, [rows])

  const periodKey = `${period}-${range.start}-${range.end}`

  return (
    <div className="space-y-6">
      {pendingCount !== null && pendingCount > 0 && (
        <a
          href="#/reports"
          className="flex items-center gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {pendingCount} PCR{pendingCount === 1 ? '' : 's'} awaiting approval
          </span>
        </a>
      )}

      <div className="card">
        <div className="card-header">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Call Digest</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{range.label}</p>
            </div>
            <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden self-start">
              {PERIOD_OPTIONS.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    i > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
                  } ${
                    period === opt.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card-body">
          {digestError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{digestError}</p>
          )}
          {digestLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatTile label="Total Calls" value={stats.totalCalls} periodKey={periodKey} />
              <StatTile label="Required Paramedics" value={stats.paramedicCalls} periodKey={periodKey} />
              <StatTile
                label="Avg Time to Scene"
                value={stats.avgTimeToScene}
                periodKey={periodKey}
                decimals={1}
                suffix=" min"
              />
              <StatTile
                label="Avg Time on Scene"
                value={stats.avgTimeOnScene}
                periodKey={periodKey}
                decimals={1}
                suffix=" min"
              />
              <StatTile
                label="Top Responder"
                value={stats.topResponder?.count ?? 0}
                periodKey={periodKey}
                sublabel={stats.topResponder?.names.join(', ') ?? 'No data'}
              />
              <StatTile
                label="Top Supervisor"
                value={stats.topSupervisor?.count ?? 0}
                periodKey={periodKey}
                sublabel={stats.topSupervisor?.names.join(', ') ?? 'No data'}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminCallStats
