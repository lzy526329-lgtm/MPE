import { Application, Container, Graphics } from 'pixi.js'
import type { ResolvedHeartRallyConfig } from './petSkillDefaults'

export type HeartRallyGameOptions = {
  app: Application
  root: HTMLElement
  getHitCenter: () => { x: number; y: number }
  /** 宠物脚底 y（画布坐标），爱心低于此即掉球结束 */
  getFootY: () => number
  getViewSize: () => number
  /** 1 朝右，-1 朝左；爱心朝正面飞出 */
  getFacing: () => number
  getConfig: () => ResolvedHeartRallyConfig
  playAttack: (animation: string) => number
  playHurt?: () => number
  onActiveChange?: (active: boolean) => void
  onTimeUp?: (score: number) => void
  /** 掉球 / 漏接，直接结束 */
  onMiss?: (score: number) => void
}

type Heart = {
  gfx: Graphics
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** outbound：飞向玩家，可点击；inbound：飞回宠物，可被击回 */
  dir: 'outbound' | 'inbound'
  spin: number
}

/** 更大视野 → 弹得更远 */
const GAME_VIEW_MIN = 960

export type HeartRallyGame = {
  isActive: () => boolean
  start: () => void
  stop: () => void
  tick: (now: number) => void
  /** 左键点击：命中爱心则弹回 */
  handleClick: (clientX: number, clientY: number) => boolean
  getDesiredViewSize: (contentSize: number) => number
}

function drawHeart(gfx: Graphics, r: number, fill = 0xff4d6d, stroke = 0xffffff) {
  gfx.clear()
  gfx.lineStyle(3, stroke, 0.9)
  gfx.beginFill(fill, 0.95)
  const s = r * 0.55
  gfx.drawCircle(-s * 0.55, -s * 0.35, s * 0.72)
  gfx.drawCircle(s * 0.55, -s * 0.35, s * 0.72)
  gfx.moveTo(-s * 1.15, -s * 0.05)
  gfx.lineTo(0, s * 1.25)
  gfx.lineTo(s * 1.15, -s * 0.05)
  gfx.closePath()
  gfx.endFill()
  gfx.beginFill(0xffffff, 0.35)
  gfx.drawCircle(-s * 0.7, -s * 0.55, s * 0.28)
  gfx.endFill()
}

export function createHeartRallyGame(options: HeartRallyGameOptions): HeartRallyGame {
  let active = false
  let score = 0
  let lastTickAt = 0
  let endsAt = 0
  let ending = false
  let nextServeAt = 0
  let petReadyAt = 0
  let config = options.getConfig()
  let heart: Heart | null = null
  const layer = new Container()
  layer.visible = false
  options.app.stage.addChild(layer)

  const hud = document.createElement('div')
  hud.className = 'pet-ball-hud pet-heart-hud'
  const scoreEl = document.createElement('strong')
  scoreEl.className = 'pet-ball-score'
  const tipEl = document.createElement('span')
  tipEl.className = 'pet-ball-tip'
  tipEl.textContent = '左键点爱心 · 掉球即结束'
  hud.append(scoreEl, tipEl)
  options.root.appendChild(hud)

  function renderHud(now = performance.now()) {
    const leftSec = active ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0
    scoreEl.textContent = `连击 ${score} · ${leftSec}s`
  }

  function clearHeart() {
    if (!heart) return
    layer.removeChild(heart.gfx)
    heart.gfx.destroy()
    heart = null
  }

  function finishAlive(kind: 'timeup' | 'stop') {
    if (!active && kind === 'stop') return
    const finalScore = score
    active = false
    ending = false
    endsAt = 0
    nextServeAt = 0
    clearHeart()
    layer.visible = false
    hud.classList.remove('is-on')
    options.onActiveChange?.(false)
    if (kind === 'timeup') options.onTimeUp?.(finalScore)
  }

  /** 掉球 / 漏接：直接结束，无 HP */
  function finishMiss() {
    if (ending || !active) return
    ending = true
    const finalScore = score
    active = false
    endsAt = 0
    nextServeAt = 0
    clearHeart()
    layer.visible = false
    hud.classList.remove('is-on')
    options.onActiveChange?.(false)
    options.playHurt?.()
    window.setTimeout(() => {
      ending = false
      options.onMiss?.(finalScore)
    }, 450)
  }

  function launchHeart(fromPet: boolean): Heart | null {
    if (!active || ending) return null
    const center = options.getHitCenter()
    const face = options.getFacing() >= 0 ? 1 : -1
    const r = 28
    const gfx = new Graphics()
    drawHeart(gfx, r)
    const x = center.x + face * (fromPet ? 36 : 44)
    const y = center.y - 12
    gfx.x = x
    gfx.y = y
    layer.addChild(gfx)

    const speed = config.heartSpeed * (0.92 + Math.random() * 0.16)
    const lift = config.arcLift * (0.9 + Math.random() * 0.2)
    const next: Heart = {
      gfx,
      x,
      y,
      vx: face * speed * (fromPet ? 1 : -1),
      vy: -lift,
      r,
      dir: fromPet ? 'outbound' : 'inbound',
      spin: 0,
    }
    heart = next
    return next
  }

  function serveFromPet(now: number) {
    if (!active || ending || heart) return
    if (now < petReadyAt) return
    options.playAttack(config.skill.animation)
    const startDelay = config.skill.activeStartMs
    petReadyAt = now + config.skill.cooldownMs
    window.setTimeout(() => {
      if (!active || ending || heart) return
      launchHeart(true)
    }, Math.max(40, startDelay))
  }

  function bounceByPlayer() {
    if (!heart || heart.dir !== 'outbound') return false
    const face = options.getFacing() >= 0 ? 1 : -1
    const speed = Math.hypot(heart.vx, heart.vy) || config.heartSpeed
    const nextSpeed = Math.min(config.heartSpeed * 1.12, speed * 1.02 + 0.04)
    heart.vx = -face * nextSpeed
    heart.vy = -config.arcLift * (0.85 + Math.random() * 0.25)
    heart.dir = 'inbound'
    score += 1
    renderHud()
    drawHeart(heart.gfx, heart.r, 0xff7aa2, 0xffe6ee)
    return true
  }

  function bounceByPet(now: number) {
    if (!heart || heart.dir !== 'inbound') return
    if (now < petReadyAt) return
    const face = options.getFacing() >= 0 ? 1 : -1
    options.playAttack(config.skill.animation)
    petReadyAt = now + config.skill.cooldownMs

    const speed = Math.hypot(heart.vx, heart.vy) || config.heartSpeed
    const nextSpeed = Math.min(config.heartSpeed * 1.15, speed * 1.03 + 0.04)
    heart.vx = face * nextSpeed
    heart.vy = -config.arcLift * (0.88 + Math.random() * 0.22)
    heart.dir = 'outbound'
    drawHeart(heart.gfx, heart.r, 0xff4d6d, 0xffffff)
  }

  function updateHeart(dt: number, now: number) {
    if (!active || ending || !heart) return
    const center = options.getHitCenter()
    const size = options.getViewSize()
    const footY = options.getFootY()
    const face = options.getFacing() >= 0 ? 1 : -1

    heart.vy += config.gravity * dt
    heart.x += heart.vx * dt
    heart.y += heart.vy * dt
    heart.spin += 0.08 * dt * Math.sign(heart.vx || face)
    heart.gfx.x = heart.x
    heart.gfx.y = heart.y
    heart.gfx.rotation = heart.spin * 0.35

    // 低于宠物脚下 → 掉球，直接结束
    if (heart.y - heart.r * 0.35 > footY) {
      finishMiss()
      return
    }

    if (heart.dir === 'inbound') {
      const dx = heart.x - center.x
      const dy = heart.y - center.y
      const { range, halfHeight, minDist } = config.skill
      const inFront = dx * face >= minDist - heart.r
      const inRange = Math.abs(dx) <= range + heart.r && Math.abs(dy) <= halfHeight + heart.r
      if (inFront && inRange) {
        bounceByPet(now)
        return
      }
      if (dx * face < -config.bodyHitReach) {
        finishMiss()
        return
      }
    }

    const pastPlayer =
      heart.dir === 'outbound' &&
      ((face > 0 && heart.x > size + heart.r + 8) || (face < 0 && heart.x < -heart.r - 8))
    const above = heart.y < -heart.r - 40
    if (pastPlayer || above) {
      finishMiss()
    }
  }

  return {
    isActive: () => active || ending,
    getDesiredViewSize(contentSize: number) {
      return Math.max(contentSize, GAME_VIEW_MIN)
    },
    start() {
      if (active || ending) return
      config = options.getConfig()
      active = true
      ending = false
      score = 0
      const now = performance.now()
      lastTickAt = now
      endsAt = now + config.durationMs
      nextServeAt = now + 280
      petReadyAt = 0
      clearHeart()
      options.app.stage.addChild(layer)
      layer.visible = true
      hud.classList.add('is-on')
      renderHud(now)
      options.onActiveChange?.(true)
    },
    stop() {
      if (ending) return
      finishAlive('stop')
    },
    tick(now: number) {
      if (ending) return
      if (!active) return
      if (now >= endsAt) {
        finishAlive('timeup')
        return
      }
      const dt = Math.min(32, Math.max(0, now - (lastTickAt || now))) / 16.67
      lastTickAt = now
      if (!heart && now >= nextServeAt) {
        serveFromPet(now)
        nextServeAt = Number.POSITIVE_INFINITY
      }
      updateHeart(dt, now)
      if (active) renderHud(now)
    },
    handleClick(clientX: number, clientY: number) {
      if (!active || ending || !heart) return false
      if (heart.dir !== 'outbound') return false
      const dx = clientX - heart.x
      const dy = clientY - heart.y
      if (Math.hypot(dx, dy) > heart.r + config.clickRadius) return false
      return bounceByPlayer()
    },
  }
}
