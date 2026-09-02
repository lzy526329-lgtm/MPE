export const REST_HEALTH_INTERVAL_MS = 6_000
export const DREAM_REMINDER_ID = 'dream'

export type RestingVitals = {
  health: number
  satiety: number
  hygiene: number
  moodBonus: number
}

export function isPetResting(restingSince: number | null | undefined): boolean {
  return typeof restingSince === 'number' && Number.isFinite(restingSince) && restingSince > 0
}

export function isDreamReminderId(id: string | undefined | null): boolean {
  return id === DREAM_REMINDER_ID
}

function clampStat(value: number) {
  return Math.min(100, Math.max(0, value))
}

export function advanceRestHealth(health: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return clampStat(health)
  return clampStat(health + elapsedMs / REST_HEALTH_INTERVAL_MS)
}

export function tickRestingVitals(stats: RestingVitals, elapsedMs: number): RestingVitals {
  return {
    ...stats,
    health: advanceRestHealth(stats.health, elapsedMs),
  }
}
