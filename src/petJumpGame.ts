import { Application, Container, Graphics } from 'pixi.js'
import type { ResolvedJumpRunConfig } from './petSkillDefaults'
import { canStartJump, rectsOverlap, stepJumpY } from './petJumpPhysics'

export type JumpRunGameOptions = {
  app: Application
  root: HTMLElement
  getHitCenter: () => { x: number; y: number }
  getFootY: () => number
  getViewSize: () => number
  getViewHeight: () => number
  /** 1 朝右，-1 朝左；障碍只从正面滚来 */
  getFacing: () => number
  getConfig: () => ResolvedJumpRunConfig
  /** 宠物竖直偏移（画布 y，负值抬起） */
  onJumpOffset?: (offsetY: number) => void
  playHurt?: () => number
  onActiveChange?: (active: boolean) => void
  onCrash?: (score: number) => void
}

type Obstacle = {
  gfx: Graphics
  x: number
  y: number
  w: number
  h: number
}

const GAME_VIEW_WIDTH_MIN = 720

export type JumpRunGame = {
  isActive: () => boolean
  start: () => void
  stop: () => void
  tick: (now: number) => void
  handleJump: () => boolean
  getDesiredView: (contentSize: number) => { width: number; height: number }
  getJumpOffsetY: () => number
}

function drawObstacle(gfx: Graphics, w: number, h: number, kind: 0 | 1) {
  gfx.clear()
  if (kind === 0) {
    gfx.beginFill(0x2f6b3a, 0.95)
    gfx.lineStyle(2, 0xffffff, 0.55)
    gfx.drawRoundedRect(-w / 2, -h, w, h, 4)
    gfx.endFill()
    gfx.beginFill(0x4f9a52, 0.9)
    gfx.drawCircle(-w * 0.15, -h * 0.72, w * 0.28)
    gfx.drawCircle(w * 0.18, -h * 0.55, w * 0.22)
    gfx.endFill()
  } else {
    gfx.beginFill(0xc4a35a, 0.95)
    gfx.lineStyle(2, 0xffffff, 0.45)
    gfx.drawRoundedRect(-w / 2, -h * 0.85, w, h * 0.85, 6)
    gfx.endFill()
    gfx.beginFill(0xa8883f, 0.9)
    gfx.drawEllipse(0, -h * 0.85, w * 0.42, h * 0.18)
    gfx.endFill()
  }
}

function drawGround(gfx: Graphics, width: number, groundY: number) {
  gfx.clear()
  gfx.lineStyle(3, 0xffffff, 0.35)
  gfx.moveTo(0, groundY)
  gfx.lineTo(width, groundY)
  gfx.lineStyle(2, 0xffffff, 0.18)
  for (let x = 0; x < width; x += 36) {
    gfx.moveTo(x, groundY + 10)
    gfx.lineTo(x + 18, groundY + 10)
  }
}

export function createJumpRunGame(options: JumpRunGameOptions): JumpRunGame {
  let active = false
  let ending = false
  let score = 0
  let lastTickAt = 0
  let nextSpawnAt = 0
  let jumpY = 0
  let jumpVy = 0
  let config = options.getConfig()
  let speed = config.scrollSpeed
  const obstacles: Obstacle[] = []

  const layer = new Container()
  layer.visible = false
  options.app.stage.addChild(layer)

  const groundGfx = new Graphics()
  layer.addChild(groundGfx)

  const hud = document.createElement('div')
  hud.className = 'pet-ball-hud pet-jump-hud'
  const scoreEl = document.createElement('strong')
  scoreEl.className = 'pet-ball-score'
  const tipEl = document.createElement('span')
  tipEl.className = 'pet-ball-tip'
  tipEl.textContent = '空格 / 点击 跳跃'
  hud.append(scoreEl, tipEl)
  options.root.appendChild(hud)

  function renderHud() {
    scoreEl.textContent = `得分 ${Math.floor(score)}`
  }

  function clearObstacles() {
    for (const ob of obstacles) {
      layer.removeChild(ob.gfx)
      ob.gfx.destroy()
    }
    obstacles.length = 0
  }

  function setJumpOffset(next: number) {
    jumpY = next
    options.onJumpOffset?.(jumpY)
  }

  function finishCrash() {
    if (ending || !active) return
    ending = true
    const finalScore = Math.floor(score)
    active = false
    window.removeEventListener('keydown', onKeyDown)
    clearObstacles()
    layer.visible = false
    hud.classList.remove('is-on')
    setJumpOffset(0)
    options.onActiveChange?.(false)
    options.playHurt?.()
    window.setTimeout(() => {
      ending = false
      options.onCrash?.(finalScore)
    }, 450)
  }

  function finishStop() {
    if (!active && !ending) return
    active = false
    ending = false
    window.removeEventListener('keydown', onKeyDown)
    clearObstacles()
    layer.visible = false
    hud.classList.remove('is-on')
    setJumpOffset(0)
    options.onActiveChange?.(false)
  }

  function spawnObstacle() {
    const face = options.getFacing() >= 0 ? 1 : -1
    const width = options.getViewSize()
    const groundY = options.getFootY()
    const kind = (Math.random() > 0.45 ? 0 : 1) as 0 | 1
    const w = kind === 0 ? 28 + Math.random() * 10 : 40 + Math.random() * 14
    const h = kind === 0 ? 42 + Math.random() * 16 : 30 + Math.random() * 10
    const gfx = new Graphics()
    drawObstacle(gfx, w, h, kind)
    const x = face > 0 ? width + w : -w
    const y = groundY
    gfx.x = x
    gfx.y = y
    layer.addChild(gfx)
    obstacles.push({ gfx, x, y, w, h })
  }

  function petHitRect() {
    const center = options.getHitCenter()
    const groundY = options.getFootY()
    const pad = config.bodyPad
    const bodyW = Math.max(28, contentBodyW())
    const bodyH = Math.max(36, contentBodyH())
    // jumpY 为负时抬起，脚底上移
    const foot = groundY + jumpY
    return {
      x: center.x - bodyW / 2 + pad,
      y: foot - bodyH + pad,
      w: bodyW - pad * 2,
      h: bodyH - pad * 2,
    }
  }

  function contentBodyW() {
    return Math.max(32, Math.round(options.getViewHeight() * 0.12))
  }

  function contentBodyH() {
    return Math.max(40, Math.round(options.getViewHeight() * 0.22))
  }

  function updateObstacles(dtSec: number) {
    const face = options.getFacing() >= 0 ? 1 : -1
    const width = options.getViewSize()
    const pet = petHitRect()

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i]
      ob.x -= face * speed * dtSec
      ob.gfx.x = ob.x
      ob.gfx.y = ob.y

      const hit = {
        x: ob.x - ob.w / 2 + 6,
        y: ob.y - ob.h + 4,
        w: ob.w - 12,
        h: ob.h - 8,
      }
      if (rectsOverlap(pet, hit)) {
        finishCrash()
        return
      }

      const offscreen = face > 0 ? ob.x < -ob.w - 20 : ob.x > width + ob.w + 20
      if (offscreen) {
        layer.removeChild(ob.gfx)
        ob.gfx.destroy()
        obstacles.splice(i, 1)
      }
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!active || ending) return
    if (event.code !== 'Space' && event.key !== ' ') return
    event.preventDefault()
    handleJump()
  }

  function handleJump() {
    if (!active || ending) return false
    if (!canStartJump(jumpY, jumpVy)) return false
    jumpVy = config.jumpVelocity
    setJumpOffset(jumpY)
    return true
  }

  return {
    isActive: () => active || ending,
    getJumpOffsetY: () => jumpY,
    getDesiredView(contentSize: number) {
      const height = Math.round(Math.max(contentSize * 1.35, contentSize + 80))
      return {
        width: Math.max(contentSize, GAME_VIEW_WIDTH_MIN),
        height,
      }
    },
    start() {
      if (active || ending) return
      config = options.getConfig()
      active = true
      ending = false
      score = 0
      speed = config.scrollSpeed
      jumpY = 0
      jumpVy = 0
      const now = performance.now()
      lastTickAt = now
      nextSpawnAt = now + 500
      clearObstacles()
      options.app.stage.addChild(layer)
      layer.visible = true
      hud.classList.add('is-on')
      renderHud()
      drawGround(groundGfx, options.getViewSize(), options.getFootY())
      setJumpOffset(0)
      options.onActiveChange?.(true)
      window.addEventListener('keydown', onKeyDown)
    },
    stop() {
      if (ending) {
        window.removeEventListener('keydown', onKeyDown)
        return
      }
      finishStop()
    },
    tick(now: number) {
      if (ending) return
      if (!active) return
      const dtSec = Math.min(0.032, Math.max(0, now - (lastTickAt || now)) / 1000)
      lastTickAt = now

      speed = Math.min(560, config.scrollSpeed + score * 0.8)
      score += speed * dtSec * 0.045

      if (jumpY < 0 || jumpVy !== 0) {
        const next = stepJumpY(jumpY, jumpVy, config.gravity, dtSec)
        jumpVy = next.vy
        setJumpOffset(next.y)
      }

      if (now >= nextSpawnAt) {
        spawnObstacle()
        const span = config.spawnMaxMs - config.spawnMinMs
        nextSpawnAt = now + config.spawnMinMs + Math.random() * Math.max(0, span)
        nextSpawnAt -= Math.min(350, score * 0.4)
      }

      drawGround(groundGfx, options.getViewSize(), options.getFootY())
      updateObstacles(dtSec)
      if (active) renderHud()
    },
    handleJump,
  }
}
