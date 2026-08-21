import { Application, Container, Graphics } from 'pixi.js'
import type { ResolvedBallHitConfig } from './petSkillDefaults'

export type BallHitGameOptions = {
  app: Application
  root: HTMLElement
  getHitCenter: () => { x: number; y: number }
  getViewSize: () => number
  /** 1 朝右，-1 朝左；小球只从正面飞来 */
  getFacing: () => number
  /** 当前局配置（角色 meta 合并默认值） */
  getConfig: () => ResolvedBallHitConfig
  /** 播放攻击动画，传入技能动画名 */
  playAttack: (animation: string) => number
  playHurt?: () => number
  playDie: () => number
  onActiveChange?: (active: boolean) => void
  onTimeUp?: (score: number) => void
  onDead?: (score: number) => void
}

type Ball = {
  gfx: Graphics
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const GAME_VIEW_MIN = 420

export type BallHitGame = {
  isActive: () => boolean
  start: () => void
  stop: () => void
  tick: (now: number) => void
  handleAttack: () => boolean
  getDesiredViewSize: (contentSize: number) => number
}

export function createBallHitGame(options: BallHitGameOptions): BallHitGame {
  let active = false
  let score = 0
  let hp = 100
  let nextSpawnAt = 0
  let attackActiveFrom = 0
  let attackActiveUntil = 0
  let attackReadyAt = 0
  let lastTickAt = 0
  let endsAt = 0
  let dying = false
  let config = options.getConfig()
  const balls: Ball[] = []
  const layer = new Container()
  layer.visible = false
  options.app.stage.addChild(layer)

  const hud = document.createElement('div')
  hud.className = 'pet-ball-hud'
  const scoreEl = document.createElement('strong')
  scoreEl.className = 'pet-ball-score'
  const tipEl = document.createElement('span')
  tipEl.className = 'pet-ball-tip'
  tipEl.textContent = '左键攻击 · 正面来球'
  hud.append(scoreEl, tipEl)
  options.root.appendChild(hud)

  function renderHud(now = performance.now()) {
    const leftSec = active ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0
    scoreEl.textContent = `得分 ${score} · HP ${Math.max(0, hp)} · ${leftSec}s`
  }

  function clearBalls() {
    for (const ball of balls) {
      layer.removeChild(ball.gfx)
      ball.gfx.destroy()
    }
    balls.length = 0
  }

  function finishAlive(kind: 'timeup' | 'stop') {
    if (!active && kind === 'stop') return
    const finalScore = score
    active = false
    dying = false
    attackActiveFrom = 0
    attackActiveUntil = 0
    endsAt = 0
    clearBalls()
    layer.visible = false
    hud.classList.remove('is-on')
    options.onActiveChange?.(false)
    if (kind === 'timeup') options.onTimeUp?.(finalScore)
  }

  function finishDead() {
    if (dying || !active) return
    dying = true
    const finalScore = score
    active = false
    attackActiveFrom = 0
    attackActiveUntil = 0
    endsAt = 0
    clearBalls()
    layer.visible = false
    hud.classList.remove('is-on')
    options.onActiveChange?.(false)
    const dieMs = Math.max(800, options.playDie())
    window.setTimeout(() => {
      dying = false
      options.onDead?.(finalScore)
    }, dieMs)
  }

  function applyBallDamage() {
    hp = Math.max(0, hp - config.ballDamage)
    renderHud()
    if (hp <= 0) {
      finishDead()
      return
    }
    options.playHurt?.()
  }

  function spawnBall() {
    const size = options.getViewSize()
    const center = options.getHitCenter()
    const faceRight = options.getFacing() >= 0
    const margin = 18
    const x = faceRight ? size + margin : -margin
    const y = center.y + (Math.random() - 0.5) * size * 0.5

    const dx = center.x - x
    const dy = center.y - y
    const dist = Math.hypot(dx, dy) || 1
    const speed = config.ballSpeed * (0.85 + Math.random() * 0.35)
    const r = 10 + Math.random() * 4

    const gfx = new Graphics()
    gfx.beginFill(0xff6b6b)
    gfx.lineStyle(2, 0xffffff, 0.85)
    gfx.drawCircle(0, 0, r)
    gfx.endFill()
    gfx.beginFill(0xffffff, 0.45)
    gfx.drawCircle(-r * 0.28, -r * 0.28, r * 0.28)
    gfx.endFill()
    gfx.x = x
    gfx.y = y
    layer.addChild(gfx)

    balls.push({ gfx, x, y, vx: (dx / dist) * speed, vy: (dy / dist) * speed, r })
  }

  function tryHitBalls() {
    if (!active || dying) return
    const center = options.getHitCenter()
    const face = options.getFacing() >= 0 ? 1 : -1
    const { range, halfHeight, minDist } = config.skill
    let gained = 0
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i]
      const dx = ball.x - center.x
      const dy = ball.y - center.y
      if (dx * face < minDist) continue
      if (Math.abs(dx) > range + ball.r) continue
      if (Math.abs(dy) > halfHeight + ball.r) continue
      layer.removeChild(ball.gfx)
      ball.gfx.destroy()
      balls.splice(i, 1)
      gained += 1
    }
    if (gained > 0) {
      score += gained
      renderHud()
    }
  }

  function updateBalls(dt: number) {
    if (!active || dying) return
    const center = options.getHitCenter()
    const size = options.getViewSize()

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i]
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      ball.gfx.x = ball.x
      ball.gfx.y = ball.y

      const dist = Math.hypot(ball.x - center.x, ball.y - center.y)
      if (dist <= config.bodyHitReach + ball.r) {
        layer.removeChild(ball.gfx)
        ball.gfx.destroy()
        balls.splice(i, 1)
        applyBallDamage()
        if (!active || dying) return
        continue
      }

      if (ball.x < -40 || ball.y < -40 || ball.x > size + 40 || ball.y > size + 40) {
        layer.removeChild(ball.gfx)
        ball.gfx.destroy()
        balls.splice(i, 1)
      }
    }
  }

  return {
    isActive: () => active || dying,
    getDesiredViewSize(contentSize: number) {
      return Math.max(contentSize, GAME_VIEW_MIN)
    },
    start() {
      if (active || dying) return
      config = options.getConfig()
      active = true
      dying = false
      score = 0
      hp = config.maxHp
      const now = performance.now()
      nextSpawnAt = now + 400
      attackActiveFrom = 0
      attackActiveUntil = 0
      attackReadyAt = 0
      lastTickAt = now
      endsAt = now + config.durationMs
      clearBalls()
      options.app.stage.addChild(layer)
      layer.visible = true
      hud.classList.add('is-on')
      renderHud(now)
      options.onActiveChange?.(true)
    },
    stop() {
      if (dying) return
      finishAlive('stop')
    },
    tick(now: number) {
      if (dying) return
      if (!active) return
      if (now >= endsAt) {
        finishAlive('timeup')
        return
      }
      const dt = Math.min(32, Math.max(0, now - (lastTickAt || now))) / 16.67
      lastTickAt = now
      if (now >= nextSpawnAt) {
        spawnBall()
        nextSpawnAt = now + config.spawnIntervalMs * (0.75 + Math.random() * 0.5)
      }
      updateBalls(dt)
      if (active && now >= attackActiveFrom && now < attackActiveUntil) {
        tryHitBalls()
      }
      if (active) renderHud(now)
    },
    handleAttack() {
      if (!active || dying) return false
      const now = performance.now()
      if (now < attackReadyAt) return true
      options.playAttack(config.skill.animation)
      const startDelay = config.skill.activeStartMs
      attackActiveFrom = now + startDelay
      attackActiveUntil = attackActiveFrom + config.skill.activeMs
      attackReadyAt = now + config.skill.cooldownMs
      // 仅当命中帧从 0 开始时立刻判定；否则等 tick 进入下劈窗口
      if (startDelay <= 0) tryHitBalls()
      return true
    },
  }
}
