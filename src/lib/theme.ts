export const THEME_COLORS = {
  light: '#f6eddf',
  dark: '#1f1a14',
} as const

export function isDarkTheme(theme: unknown, systemDark: boolean): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return systemDark
}

export function themeColor(isDark: boolean): string {
  return isDark ? THEME_COLORS.dark : THEME_COLORS.light
}
