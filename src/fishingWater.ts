// Decorative pond simulation. All positions are normalized to a 1000 x 650 world.
const TAU = Math.PI * 2

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rotation = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU)
  ctx.fillStyle = color
  ctx.fill()
}

function lily(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, time: number) {
  ctx.save()
  ctx.translate(x, y + Math.sin(time * .6 + x) * 2)
  ctx.rotate(angle + Math.sin(time * .3 + y) * .025)
  ellipse(ctx, 3, 8, size * 1.1, size * .8, '#125f6155')
  ctx.scale(1, .78)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, size, .18, TAU - .18)
  ctx.closePath()
  const leaf = ctx.createLinearGradient(-size, -size, size, size)
  leaf.addColorStop(0, '#b5d780')
  leaf.addColorStop(.45, '#75aa68')
  leaf.addColorStop(1, '#337961')
  ctx.fillStyle = leaf
  ctx.fill()
  ctx.strokeStyle = '#d5e7a355'
  ctx.lineWidth = .8
  for (let i = 1; i < 8; i++) {
    const a = i * TAU / 8
    ctx.beginPath()
    ctx.moveTo(-2, 0)
    ctx.quadraticCurveTo(Math.cos(a + .2) * size * .5, Math.sin(a) * size * .5, Math.cos(a) * size * .88, Math.sin(a) * size * .88)
    ctx.stroke()
  }
  ctx.restore()
}

function fish(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, heading: number, phase: number, opacity: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.scale(size, size)
  ctx.globalAlpha = opacity
  const tail = Math.sin(phase) * 5
  ctx.fillStyle = '#124f59'
  ctx.beginPath()
  ctx.moveTo(23, 0)
  ctx.bezierCurveTo(16, -9, -4, -10, -18, tail)
  ctx.bezierCurveTo(-29, tail - 10, -30, tail - 8, -27, tail)
  ctx.lineTo(-30, tail + 8)
  ctx.quadraticCurveTo(-24, tail + 8, -18, tail)
  ctx.bezierCurveTo(-3, 10, 16, 9, 23, 0)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(5, -4)
  ctx.lineTo(-7, -14)
  ctx.lineTo(-5, 0)
  ctx.moveTo(5, 4)
  ctx.lineTo(-7, 14)
  ctx.lineTo(-5, 0)
  ctx.fill()
  ctx.strokeStyle = '#b7dfc0'
  ctx.globalAlpha *= .45
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(16, -2)
  ctx.quadraticCurveTo(0, -5, -14, tail)
  ctx.stroke()
  ctx.restore()
}

export function drawFishingWater(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.save()
  ctx.scale(width / 1000, height / 650)
  const water = ctx.createLinearGradient(0, 0, 850, 650)
  water.addColorStop(0, '#9ccfbd')
  water.addColorStop(.28, '#6cbdb6')
  water.addColorStop(.6, '#398f99')
  water.addColorStop(1, '#246c80')
  ctx.fillStyle = water
  ctx.fillRect(0, 0, 1000, 650)

  // Soft, connected light ribbons suggest refraction beneath the surface.
  for (let row = 0; row < 15; row++) {
    ctx.beginPath()
    for (let x = -40; x <= 1040; x += 12) {
      const y = row * 52 + Math.sin(x * .014 + time * .19 + row) * 13 + Math.sin(x * .031 - time * .12) * 5
      if (x === -40) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = row % 3 === 0 ? '#cdf6d510' : '#d5ffff0b'
    ctx.lineWidth = row % 3 === 0 ? 5 : 1.5
    ctx.stroke()
  }

  // Two loose schools follow continuous curved routes with independent tail beats.
  for (let school = 0; school < 2; school++) {
    for (let i = 0; i < 6; i++) {
      const a = time * (school ? -.045 : .035) + school * 2.7
      const x = 510 + Math.cos(a) * 255 + (i % 3 - 1) * 45 + Math.sin(i * 13) * 18
      const y = 325 + Math.sin(a * 1.4) * 145 + Math.floor(i / 3) * 38 + Math.sin(time * .4 + i) * 14
      const heading = Math.atan2(Math.cos(a * 1.4) * 203, -Math.sin(a) * 255) + (school ? Math.PI : 0)
      fish(ctx, x, y, .42 + i * .06, heading, time * 3.4 + i * 1.8, .22 + (i % 3) * .06)
    }
  }
  fish(ctx, 330 + Math.sin(time * .075) * 130, 300 + Math.cos(time * .06) * 105, 1.15, Math.atan2(-6.3 * Math.sin(time * .06), 9.75 * Math.cos(time * .075)), time * 2, .32)

  // Fine surface marks and expanding rings sit above the submerged silhouettes.
  ctx.lineCap = 'round'
  for (let i = 0; i < 46; i++) {
    const x = ((i * 137.3) % 940) + 30
    const y = ((i * 79.7) % 580) + 35 + Math.sin(time * .5 + i) * 3
    ctx.strokeStyle = `rgba(216,247,236,${.06 + (Math.sin(time * .7 + i) + 1) * .07})`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 7, y + 2, x + 12 + i % 16, y - 1)
    ctx.stroke()
  }
  for (let i = 0; i < 6; i++) {
    const life = (time * .15 + i * .173) % 1
    const x = 130 + (i * 193) % 790
    const y = 110 + (i * 127) % 450
    ctx.strokeStyle = `rgba(215,245,231,${Math.sin(life * Math.PI) * .28})`
    ctx.lineWidth = 1
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath()
      ctx.ellipse(x, y, 10 + life * 62 + ring * 9, 4 + life * 22 + ring * 3, -.1, 0, TAU)
      ctx.stroke()
    }
  }

  // Irregular stones anchor the scene at the edges, keeping casting space clear.
  for (const [x, y, size, angle] of [[-5, 50, 62, .3], [40, 4, 45, -.2], [93, -8, 36, .2], [1010, 590, 69, -.4], [959, 652, 50, .2]]) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ellipse(ctx, 8, 14, size * 1.1, size * .8, '#184e5966')
    const stone = ctx.createLinearGradient(-size, -size, size, size)
    stone.addColorStop(0, '#d2ded4')
    stone.addColorStop(.55, '#9caea5')
    stone.addColorStop(1, '#657f7c')
    ctx.beginPath()
    ctx.moveTo(-size, -size * .25)
    ctx.bezierCurveTo(-size * .85, -size, size * .4, -size * .8, size * .85, -size * .2)
    ctx.bezierCurveTo(size * 1.1, size * .5, size * .1, size * .8, -size * .7, size * .5)
    ctx.closePath()
    ctx.fillStyle = stone
    ctx.fill()
    ctx.restore()
  }
  for (let i = 0; i < 22; i++) {
    const right = i > 10
    const x = right ? 1000 - (i % 11) * 9 : (i % 11) * 8
    const y = right ? 660 : -5
    ctx.strokeStyle = ['#315f56', '#477c5d', '#7eaa6d'][i % 3]
    ctx.lineWidth = 2 + i % 3
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + (right ? -20 : 20), y + (right ? -40 : 40), x + Math.sin(i * 3) * 45 + Math.sin(time * .45) * 3, y + (right ? -1 : 1) * (45 + i % 7 * 9))
    ctx.stroke()
  }
  for (const [x, y, size, angle] of [[875, 90, 36, -.5], [925, 125, 27, .7], [920, 60, 22, 2], [107, 533, 31, .5], [65, 567, 23, -1], [141, 574, 20, 2]]) {
    lily(ctx, x, y, size, angle, time)
  }
  // One small water flower, kept away from the float's central play area.
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8
    ellipse(ctx, 878 + Math.cos(a) * 7, 84 + Math.sin(a) * 5, 9, 4, i % 2 ? '#f6d6de' : '#fff3ef', a)
  }
  ellipse(ctx, 878, 84, 4, 3, '#e9b758')
  ctx.restore()
}

export function createFishingWater(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  let active = false
  let frame = 0
  let last = 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const render = (now: number) => {
    if (!active || !ctx) return
    if (!document.hidden && now - last >= 33) {
      const { width, height } = canvas.getBoundingClientRect()
      if (width > 0 && height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.round(width * dpr)
        const h = Math.round(height * dpr)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        drawFishingWater(ctx, w, h, reduced.matches ? 0 : now / 1000)
      }
      last = now
    }
    if (!reduced.matches) frame = requestAnimationFrame(render)
  }
  const redraw = () => {
    cancelAnimationFrame(frame)
    last = 0
    if (active) frame = requestAnimationFrame(render)
  }
  const observer = new ResizeObserver(redraw)
  observer.observe(canvas)
  reduced.addEventListener('change', redraw)
  return {
    setActive(value: boolean) { active = value; redraw() },
    dispose() {
      active = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      reduced.removeEventListener('change', redraw)
    },
  }
}
