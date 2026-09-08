import { chooseFish, createFishCatch } from './fishingEngine'
import type { BaitId, FishCatch } from './fishingTypes'

export const BITE_MIN_MS = 2_500
export const BITE_MAX_MS = 7_000
export const REEL_WINDOW_MS = 2_000

export type FishingSessionPublic = {
  token: string
  biteAt: number
  deadline: number
  windowMs: number
}

type ActiveSession = FishingSessionPublic & {
  ownerId: number
  catch: FishCatch
}

export type ReelOutcome =
  | { status: 'invalid' | 'too-early' | 'too-late' }
  | { status: 'caught'; catch: FishCatch }

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
      const session: ActiveSession = {
        ownerId,
        token,
        biteAt,
        deadline,
        windowMs: REEL_WINDOW_MS,
        catch: createFishCatch(chooseFish(baitId, rng), startedAt, token, rng),
      }
      sessions.set(ownerId, session)
      return { token, biteAt, deadline, windowMs: REEL_WINDOW_MS }
    },

    reel(ownerId: number, token: string): ReelOutcome {
      const session = sessions.get(ownerId)
      if (!session || session.ownerId !== ownerId || session.token !== token) {
        return { status: 'invalid' }
      }
      sessions.delete(ownerId)
      const now = options.now()
      if (now < session.biteAt) return { status: 'too-early' }
      if (now > session.deadline) return { status: 'too-late' }
      return { status: 'caught', catch: { ...session.catch } }
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
