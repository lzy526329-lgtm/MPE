import type { FarmNeedKind } from './farmNeeds'

export type FarmReminderLatches = Partial<Record<FarmNeedKind, boolean>>

export type FarmReminderDecision = {
  kind: FarmNeedKind
  text: string
  requireConfirm: false
  dismissAfterMs: 8000
}

export type FarmReminderResult = {
  decision: FarmReminderDecision | null
  latches: FarmReminderLatches
}

const LINES: Record<FarmNeedKind, string[]> = {
  harvest: ['农场有作物熟了，快去收一下～', '有作物可以收获啦，别忘了～'],
  bug: ['有作物生虫了，帮我除一下虫好不好？', '田里有虫子，快去除虫呀～'],
  water: ['有作物该浇水啦，别干着了～', '地里有点旱，记得浇浇水～'],
}

function pickLine(kind: FarmNeedKind) {
  const pool = LINES[kind]
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
}

function clearResolvedLatches(latches: FarmReminderLatches, needs: FarmNeedKind[]): FarmReminderLatches {
  const active = new Set(needs)
  const next: FarmReminderLatches = {}
  for (const kind of Object.keys(latches) as FarmNeedKind[]) {
    if (active.has(kind) && latches[kind]) next[kind] = true
  }
  return next
}

export function farmReminderId(kind: FarmNeedKind) {
  return `farm:${kind}`
}

/** 气泡真正发出去之前，不能把新 kind 锁死，否则 LLM/崩溃会把这次提醒吞掉。 */
export function commitFarmReminderLatches(result: FarmReminderResult, delivered: boolean): FarmReminderLatches {
  if (delivered || !result.decision) return result.latches
  const pending = { ...result.latches }
  delete pending[result.decision.kind]
  return pending
}

export function decideFarmReminder(input: {
  needs: FarmNeedKind[]
  latches: FarmReminderLatches
}): FarmReminderResult {
  const latches = clearResolvedLatches(input.latches, input.needs)
  const kind = input.needs.find((need) => !latches[need])
  if (!kind) return { decision: null, latches }

  return {
    decision: {
      kind,
      text: pickLine(kind),
      requireConfirm: false,
      dismissAfterMs: 8_000,
    },
    latches: { ...latches, [kind]: true },
  }
}
