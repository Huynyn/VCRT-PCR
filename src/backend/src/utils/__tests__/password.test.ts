import { validatePasswordStrength } from '../password'

describe('validatePasswordStrength', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePasswordStrength('Ab1')).toMatch(/at least 8 characters/i)
  })

  it('rejects passwords with no lowercase letter', () => {
    expect(validatePasswordStrength('PASSWORD1')).toMatch(/lowercase/i)
  })

  it('rejects passwords with no uppercase letter', () => {
    expect(validatePasswordStrength('password1')).toMatch(/uppercase/i)
  })

  it('rejects passwords with no number', () => {
    expect(validatePasswordStrength('Password')).toMatch(/number/i)
  })

  it('rejects non-string input', () => {
    expect(validatePasswordStrength(undefined)).toMatch(/at least 8 characters/i)
    expect(validatePasswordStrength(12345678)).toMatch(/at least 8 characters/i)
  })

  it('accepts a password meeting every rule', () => {
    expect(validatePasswordStrength('Password1')).toBeNull()
  })

  it('accepts the app defaults used to seed fresh installs', () => {
    // Regression guard for the seeded admin/user accounts (create-users.ts):
    // both must satisfy this same policy, or a fresh install would ship
    // default credentials that can't pass its own password rules.
    expect(validatePasswordStrength('Vcrt-Ebic2026!')).toBeNull()
    expect(validatePasswordStrength('Vcrt-User2026!')).toBeNull()
  })
})
