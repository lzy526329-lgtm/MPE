import type { Weather } from '../electron/farm/farmTypes'

type PollenDot = {
  x: number
  y: number
  r: number
  s: number
  a: number
}

type RainDrop = {
  x: number
  y: number
  len: number
  s: number
  a: number
}

type LightningPulse = {
  /** 相对 burst 起点的毫秒 */
  at: number
  peak: number
  duration: number
}

type LightningBurst = {
  startedAt: number
  pulses: LightningPulse[]
}

export type FarmPollenHandle = {
  /** 重新挂到新的 stage（paint 会重建 DOM） */
  attach: (stage: HTMLElement) => void
  setActive: (active: boolean) => void
  setWeather: (weather: Weather) => void
  destroy: () => void
}

function scheduleNextLightning(from = performance.now()) {
  return from + 7000 + Math.random() * 11000
}

function createLightningBurst(now: number): LightningBurst {
  const pulseCount = 2 + Math.floor(Math.random() * 2) // 2 或 3
  const pulses: LightningPulse[] = []
  let cursor = 0
  for (let i = 0; i < pulseCount; i++) {
    const isMain = i === Math.floor(pulseCount / 2) || (pulseCount === 2 && i === 1)
    pulses.push({
      at: cursor,
      peak: isMain ? 0.72 + Math.random() * 0.18 : 0.35 + Math.random() * 0.25,
      duration: 38 + Math.random() * 36,
    })
    cursor += 70 + Math.random() * 55
  }
  return { startedAt: now, pulses }
}

function lightningAlpha(burst: LightningBurst, now: number): number {
  const t = now - burst.startedAt
  let alpha = 0
  for (const pulse of burst.pulses) {
    if (t < pulse.at || t > pulse.at + pulse.duration) continue
    const p = (t - pulse.at) / pulse.duration
    // 快亮慢收一点
    const envelope = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8
    alpha = Math.max(alpha, pulse.peak * Math.max(0, envelope))
  }
  return alpha
}

function lightningDone(burst: LightningBurst, now: number): boolean {
  const last = burst.pulses[burst.pulses.length - 1]
  if (!last) return true
  return now > burst.startedAt + last.at + last.duration + 40
}

/**
 * 农场天气氛围层：晴天暖黄光点，雨天灰幕 + 细雨 + 偶发闪电闪屏。
 * Canvas 叠在 .farm-stage 上，不拦截点击。
 */
export function createFarmPollen(): FarmPollenHandle {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let stage: HTMLElement | null = null
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let dots: PollenDot[] = []
  let drops: RainDrop[] = []
  let raf = 0
  let active = false
  let weather: Weather = 'clear'
  let width = 0
  let height = 0
  let resizeObserver: ResizeObserver | null = null
  let nextLightningAt = scheduleNextLightning()
  let lightning: LightningBurst | null = null

  function spawnDot(): PollenDot {
    return {
      x: Math.random() * Math.max(width, 1),
      y: Math.random() * Math.max(height, 1),
      r: 1.1 + Math.random() * 2.2,
      s: 0.22 + Math.random() * 0.65,
      a: 0.2 + Math.random() * 0.38,
    }
  }

  function spawnDrop(): RainDrop {
    return {
      x: Math.random() * Math.max(width, 1),
      y: Math.random() * Math.max(height, 1),
      len: 6 + Math.random() * 10,
      s: 4.2 + Math.random() * 5.5,
      a: 0.18 + Math.random() * 0.28,
    }
  }

  function resetLightning() {
    lightning = null
    // 刚进雨天先等几秒再闪一次，方便马上能看到
    nextLightningAt = performance.now() + 2000 + Math.random() * 3500
  }

  function ensureCanvas(host: HTMLElement) {
    if (canvas?.isConnected && canvas.parentElement === host) return
    canvas?.remove()
    canvas = document.createElement('canvas')
    canvas.className = 'farm-pollen'
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)
    ctx = canvas.getContext('2d')
  }

  function syncParticleCounts() {
    const area = width * height
    const pollenCount = Math.min(40, Math.max(22, Math.round(area / 18000)))
    const rainCount = Math.min(90, Math.max(48, Math.round(area / 9000)))
    if (dots.length !== pollenCount) {
      dots = Array.from({ length: pollenCount }, () => spawnDot())
    }
    if (drops.length !== rainCount) {
      drops = Array.from({ length: rainCount }, () => spawnDrop())
    }
  }

  function resize() {
    if (!stage || !canvas || !ctx) return
    const rect = stage.getBoundingClientRect()
    width = Math.max(1, Math.round(rect.width))
    height = Math.max(1, Math.round(rect.height))
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    syncParticleCounts()
    if (active && reduceMotion) drawStatic()
  }

  function drawOvercast() {
    if (!ctx) return
    const veil = ctx.createLinearGradient(0, 0, 0, height)
    veil.addColorStop(0, 'rgba(72, 84, 96, 0.38)')
    veil.addColorStop(0.45, 'rgba(58, 68, 78, 0.28)')
    veil.addColorStop(1, 'rgba(48, 56, 64, 0.22)')
    ctx.fillStyle = veil
    ctx.fillRect(0, 0, width, height)
  }

  function drawLightningFlash(alpha: number) {
    if (!ctx || alpha <= 0) return
    ctx.fillStyle = `rgba(255, 252, 245, ${alpha})`
    ctx.fillRect(0, 0, width, height)
  }

  function drawStatic() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (weather === 'rain') drawOvercast()
  }

  function drawClear() {
    if (!ctx) return
    for (const dot of dots) {
      dot.y -= dot.s
      dot.x += Math.sin(dot.y / 40) * 0.35
      if (dot.y < -8) {
        dot.y = height + 8
        dot.x = Math.random() * width
      }
      if (dot.x < -8) dot.x = width + 8
      if (dot.x > width + 8) dot.x = -8
      ctx.beginPath()
      ctx.fillStyle = `rgba(255, 236, 170, ${dot.a})`
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function updateLightning(now: number): number {
    if (!lightning && now >= nextLightningAt) {
      lightning = createLightningBurst(now)
    }
    if (!lightning) return 0
    const alpha = lightningAlpha(lightning, now)
    if (lightningDone(lightning, now)) {
      lightning = null
      nextLightningAt = scheduleNextLightning(now)
    }
    return alpha
  }

  function drawRain(now: number) {
    if (!ctx) return
    drawOvercast()
    ctx.lineCap = 'round'
    for (const drop of drops) {
      drop.y += drop.s
      drop.x += drop.s * 0.12
      if (drop.y > height + drop.len) {
        drop.y = -drop.len
        drop.x = Math.random() * width
      }
      if (drop.x > width + 4) drop.x = -4
      ctx.beginPath()
      ctx.strokeStyle = `rgba(210, 222, 232, ${drop.a})`
      ctx.lineWidth = 1
      ctx.moveTo(drop.x, drop.y)
      ctx.lineTo(drop.x + drop.len * 0.18, drop.y + drop.len)
      ctx.stroke()
    }
    drawLightningFlash(updateLightning(now))
  }

  function tick() {
    if (!active || !ctx || !canvas) {
      raf = 0
      return
    }
    if (reduceMotion) {
      drawStatic()
      raf = 0
      return
    }
    ctx.clearRect(0, 0, width, height)
    if (weather === 'rain') drawRain(performance.now())
    else drawClear()
    raf = requestAnimationFrame(tick)
  }

  function startLoop() {
    if (!active) return
    if (reduceMotion) {
      drawStatic()
      return
    }
    if (raf) return
    raf = requestAnimationFrame(tick)
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    lightning = null
    ctx?.clearRect(0, 0, width, height)
  }

  function attach(host: HTMLElement) {
    stage = host
    ensureCanvas(host)
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(host)
    resize()
    if (active) startLoop()
  }

  function setActive(next: boolean) {
    active = next
    if (active) {
      if (stage) {
        ensureCanvas(stage)
        resize()
      }
      if (weather === 'rain') resetLightning()
      startLoop()
    } else {
      stopLoop()
    }
  }

  function setWeather(next: Weather) {
    const changed = weather !== next
    weather = next
    if (changed) {
      if (next === 'rain') resetLightning()
      else lightning = null
    }
    if (active) {
      if (reduceMotion) drawStatic()
      else startLoop()
    }
  }

  function destroy() {
    setActive(false)
    resizeObserver?.disconnect()
    resizeObserver = null
    canvas?.remove()
    canvas = null
    ctx = null
    stage = null
    dots = []
    drops = []
    lightning = null
  }

  return { attach, setActive, setWeather, destroy }
}
