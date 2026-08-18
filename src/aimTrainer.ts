export type AimTrainerStatus = 'idle' | 'running' | 'paused' | 'ended'

export type AimTrainerDifficulty = 'easy' | 'normal' | 'hard'

export type AimTrainerStats = {
  score: number
  hits: number
  misses: number
  combo: number
  bestCombo: number
  accuracy: number
  remainingMs: number
  elapsedMs: number
  status: AimTrainerStatus
}

type Ball = {
  id: number
  x: number
  y: number
  radius: number
  born: number
  lifetime: number
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

type Floater = {
  x: number
  y: number
  text: string
  life: number
  maxLife: number
}

type DifficultyConfig = {
  radius: [number, number]
  lifetime: [number, number]
  spawnInterval: [number, number]
  maxBalls: number
}

const DIFFICULTY: Record<AimTrainerDifficulty, DifficultyConfig> = {
  easy: { radius: [28, 38], lifetime: [1800, 2400], spawnInterval: [380, 620], maxBalls: 3 },
  normal: { radius: [18, 26], lifetime: [1200, 1700], spawnInterval: [280, 460], maxBalls: 4 },
  hard: { radius: [12, 18], lifetime: [800, 1200], spawnInterval: [180, 320], maxBalls: 5 },
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

export class AimTrainer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly onStats: (stats: AimTrainerStats) => void
  private readonly observer: ResizeObserver

  private width = 0
  private height = 0
  private dpr = 1
  private raf = 0
  private nextId = 1
  private nextSpawnAt = 0
  private startedAt = 0
  private pausedAt = 0
  private accumulatedPause = 0
  private durationMs = 60_000
  private difficulty: AimTrainerDifficulty = 'normal'
  private status: AimTrainerStatus = 'idle'
  private score = 0
  private hits = 0
  private misses = 0
  private combo = 0
  private bestCombo = 0
  private balls: Ball[] = []
  private particles: Particle[] = []
  private floaters: Floater[] = []
  private pointer = { x: 0, y: 0, inside: false }
  private flash = 0
  private lastTimeEmit = 0

  constructor(canvas: HTMLCanvasElement, onStats: (stats: AimTrainerStats) => void) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建画布')

    this.canvas = canvas
    this.ctx = context
    this.onStats = onStats
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerenter', this.onPointerEnter)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.resize()
    this.emit()
    this.loop()
  }

  start(durationMs: number, difficulty: AimTrainerDifficulty) {
    this.durationMs = durationMs
    this.difficulty = difficulty
    this.resetState()
    this.status = 'running'
    this.startedAt = performance.now()
    this.nextSpawnAt = this.now() + 180
    this.spawnBall()
    this.emit()
  }

  pause() {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.pausedAt = performance.now()
    this.emit()
  }

  resume() {
    if (this.status !== 'paused') return
    this.accumulatedPause += performance.now() - this.pausedAt
    this.status = 'running'
    this.nextSpawnAt = this.now() + 200
    this.emit()
  }

  reset() {
    this.resetState()
    this.status = 'idle'
    this.emit()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerenter', this.onPointerEnter)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
  }

  getStatus() {
    return this.status
  }

  refreshLayout() {
    this.resize()
  }

  private resetState() {
    this.score = 0
    this.hits = 0
    this.misses = 0
    this.combo = 0
    this.bestCombo = 0
    this.balls = []
    this.particles = []
    this.floaters = []
    this.flash = 0
    this.lastTimeEmit = 0
    this.accumulatedPause = 0
    this.pausedAt = 0
    this.startedAt = 0
    this.nextSpawnAt = 0
  }

  private now() {
    const pausedExtra = this.status === 'paused' ? performance.now() - this.pausedAt : 0
    return performance.now() - this.accumulatedPause - pausedExtra
  }

  private elapsed() {
    if (this.status === 'idle') return 0
    return Math.max(0, this.now() - this.startedAt)
  }

  private remaining() {
    if (this.durationMs <= 0) return -1
    if (this.status === 'idle') return this.durationMs
    return Math.max(0, this.durationMs - this.elapsed())
  }

  private emit() {
    const total = this.hits + this.misses
    this.onStats({
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      combo: this.combo,
      bestCombo: this.bestCombo,
      accuracy: total === 0 ? 0 : Math.round((this.hits / total) * 100),
      remainingMs: this.remaining(),
      elapsedMs: this.elapsed(),
      status: this.status,
    })
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.dpr = Math.max(1, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = event.clientX - rect.left
    this.pointer.y = event.clientY - rect.top
    this.pointer.inside = true
  }

  private onPointerEnter = () => {
    this.pointer.inside = true
  }

  private onPointerLeave = () => {
    this.pointer.inside = false
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.status !== 'running') return
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const hit = this.hitBall(x, y)
    if (hit) {
      this.registerHit(hit)
    } else {
      this.registerMiss(x, y, false)
    }
  }

  private hitBall(x: number, y: number) {
    for (let index = this.balls.length - 1; index >= 0; index -= 1) {
      const ball = this.balls[index]
      const dx = x - ball.x
      const dy = y - ball.y
      if (dx * dx + dy * dy <= ball.radius * ball.radius) {
        this.balls.splice(index, 1)
        return ball
      }
    }
    return null
  }

  private registerHit(ball: Ball) {
    this.combo += 1
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    const gained = 100 + (this.combo - 1) * 15
    this.score += gained
    this.hits += 1
    this.flash = 1
    this.burst(ball.x, ball.y, ball.radius)
    this.floaters.push({
      x: ball.x,
      y: ball.y - ball.radius,
      text: `+${gained}`,
      life: 0,
      maxLife: 520,
    })
    this.emit()
  }

  private registerMiss(x: number, y: number, expired: boolean) {
    this.combo = 0
    this.misses += 1
    if (!expired) {
      this.floaters.push({
        x,
        y,
        text: '未命中',
        life: 0,
        maxLife: 420,
      })
    }
    this.emit()
  }

  private burst(x: number, y: number, radius: number) {
    const count = 10
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4
      const speed = randomBetween(90, 220)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: randomBetween(220, 380),
        size: Math.max(2, radius * 0.18),
      })
    }
  }

  private spawnBall() {
    const config = DIFFICULTY[this.difficulty]
    if (this.balls.length >= config.maxBalls) return

    const radius = randomBetween(config.radius[0], config.radius[1])
    const margin = radius + 24
    let x = randomBetween(margin, this.width - margin)
    let y = randomBetween(margin, this.height - margin)

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const overlapping = this.balls.some((ball) => {
        const dx = ball.x - x
        const dy = ball.y - y
        const min = ball.radius + radius + 18
        return dx * dx + dy * dy < min * min
      })
      if (!overlapping) break
      x = randomBetween(margin, this.width - margin)
      y = randomBetween(margin, this.height - margin)
    }

    this.balls.push({
      id: this.nextId++,
      x,
      y,
      radius,
      born: this.now(),
      lifetime: randomBetween(config.lifetime[0], config.lifetime[1]),
    })
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = 16.67
    if (this.status === 'running') this.update(dt)
    this.draw()
  }

  private update(dt: number) {
    const now = this.now()
    if (this.durationMs > 0 && this.remaining() <= 0) {
      this.status = 'ended'
      this.balls = []
      this.emit()
      return
    }

    const config = DIFFICULTY[this.difficulty]
    if (now >= this.nextSpawnAt) {
      this.spawnBall()
      this.nextSpawnAt = now + randomBetween(config.spawnInterval[0], config.spawnInterval[1])
    }

    this.balls = this.balls.filter((ball) => {
      if (now - ball.born < ball.lifetime) return true
      this.registerMiss(ball.x, ball.y, true)
      return false
    })

    this.particles = this.particles.filter((particle) => {
      particle.life += dt
      particle.x += (particle.vx * dt) / 1000
      particle.y += (particle.vy * dt) / 1000
      particle.vx *= 0.92
      particle.vy *= 0.92
      return particle.life < particle.maxLife
    })

    this.floaters = this.floaters.filter((floater) => {
      floater.life += dt
      return floater.life < floater.maxLife
    })

    this.flash = Math.max(0, this.flash - dt / 180)
    if (now - this.lastTimeEmit > 80) {
      this.lastTimeEmit = now
      this.emit()
    }
  }

  private draw() {
    const { ctx, width, height } = this
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#050505'
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'
    ctx.lineWidth = 1
    for (let x = 40; x < width; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 40; y < height; y += 40) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.restore()

    const now = this.now()
    for (const ball of this.balls) {
      const age = now - ball.born
      const appear = Math.min(1, age / 120)
      const remain = 1 - age / ball.lifetime
      const radius = ball.radius * (0.86 + appear * 0.14)
      ctx.beginPath()
      ctx.fillStyle = `rgba(255,255,255,${0.18 + remain * 0.22})`
      ctx.arc(ball.x, ball.y, radius + 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.fillStyle = '#fff'
      ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    for (const particle of this.particles) {
      const alpha = 1 - particle.life / particle.maxLife
      ctx.beginPath()
      ctx.fillStyle = `rgba(255,255,255,${alpha})`
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.font = '700 14px Inter, "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    for (const floater of this.floaters) {
      const progress = floater.life / floater.maxLife
      ctx.fillStyle = floater.text.startsWith('+')
        ? `rgba(255,255,255,${1 - progress})`
        : `rgba(255,120,120,${1 - progress})`
      ctx.fillText(floater.text, floater.x, floater.y - progress * 28)
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.08})`
      ctx.fillRect(0, 0, width, height)
    }

    if (this.pointer.inside && this.status === 'running') {
      this.drawCrosshair()
    }
  }

  private drawCrosshair() {
    const { ctx, pointer } = this
    const size = 12
    ctx.save()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(pointer.x - size, pointer.y)
    ctx.lineTo(pointer.x - 4, pointer.y)
    ctx.moveTo(pointer.x + 4, pointer.y)
    ctx.lineTo(pointer.x + size, pointer.y)
    ctx.moveTo(pointer.x, pointer.y - size)
    ctx.lineTo(pointer.x, pointer.y - 4)
    ctx.moveTo(pointer.x, pointer.y + 4)
    ctx.lineTo(pointer.x, pointer.y + size)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(pointer.x, pointer.y, 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}
