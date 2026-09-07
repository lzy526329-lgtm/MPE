export type Rect = { x: number; y: number; w: number; h: number }

/** Axis-aligned bounding box overlap. y increases downward. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Jump only when standing on ground (y=0, vy=0). y is offset above ground (negative = airborne). */
export function canStartJump(y: number, vy: number): boolean {
  return y === 0 && vy === 0
}

/** Integrate vertical jump. Returns grounded state when y would go above 0. */
export function stepJumpY(
  y: number,
  vy: number,
  gravity: number,
  dtSec: number,
): { y: number; vy: number } {
  let nextVy = vy + gravity * dtSec
  let nextY = y + nextVy * dtSec
  if (nextY >= 0) {
    return { y: 0, vy: 0 }
  }
  return { y: nextY, vy: nextVy }
}
