import { chooseFish, createFishCatch } from './fishingEngine'
import { getFishCatalogEntry } from './fishCatalog'
import type { BaitId, FishCatch } from './fishingTypes'

export const BITE_MIN_MS = 2_500
export const BITE_MAX_MS = 7_000
export const REEL_WINDOW_MS = 20_000
export const LINE_TENSION_WARNING = 0.56
export const LINE_TENSION_DANGER = 0.82
export const TENSION_RECOVERY_MS = 2_400
export const LINE_RED_WINDOW_MS = 2_000
export const LINE_RED_BUFFER_MS = 1_000
export const LINE_RECOVERY_MIN_MS = 700
export const LINE_RECOVERY_MAX_MS = 1_700
export const LINE_RED_CHANCE = 0.18

const MAX_PROGRESS = 1
const BASE_PROGRESS_PER_REEL = 0.026
const BASE_TENSION_PER_REEL = 0.13
const RARITY_FIGHT_STRENGTH = {
  common: 0.18,
  uncommon: 0.24,
  rare: 0.31,
  precious: 0.38,
} as const

export type FishingLineStatus = 'safe' | 'warning' | 'danger'

export type FishingFightSnapshot = {
  deadline: number
  progress: number
  tension: number
  tensionAt: number
  fishPull: number
  lineDangerUntil: number
  lineRecoveryUntil: number
  lineRecoveryStatus: 'safe' | 'warning'
}

export type FishingSessionPublic = {
  token: string
  biteAt: number
  deadline: number
  windowMs: number
}

type ActiveSession = FishingSessionPublic & {
  ownerId: number
  catch: FishCatch
  progress: number
  tension: number
  tensionAt: number
  fishStrength: number
  lineDangerAt: number
  lineDangerUntil: number
  lineRecoveryUntil: number
  lineRecoveryStatus: 'safe' | 'warning'
}

export type ReelOutcome =
  | { status: 'invalid' | 'too-early' | 'too-late' }
  | { status: 'line-broken' }
  | ({ status: 'continue' } & FishingFightSnapshot)
  | ({ status: 'caught'; catch: FishCatch } & FishingFightSnapshot)

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

export function lineStatusForTension(tension: number): FishingLineStatus {
  if (tension >= LINE_TENSION_DANGER) return 'danger'
  if (tension >= LINE_TENSION_WARNING) return 'warning'
  return 'safe'
}

function getLiveTension(session: ActiveSession, now: number): number {
  const elapsed = Math.max(0, now - session.tensionAt)
  const recovery = elapsed / TENSION_RECOVERY_MS
  return clamp(session.tension - recovery)
}

function snapshot(session: ActiveSession, now: number, fishPull = 0): FishingFightSnapshot {
  return {
    deadline: session.deadline,
    progress: session.progress,
    tension: getLiveTension(session, now),
    tensionAt: now,
    fishPull,
    lineDangerUntil: session.lineDangerUntil,
    lineRecoveryUntil: session.lineRecoveryUntil,
    lineRecoveryStatus: session.lineRecoveryStatus,
  }
}

export function createFishingSessionManager(options: {
  now: () => number
  rng?: () => number
  randomUUID: () => string
}) {
  const rng = options.rng ?? Math.random
  const sessions = new Map<number, ActiveSession>()

  return {
    start(ownerId: number, baitId: BaitId): FishingSessionPublic {
      const startedAt = options.now()
      const waitRoll = Math.min(1, Math.max(0, rng()))
      const waitMs = BITE_MIN_MS + Math.floor((BITE_MAX_MS - BITE_MIN_MS) * waitRoll)
      const token = options.randomUUID()
      const biteAt = startedAt + waitMs
      const deadline = biteAt + REEL_WINDOW_MS
      const fishCatch = createFishCatch(chooseFish(baitId, rng), startedAt, token, rng)
      const fishStrength = RARITY_FIGHT_STRENGTH[getFishCatalogEntry(fishCatch.fishId).rarity]
      const session: ActiveSession = {
        ownerId,
        token,
        biteAt,
        deadline,
        windowMs: REEL_WINDOW_MS,
        catch: fishCatch,
        progress: 0,
        tension: 0,
        tensionAt: biteAt,
        fishStrength,
        lineDangerAt: 0,
        lineDangerUntil: 0,
        lineRecoveryUntil: 0,
        lineRecoveryStatus: 'safe',
      }
      sessions.set(ownerId, session)
      return { token, biteAt, deadline, windowMs: REEL_WINDOW_MS }
    },

    reel(ownerId: number, token: string): ReelOutcome {
      const session = sessions.get(ownerId)
      if (!session || session.ownerId !== ownerId || session.token !== token) {
        return { status: 'invalid' }
      }
      const now = options.now()
      if (now < session.biteAt) {
        sessions.delete(ownerId)
        return { status: 'too-early' }
      }
      if (now > session.deadline) {
        sessions.delete(ownerId)
        return { status: 'too-late' }
      }

      if (session.lineDangerUntil > now) {
        if (now >= session.lineDangerAt) {
          sessions.delete(ownerId)
          return { status: 'line-broken' }
        }
        return { status: 'continue', ...snapshot(session, now, 0) }
      }

      const recoveringLine = session.lineRecoveryUntil > now
      const redLineTriggered = !recoveringLine && clamp(rng()) >= 1 - LINE_RED_CHANCE
      const tension = getLiveTension(session, now)
      const fishPull = clamp(
        0.42 + session.fishStrength * 0.75 + clamp(rng()) * 0.12,
        0,
        1,
      )
      session.progress = clamp(
        session.progress + BASE_PROGRESS_PER_REEL - session.fishStrength * 0.025,
        0,
        MAX_PROGRESS,
      )
      session.tension = clamp(
        tension + BASE_TENSION_PER_REEL + session.fishStrength * 0.2 + fishPull * 0.04,
      )
      session.tensionAt = now
      if (redLineTriggered) {
        // Forced red-line pauses must not consume the player's reeling time.
        session.deadline += LINE_RED_WINDOW_MS
        session.lineDangerAt = now + LINE_RED_BUFFER_MS
        session.lineDangerUntil = now + LINE_RED_WINDOW_MS
        session.lineRecoveryUntil =
          session.lineDangerUntil +
          LINE_RECOVERY_MIN_MS +
          Math.floor(clamp(rng()) * (LINE_RECOVERY_MAX_MS - LINE_RECOVERY_MIN_MS))
        session.lineRecoveryStatus = clamp(rng()) >= 0.5 ? 'warning' : 'safe'
      } else if (!recoveringLine) {
        session.lineDangerAt = 0
        session.lineDangerUntil = 0
        session.lineRecoveryUntil = 0
        session.lineRecoveryStatus = 'safe'
      }

      if (session.progress >= MAX_PROGRESS) {
        sessions.delete(ownerId)
        return {
          status: 'caught',
          catch: { ...session.catch },
          ...snapshot(session, now, fishPull),
        }
      }

      return { status: 'continue', ...snapshot(session, now, fishPull) }
    },

    cancel(ownerId: number, token: string): boolean {
      const session = sessions.get(ownerId)
      if (!session || session.token !== token) return false
      sessions.delete(ownerId)
      return true
    },
  }
}

export type FishingSessionManager = ReturnType<typeof createFishingSessionManager>
