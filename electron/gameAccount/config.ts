export function getGameApiBaseUrl(production: boolean, env: Record<string, string | undefined> = process.env): string {
  const configured = env.GAME_API_BASE_URL?.trim()
  if (!configured && production) throw new Error('Production builds require GAME_API_BASE_URL')
  const url = new URL(configured || 'http://localhost:8088')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && (production || !local || url.protocol !== 'http:'))) {
    throw new Error('GAME_API_BASE_URL must use HTTPS (local HTTP is development-only)')
  }
  return url.href.replace(/\/+$/, '')
}
