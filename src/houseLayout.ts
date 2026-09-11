import type { HouseSurface } from '../electron/farm/farmTypes'

export type HousePoint = { left: number; top: number }
// Percent coordinates in the uncropped square room illustration.
export const HOUSE_SURFACES: Record<HouseSurface, HousePoint[]> = {
  'left-wall': [{ left: 4, top: 34.5 }, { left: 50, top: 8.5 }, { left: 50, top: 40.5 }, { left: 4, top: 67 }],
  'right-wall': [{ left: 50, top: 8.5 }, { left: 96, top: 33 }, { left: 96, top: 65.5 }, { left: 50, top: 40.5 }],
  floor: [{ left: 50, top: 40.5 }, { left: 96, top: 65.5 }, { left: 50, top: 93.5 }, { left: 4, top: 67 }],
}

function contains(polygon: HousePoint[], point: HousePoint): boolean {
  let sign = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const cross = (b.left - a.left) * (point.top - a.top) - (b.top - a.top) * (point.left - a.left)
    if (Math.abs(cross) < 0.001) continue
    if (sign && sign !== Math.sign(cross)) return false
    sign = Math.sign(cross)
  }
  return true
}

export function houseSurfaceAt(point: HousePoint): HouseSurface | null {
  if (!Number.isFinite(point.left) || !Number.isFinite(point.top)) return null
  return (['floor', 'left-wall', 'right-wall'] as const).find((surface) => contains(HOUSE_SURFACES[surface], point)) ?? null
}

export function constrainHousePoint(surface: HouseSurface, point: HousePoint): HousePoint {
  const polygon = HOUSE_SURFACES[surface]
  if (contains(polygon, point)) return point
  let nearest = polygon[0], distance = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const dx = b.left - a.left, dy = b.top - a.top
    const t = Math.max(0, Math.min(1, ((point.left - a.left) * dx + (point.top - a.top) * dy) / (dx * dx + dy * dy)))
    const candidate = { left: a.left + t * dx, top: a.top + t * dy }
    const d = Math.hypot(candidate.left - point.left, candidate.top - point.top)
    if (d < distance) { distance = d; nearest = candidate }
  }
  return nearest
}
