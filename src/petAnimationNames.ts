export function pickAnimationName(available: string[], candidates: string[]) {
  return candidates.find((name) => available.includes(name)) ?? null
}

export function preferredSleepAnimation(available: string[]) {
  return pickAnimationName(available, ['shuijiao', 'sleep', 'rest'])
}
