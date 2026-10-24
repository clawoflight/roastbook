import { describe, expect, test } from 'bun:test'
import { isDarkTheme, THEME_COLORS, themeColor } from '@/lib/theme'

describe('theme resolution', () => {
  test('honors explicit preferences', () => {
    expect(isDarkTheme('dark', false)).toBe(true)
    expect(isDarkTheme('light', true)).toBe(false)
  })

  test('uses the system preference for system and invalid values', () => {
    expect(isDarkTheme('system', true)).toBe(true)
    expect(isDarkTheme('system', false)).toBe(false)
    expect(isDarkTheme('invalid', true)).toBe(true)
  })

  test('maps the effective theme to the page color', () => {
    expect(themeColor(true)).toBe(THEME_COLORS.dark)
    expect(themeColor(false)).toBe(THEME_COLORS.light)
  })
})
