export type AuthenticationState =
  | 'authenticated'
  | 'auth-required'
  | 'unreachable'

export async function checkAuthentication(): Promise<AuthenticationState> {
  try {
    const response = await fetch('/api/auth-probe', { cache: 'no-store' })
    if (response.status === 204) return 'authenticated'
    if (response.status === 401 || response.status === 403) {
      return 'auth-required'
    }
    if (response.redirected) return 'auth-required'

    const pathname = new URL(response.url, window.location.origin).pathname
    if (pathname.startsWith('/_gate/')) return 'auth-required'
    if (
      response.headers.get('content-type')?.toLowerCase().includes('text/html')
    ) {
      return 'auth-required'
    }
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}
