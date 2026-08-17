import { formatTime, validateTime, isDnoUtoValue, validateEmail } from '../index'

describe('formatTime', () => {
  it('leaves an already-formatted HH:MM value unchanged', () => {
    expect(formatTime('09:30')).toBe('09:30')
  })

  it('inserts a colon into a 4-digit HHMM value', () => {
    expect(formatTime('0930')).toBe('09:30')
  })

  it('leaves an incomplete/partial value unchanged rather than mangling it', () => {
    // Regression guard: TimePicker relies on this staying a pass-through for
    // partial input (e.g. "19:4" mid-typing) so the displayed value and the
    // value handed to onChange never disagree.
    expect(formatTime('19:4')).toBe('19:4')
  })

  it('returns an empty string for empty input', () => {
    expect(formatTime('')).toBe('')
  })
})

describe('validateTime', () => {
  it('accepts valid 24-hour HH:MM times', () => {
    expect(validateTime('00:00')).toBe(true)
    expect(validateTime('23:59')).toBe(true)
    expect(validateTime('9:05')).toBe(true)
  })

  it('rejects incomplete or out-of-range values', () => {
    expect(validateTime('19:4')).toBe(false)
    expect(validateTime('24:00')).toBe(false)
    expect(validateTime('12:60')).toBe(false)
    expect(validateTime('')).toBe(false)
  })
})

describe('isDnoUtoValue', () => {
  it('recognizes DNO/UTO and the French N.O./I.O. equivalents, case-insensitively and with/without periods', () => {
    expect(isDnoUtoValue('DNO')).toBe(true)
    expect(isDnoUtoValue('dno')).toBe(true)
    expect(isDnoUtoValue('D.N.O.')).toBe(true)
    expect(isDnoUtoValue('UTO')).toBe(true)
    expect(isDnoUtoValue('N.O.')).toBe(true)
    expect(isDnoUtoValue('I.O.')).toBe(true)
  })

  it('rejects ordinary values and empty input', () => {
    expect(isDnoUtoValue('19:30')).toBe(false)
    expect(isDnoUtoValue('')).toBe(false)
    expect(isDnoUtoValue(null)).toBe(false)
    expect(isDnoUtoValue(undefined)).toBe(false)
  })
})

describe('validateEmail', () => {
  it('accepts a plausible email address', () => {
    expect(validateEmail('someone@example.com')).toBe(true)
  })

  it('rejects strings with no @ or domain', () => {
    expect(validateEmail('not-an-email')).toBe(false)
  })
})
