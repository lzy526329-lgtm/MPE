export const HEIGHT_SCALE = 10;
export const STAGES = [
  { start: 0, name: '01 — 雾林起点', color: 0x91af8e },
  { start: 12, name: '02 — 盘山栈道', color: 0xd3b488 },
  { start: 24, name: '03 — 风车回廊', color: 0x97b9bb },
  { start: 36, name: '04 — 空中折返', color: 0xc5add0 },
  { start: 48, name: '05 — 星环之巅', color: 0xd9c690 },
];
const bridges = new Set([4, 5, 6, 7, 19, 20, 21, 39, 40, 41, 42]);
const movers = new Set([15, 16, 28, 29, 44, 55]);
const rotators = new Set([18, 32, 45, 57]);
const spinners = new Set([10, 26, 38, 52]);
const steps = new Set([8, 9, 11, 23, 33, 34, 35, 49, 50, 51, 58, 59]);
let angle = 0;
let height = 0;
export const LEVEL = Array.from({ length: 61 }, (_, id) => {
  const checkpoint = id > 0 && id < 60 && id % 12 === 0;
  const kind = id === 0 ? 'start' : id === 60 ? 'summit' : checkpoint ? 'checkpoint'
    : bridges.has(id) ? 'bridge' : movers.has(id) ? 'moving' : rotators.has(id) ? 'rotating'
      : spinners.has(id) ? 'spinner' : steps.has(id) ? 'steps' : 'island';
  if (id > 0) {
    angle += rotators.has(id) || rotators.has(id - 1) || spinners.has(id) || spinners.has(id - 1)
      ? 0.38 : kind === 'bridge' ? 0.245 : 0.285;
    height += kind === 'bridge' ? 0.22 : kind === 'steps' ? 1.15 : 0.92;
  }
  const radius = 14 + Math.sin(id * 0.34) * 1.7;
  const large = ['start', 'checkpoint', 'summit'].includes(kind);
  const narrow = kind === 'bridge' || kind === 'rotating';
  return {
    id, kind, x: Math.sin(angle) * radius, z: Math.cos(angle) * radius,
    y: Number(height.toFixed(2)), routeAngle: angle, angle: 0,
    w: kind === 'spinner' ? 6.4 : large ? 5.8 : narrow ? 1.45 : kind === 'steps' ? 2.5 : 3.3,
    d: kind === 'spinner' ? 6.4 : large ? 5.5 : kind === 'rotating' ? 5.6 : kind === 'bridge' ? 4.4 : kind === 'steps' ? 2.5 : 3.6,
    checkpoint, moving: kind === 'moving', rotating: kind === 'rotating', hazard: kind === 'spinner',
    stage: Math.min(4, Math.floor(id / 12)),
  };
});
for (const p of LEVEL) {
  const before = LEVEL[Math.max(0, p.id - 1)];
  const after = LEVEL[Math.min(LEVEL.length - 1, p.id + 1)];
  p.angle = Math.atan2(after.x - before.x, after.z - before.z);
}
export const SUMMIT = LEVEL.at(-1);
export const CHECKPOINTS = LEVEL.filter(p => p.checkpoint).map(p => p.id);
export const CORE = Array.from({ length: 7 }, (_, i) => ({
  x: 0, z: 0, y: i * 7 - 3, height: 7, radius: 7.5 - i * 0.48,
}));

export function samplePlatform(p, time) {
  const offset = p.moving ? Math.sin(time * 0.85) * 0.9 : 0;
  return {
    x: p.x + Math.sin(p.routeAngle) * offset,
    z: p.z + Math.cos(p.routeAngle) * offset,
    angle: p.angle + (p.rotating ? time * 0.5 : 0),
  };
}
export function platformLocalPoint(p, point) {
  const x = point.x - p.x, z = point.z - p.z;
  return { x: x * Math.cos(p.angle) - z * Math.sin(p.angle), z: x * Math.sin(p.angle) + z * Math.cos(p.angle) };
}
export function platformWorldPoint(p, point) {
  return { x: p.x + point.x * Math.cos(p.angle) + point.z * Math.sin(p.angle), z: p.z - point.x * Math.sin(p.angle) + point.z * Math.cos(p.angle) };
}
export function containsPlatform(p, point, margin = 0) {
  const local = platformLocalPoint(p, point);
  return Math.abs(local.x) <= p.w / 2 + margin && Math.abs(local.z) <= p.d / 2 + margin;
}

export function landingPoint(p) {
  // The approach-side rim lies outside the sweeper's reach, including the player radius.
  return p.hazard ? platformWorldPoint(p, { x: 0, z: -2.7 }) : { x: p.x, z: p.z };
}
