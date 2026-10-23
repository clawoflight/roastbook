export function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return /failed to fetch|fetch failed|networkerror|network error|load failed/i.test(
    message,
  )
}
