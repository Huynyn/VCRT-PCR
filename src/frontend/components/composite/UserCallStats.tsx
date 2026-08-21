import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { TitleBadge } from '@/components/ui'
import CallCalendar from './CallCalendar'
import RollingBarChart, { BarDatum } from './RollingBarChart'

interface MineStatsRow {
  id: string
  date: string | null
  supervisor: string | null
  /** JSON-encoded array of responder names, as returned by the backend. */
  responders: string | null
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

type Season = 'Fall' | 'Winter'

function seasonRange(season: Season, year: number): [string, string] {
  return season === 'Fall'
    ? [`${year}-09-01`, `${year}-12-31`]
    : [`${year}-01-01`, `${year}-04-30`]
}

function aggregate(rows: MineStatsRow[]): { total: number; bars: BarDatum[] } {
  const supervisorCounts = new Map<string, number>()
  const responderCounts = new Map<string, number>()

  rows.forEach(r => {
    if (r.supervisor) {
      supervisorCounts.set(r.supervisor, (supervisorCounts.get(r.supervisor) || 0) + 1)
    }
    parseResponders(r.responders).forEach(resp => {
      responderCounts.set(resp, (responderCounts.get(resp) || 0) + 1)
    })
  })

  const bars: BarDatum[] = [
    ...Array.from(supervisorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, highlight: true })),
    ...Array.from(responderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value })),
  ]

  return { total: rows.length, bars }
}

const UserCallStats: React.FC = () => {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()
  const [rows, setRows] = useState<MineStatsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [season, setSeason] = useState<Season | ''>('')
  const [year, setYear] = useState(String(new Date().getFullYear()))

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest('/pcr/stats/mine')
      .then(res => setRows(res.data || []))
      .catch(() => {
        // Silently fail - stats section is non-critical
      })
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  const markedDates = useMemo(
    () => new Set(rows.filter(r => r.date).map(r => r.date as string)),
    [rows]
  )

  const handleSelectDate = (date: string) => {
    setSelectedDate(date)
    setSeason('')
  }

  const handleSelectSeason = (value: string) => {
    setSeason(value as Season | '')
    setSelectedDate(null)
  }

  const handleSelectYear = (value: string) => {
    setYear(value)
    if (season) setSelectedDate(null)
  }

  const { total, bars, totalLabel } = useMemo(() => {
    if (selectedDate) {
      const dayRows = rows.filter(r => r.date === selectedDate)
      return { ...aggregate(dayRows), totalLabel: t('callStats.callsOn', { date: selectedDate }) }
    }

    if (season) {
      const yearNum = parseInt(year, 10)
      if (!Number.isNaN(yearNum) && year.trim().length === 4) {
        const [start, end] = seasonRange(season, yearNum)
        const seasonRows = rows.filter(r => r.date && r.date >= start && r.date <= end)
        return {
          ...aggregate(seasonRows),
          totalLabel: t('callStats.seasonCalls', {
            season: t(`callStats.${season.toLowerCase()}`),
            year: yearNum,
          }),
        }
      }
    }

    return { total: 0, bars: [] as BarDatum[], totalLabel: t('callStats.calls') }
  }, [selectedDate, season, year, rows, t])

  return (
    <div className="card">
      <div className="card-header-flush">
        <TitleBadge icon={<CalendarDays className="w-5 h-5" />}>{t('callStats.title')}</TitleBadge>
      </div>
      <div className="card-body">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            <div className="md:col-span-2">
              <CallCalendar
                markedDates={markedDates}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
              />
            </div>

            <div className="md:col-span-3">
              <div className="flex flex-wrap items-end gap-3 mb-5">
                <div>
                  <label className="form-label" htmlFor="season-select">
                    {t('callStats.season')}
                  </label>
                  <select
                    id="season-select"
                    value={season}
                    onChange={e => handleSelectSeason(e.target.value)}
                    className="min-w-[140px] rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">{t('callStats.selectPlaceholder')}</option>
                    <option value="Fall">{t('callStats.fall')}</option>
                    <option value="Winter">{t('callStats.winter')}</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="season-year">
                    {t('callStats.year')}
                  </label>
                  <input
                    id="season-year"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={year}
                    onChange={e => handleSelectYear(e.target.value)}
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
              </div>

              <RollingBarChart totalLabel={totalLabel} totalCount={total} bars={bars} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserCallStats
