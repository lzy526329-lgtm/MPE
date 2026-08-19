import * as THREE from 'three'

export type AimTrainerStatus = 'idle' | 'running' | 'paused' | 'ended'

export type AimTrainerDifficulty = 'easy' | 'normal' | 'hard'

export type AimTrainerMode = 'flick' | 'track'

export type AimGameId = 'cs2' | 'valorant' | 'apex' | 'overwatch'

export type AimLookSettings = {
  game: AimGameId
  sensitivity: number
  dpi: number
}

export type AimGamePreset = {
  id: AimGameId
  label: string
  yaw: number
  hfov: number
  aspect: number
}

export const AIM_GAMES: AimGamePreset[] = [
  { id: 'cs2', label: 'CS2 / CSGO', yaw: 0.022, hfov: 90, aspect: 4 / 3 },
  { id: 'valorant', label: 'Valorant', yaw: 0.07, hfov: 103, aspect: 16 / 9 },
  { id: 'apex', label: 'Apex Legends', yaw: 0.022, hfov: 90, aspect: 4 / 3 },
  { id: 'overwatch', label: 'Overwatch 2', yaw: 0.0066, hfov: 103, aspect: 16 / 9 },
]

export const DEFAULT_LOOK: AimLookSettings = {
  game: 'cs2',
  sensitivity: 1,
  dpi: 800,
}

export const getAimGame = (id: AimGameId) => AIM_GAMES.find((game) => game.id === id) ?? AIM_GAMES[0]

export const cmPer360 = (settings: AimLookSettings) => {
  const yaw = getAimGame(settings.game).yaw
  if (settings.dpi <= 0 || settings.sensitivity <= 0 || yaw <= 0) return 0
  return (360 / (yaw * settings.sensitivity) / settings.dpi) * 2.54
}

export type AimTrainerStats = {
  mode: AimTrainerMode
  score: number
  hits: number
  misses: number
  combo: number
  bestCombo: number
  accuracy: number
  remainingMs: number
  elapsedMs: number
  status: AimTrainerStatus
  locked: boolean
}

type Ball = {
  id: number
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  radius: number
  born: number
  lifetime: number
  velocity: THREE.Vector3
  waypoint: THREE.Vector3
}

type Particle = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  velocity: THREE.Vector3
  size: number
  life: number
  maxLife: number
}

type Floater = {
  el: HTMLDivElement
  world: THREE.Vector3
  life: number
  maxLife: number
}

type DifficultyConfig = {
  radius: [number, number]
  lifetime: [number, number]
  spawnInterval: [number, number]
  maxBalls: number
  spread: [number, number]
  depth: [number, number]
  height: [number, number]
}

const DIFFICULTY: Record<AimTrainerDifficulty, DifficultyConfig> = {
  easy: {
    radius: [0.28, 0.38],
    lifetime: [1800, 2400],
    spawnInterval: [380, 620],
    maxBalls: 3,
    spread: [-2.2, 2.2],
    depth: [1.5, 4.5],
    height: [0.9, 2.3],
  },
  normal: {
    radius: [0.18, 0.26],
    lifetime: [1200, 1700],
    spawnInterval: [280, 460],
    maxBalls: 4,
    spread: [-3.1, 3.1],
    depth: [0.2, 5.8],
    height: [0.7, 2.6],
  },
  hard: {
    radius: [0.11, 0.18],
    lifetime: [800, 1200],
    spawnInterval: [180, 320],
    maxBalls: 5,
    spread: [-3.8, 3.8],
    depth: [-1.6, 6.2],
    height: [0.55, 2.85],
  },
}

type TrackConfig = {
  radius: number
  speed: number
  accel: number
}

const TRACK: Record<AimTrainerDifficulty, TrackConfig> = {
  easy: { radius: 0.34, speed: 1.7, accel: 4.2 },
  normal: { radius: 0.22, speed: 2.9, accel: 6.8 },
  hard: { radius: 0.14, speed: 4.4, accel: 10.5 },
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

const ROOM_COLOR = 0x07080c
const CAMERA_ORIGIN = new THREE.Vector3(0, 1.55, 8.2)
const DEG2RAD = Math.PI / 180

export class AimTrainer {
  private readonly canvas: HTMLCanvasElement
  private readonly onStats: (stats: AimTrainerStats) => void
  private readonly observer: ResizeObserver
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80)
  private readonly renderer: THREE.WebGLRenderer
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2()
  private readonly projectScratch = new THREE.Vector3()
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 32, 24)
  private readonly particleGeometry = new THREE.SphereGeometry(1, 8, 6)
  private readonly ambient = new THREE.AmbientLight(0xb8c4d8, 0.32)
  private readonly crosshair: HTMLDivElement
  private readonly floaterLayer: HTMLDivElement
  private readonly flashLayer: HTMLDivElement

  private width = 0
  private height = 0
  private raf = 0
  private lastFrame = 0
  private nextId = 1
  private nextSpawnAt = 0
  private startedAt = 0
  private pausedAt = 0
  private accumulatedPause = 0
  private durationMs = 60_000
  private difficulty: AimTrainerDifficulty = 'normal'
  private mode: AimTrainerMode = 'flick'
  private status: AimTrainerStatus = 'idle'
  private locked = false
  private lockMs = 0
  private onTargetMs = 0
  private scoreExact = 0
  private lastLockFloater = 0
  private score = 0
  private hits = 0
  private misses = 0
  private combo = 0
  private bestCombo = 0
  private balls: Ball[] = []
  private particles: Particle[] = []
  private floaters: Floater[] = []
  private flash = 0
  private lastTimeEmit = 0
  private lookYaw = 0
  private lookPitch = 0
  private lookSettings: AimLookSettings = { ...DEFAULT_LOOK }
  private yawScale = 0.022

  constructor(canvas: HTMLCanvasElement, onStats: (stats: AimTrainerStats) => void) {
    this.canvas = canvas
    this.onStats = onStats
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(ROOM_COLOR, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08

    this.crosshair = document.createElement('div')
    this.crosshair.className = 'trainer-crosshair is-fps'
    this.crosshair.hidden = true
    this.floaterLayer = document.createElement('div')
    this.floaterLayer.className = 'trainer-floater-layer'
    this.flashLayer = document.createElement('div')
    this.flashLayer.className = 'trainer-flash'
    canvas.parentElement?.append(this.floaterLayer, this.flashLayer, this.crosshair)

    this.buildRoom()
    this.setLookSettings(this.lookSettings)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.resize()
    this.emit()
    this.loop()
  }

  start(durationMs: number, difficulty: AimTrainerDifficulty, mode: AimTrainerMode = 'flick') {
    this.durationMs = durationMs
    this.difficulty = difficulty
    this.mode = mode
    this.resetState()
    this.status = 'running'
    this.startedAt = performance.now()
    this.nextSpawnAt = this.now() + 180
    if (this.mode === 'track') this.spawnTrackBall()
    else this.spawnBall()
    this.syncCrosshair()
    this.emit()
    this.requestLookLock()
  }

  pause() {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.pausedAt = performance.now()
    this.hideCrosshair()
    this.releaseLookLock()
    this.emit()
  }

  resume() {
    if (this.status !== 'paused') return
    this.accumulatedPause += performance.now() - this.pausedAt
    this.status = 'running'
    this.nextSpawnAt = this.now() + 200
    this.syncCrosshair()
    this.emit()
    this.requestLookLock()
  }

  reset() {
    this.resetState()
    this.status = 'idle'
    this.hideCrosshair()
    this.releaseLookLock()
    this.emit()
  }

  setLookSettings(settings: AimLookSettings) {
    this.lookSettings = {
      game: settings.game,
      sensitivity: Math.max(0.001, settings.sensitivity),
      dpi: Math.max(1, settings.dpi),
    }
    this.yawScale = getAimGame(this.lookSettings.game).yaw
    this.applyCameraFov()
  }

  setMode(mode: AimTrainerMode) {
    this.mode = mode
    this.reset()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.releaseLookLock()
    this.resetState()
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry?.dispose()
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material?.dispose()
      }
    })
    this.sphereGeometry.dispose()
    this.particleGeometry.dispose()
    this.renderer.dispose()
    this.crosshair.remove()
    this.floaterLayer.remove()
    this.flashLayer.remove()
  }

  getStatus() {
    return this.status
  }

  refreshLayout() {
    this.resize()
  }

  private buildRoom() {
    this.scene.fog = new THREE.Fog(ROOM_COLOR, 9, 26)
    this.scene.background = new THREE.Color(ROOM_COLOR)
    this.camera.rotation.order = 'YXZ'
    this.resetLook()

    this.scene.add(this.ambient)
    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(-4.5, 8, 6)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x7f93b8, 0.35)
    fill.position.set(5, 2.4, 3)
    this.scene.add(fill)
    const rim = new THREE.PointLight(0xffffff, 8, 18, 2)
    rim.position.set(0, 2.4, -6)
    this.scene.add(rim)

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x101218,
      roughness: 0.92,
      metalness: 0.08,
    })
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      roughness: 0.96,
      metalness: 0.04,
    })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), floorMat)
    floor.rotation.x = -Math.PI / 2
    this.scene.add(floor)

    const back = new THREE.Mesh(new THREE.PlaneGeometry(28, 12), wallMat)
    back.position.set(0, 6, -8.5)
    this.scene.add(back)

    const left = new THREE.Mesh(new THREE.PlaneGeometry(28, 12), wallMat)
    left.rotation.y = Math.PI / 2
    left.position.set(-10, 6, 0)
    this.scene.add(left)

    const right = left.clone()
    right.position.x = 10
    right.rotation.y = -Math.PI / 2
    this.scene.add(right)

    const grid = new THREE.GridHelper(24, 24, 0x2a3140, 0x161b24)
    grid.position.y = 0.01
    this.scene.add(grid)

    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035 }),
    )
    lane.rotation.x = -Math.PI / 2
    lane.position.set(0, 0.02, -0.4)
    this.scene.add(lane)
  }

  private resetState() {
    this.score = 0
    this.hits = 0
    this.misses = 0
    this.combo = 0
    this.bestCombo = 0
    this.locked = false
    this.lockMs = 0
    this.onTargetMs = 0
    this.scoreExact = 0
    this.lastLockFloater = 0
    this.crosshair.classList.remove('is-locked')
    for (const ball of this.balls) this.disposeBall(ball)
    this.balls = []
    for (const particle of this.particles) this.disposeParticle(particle)
    this.particles = []
    for (const floater of this.floaters) floater.el.remove()
    this.floaters = []
    this.flash = 0
    this.flashLayer.style.opacity = '0'
    this.lastTimeEmit = 0
    this.accumulatedPause = 0
    this.pausedAt = 0
    this.startedAt = 0
    this.nextSpawnAt = 0
    this.resetLook()
  }

  private resetLook() {
    this.lookYaw = 0
    this.lookPitch = 0.031
    this.syncCamera()
  }

  private syncCamera() {
    this.camera.position.copy(CAMERA_ORIGIN)
    this.camera.rotation.set(this.lookPitch, this.lookYaw, 0, 'YXZ')
  }

  private applyCameraFov() {
    const preset = getAimGame(this.lookSettings.game)
    const vertical = 2 * Math.atan(Math.tan((preset.hfov * DEG2RAD) / 2) / preset.aspect)
    this.camera.fov = THREE.MathUtils.radToDeg(vertical)
    this.camera.updateProjectionMatrix()
  }

  private requestLookLock() {
    const request = this.canvas.requestPointerLock.bind(this.canvas) as (
      options?: PointerLockOptions,
    ) => void
    try {
      request({ unadjustedMovement: true })
    } catch {
      this.canvas.requestPointerLock()
    }
  }

  private releaseLookLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  private onPointerLockChange = () => {
    if (this.status === 'running' && document.pointerLockElement !== this.canvas) {
      this.pause()
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.status !== 'running' || document.pointerLockElement !== this.canvas) return
    const scale = this.yawScale * this.lookSettings.sensitivity * DEG2RAD
    this.lookYaw -= event.movementX * scale
    this.lookPitch += event.movementY * scale
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch, -1.2, 1.2)
    this.syncCamera()
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
    const elapsed = this.elapsed()
    const accuracy =
      this.mode === 'track'
        ? elapsed === 0
          ? 0
          : Math.round((this.onTargetMs / elapsed) * 100)
        : total === 0
          ? 0
          : Math.round((this.hits / total) * 100)
    this.onStats({
      mode: this.mode,
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      combo: this.mode === 'track' ? Math.round(this.lockMs) : this.combo,
      bestCombo: this.mode === 'track' ? Math.round(this.bestCombo) : this.bestCombo,
      accuracy,
      remainingMs: this.remaining(),
      elapsedMs: elapsed,
      status: this.status,
      locked: this.locked,
    })
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    this.camera.aspect = this.width / this.height
    this.applyCameraFov()
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(this.width, this.height, false)
  }

  private aimFromCenter() {
    this.pointerNdc.set(0, 0)
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.status !== 'running' || this.mode === 'track') return
    event.preventDefault()
    this.aimFromCenter()
    const hit = this.hitBall()
    if (hit) {
      this.registerHit(hit)
    } else {
      this.registerMiss(this.pointerWorld(6), false)
    }
  }

  private hideCrosshair() {
    this.crosshair.hidden = true
    this.crosshair.classList.remove('is-locked')
  }

  private syncCrosshair() {
    if (this.status !== 'running') {
      this.hideCrosshair()
      return
    }
    this.crosshair.hidden = false
    this.crosshair.classList.toggle('is-locked', this.locked)
  }

  private hitBall() {
    this.aimFromCenter()
    const meshes = this.balls.map((ball) => ball.mesh)
    const hits = this.raycaster.intersectObjects(meshes, false)
    if (hits.length === 0) return null
    const mesh = hits[0].object as THREE.Mesh
    const index = this.balls.findIndex((ball) => ball.mesh === mesh)
    if (index < 0) return null
    const [ball] = this.balls.splice(index, 1)
    return ball
  }

  private pointerWorld(distance: number) {
    this.aimFromCenter()
    return this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, distance)
  }

  private registerHit(ball: Ball) {
    this.combo += 1
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    const gained = 100 + (this.combo - 1) * 15
    this.score += gained
    this.hits += 1
    this.flash = 1
    this.burst(ball.mesh.position, ball.radius)
    this.addFloater(ball.mesh.position.clone().add(new THREE.Vector3(0, ball.radius + 0.12, 0)), `+${gained}`)
    this.disposeBall(ball)
    this.emit()
  }

  private registerMiss(world: THREE.Vector3, expired: boolean) {
    this.combo = 0
    this.misses += 1
    if (!expired) this.addFloater(world, '未命中', true)
    this.emit()
  }

  private addFloater(world: THREE.Vector3, text: string, miss = false) {
    const el = document.createElement('div')
    el.className = miss ? 'trainer-floater is-miss' : 'trainer-floater'
    el.textContent = text
    this.floaterLayer.append(el)
    this.floaters.push({
      el,
      world,
      life: 0,
      maxLife: miss ? 420 : 520,
    })
  }

  private burst(origin: THREE.Vector3, radius: number) {
    const count = 14
    for (let index = 0; index < count; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      })
      const mesh = new THREE.Mesh(this.particleGeometry, material)
      const size = Math.max(0.03, radius * 0.16)
      mesh.scale.setScalar(size)
      mesh.position.copy(origin)
      const direction = new THREE.Vector3(
        randomBetween(-1, 1),
        randomBetween(-0.2, 1),
        randomBetween(-1, 1),
      ).normalize()
      this.scene.add(mesh)
      this.particles.push({
        mesh,
        velocity: direction.multiplyScalar(randomBetween(1.6, 4.2)),
        size,
        life: 0,
        maxLife: randomBetween(220, 380),
      })
    }
  }

  private spawnBall() {
    const config = DIFFICULTY[this.difficulty]
    if (this.balls.length >= config.maxBalls) return

    const radius = randomBetween(config.radius[0], config.radius[1])
    let position = this.randomSpawn(config)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const overlapping = this.balls.some((ball) => {
        const min = ball.radius + radius + 0.35
        return ball.mesh.position.distanceToSquared(position) < min * min
      })
      if (!overlapping) break
      position = this.randomSpawn(config)
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 1,
    })
    const mesh = new THREE.Mesh(this.sphereGeometry, material)
    mesh.position.copy(position)
    mesh.scale.setScalar(0.001)
    this.scene.add(mesh)
    this.balls.push({
      id: this.nextId++,
      mesh,
      radius,
      born: this.now(),
      lifetime: randomBetween(config.lifetime[0], config.lifetime[1]),
      velocity: new THREE.Vector3(),
      waypoint: position.clone(),
    })
  }

  private spawnTrackBall() {
    const config = DIFFICULTY[this.difficulty]
    const track = TRACK[this.difficulty]
    const position = this.randomSpawn(config)
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 1,
    })
    const mesh = new THREE.Mesh(this.sphereGeometry, material)
    mesh.position.copy(position)
    mesh.scale.setScalar(track.radius)
    this.scene.add(mesh)
    this.balls.push({
      id: this.nextId++,
      mesh,
      radius: track.radius,
      born: this.now(),
      lifetime: Number.POSITIVE_INFINITY,
      velocity: new THREE.Vector3(randomBetween(-1, 1), randomBetween(-0.4, 0.4), randomBetween(-1, 1))
        .normalize()
        .multiplyScalar(track.speed),
      waypoint: this.randomSpawn(config),
    })
  }

  private moveTrackBall(dt: number) {
    const ball = this.balls[0]
    if (!ball) return
    const config = DIFFICULTY[this.difficulty]
    const track = TRACK[this.difficulty]
    const step = dt / 1000

    if (ball.mesh.position.distanceToSquared(ball.waypoint) < 0.36) {
      ball.waypoint.copy(this.randomSpawn(config))
    }

    const desired = ball.waypoint.clone().sub(ball.mesh.position)
    if (desired.lengthSq() > 0.0001) desired.setLength(track.speed)
    const steer = desired.sub(ball.velocity)
    steer.clampLength(0, track.accel * step)
    ball.velocity.add(steer)
    ball.velocity.clampLength(0, track.speed)
    ball.mesh.position.addScaledVector(ball.velocity, step)

    const min = new THREE.Vector3(config.spread[0], config.height[0], -config.depth[1])
    const max = new THREE.Vector3(config.spread[1], config.height[1], -Math.min(config.depth[0], config.depth[1] * 0.15))
    const pos = ball.mesh.position
    if (pos.x < min.x || pos.x > max.x) {
      pos.x = THREE.MathUtils.clamp(pos.x, min.x, max.x)
      ball.velocity.x *= -1
      ball.waypoint.copy(this.randomSpawn(config))
    }
    if (pos.y < min.y || pos.y > max.y) {
      pos.y = THREE.MathUtils.clamp(pos.y, min.y, max.y)
      ball.velocity.y *= -1
      ball.waypoint.copy(this.randomSpawn(config))
    }
    if (pos.z < min.z || pos.z > max.z) {
      pos.z = THREE.MathUtils.clamp(pos.z, min.z, max.z)
      ball.velocity.z *= -1
      ball.waypoint.copy(this.randomSpawn(config))
    }
  }

  private updateTrackLock(dt: number) {
    const ball = this.balls[0]
    if (!ball) return
    this.aimFromCenter()
    const hovering = this.raycaster.intersectObject(ball.mesh, false).length > 0

    if (hovering) {
      if (!this.locked) {
        this.locked = true
        this.hits += 1
        this.flash = 0.7
      }
      this.lockMs += dt
      this.onTargetMs += dt
      this.bestCombo = Math.max(this.bestCombo, this.lockMs)
      this.scoreExact += dt * (0.12 + this.lockMs / 18000)
      this.score = Math.floor(this.scoreExact)
      if (this.lockMs - this.lastLockFloater >= 1000) {
        this.lastLockFloater = this.lockMs
        this.addFloater(ball.mesh.position.clone().add(new THREE.Vector3(0, ball.radius + 0.12, 0)), '+锁定')
      }
    } else if (this.locked) {
      this.locked = false
      this.combo = 0
      this.lockMs = 0
      this.lastLockFloater = 0
      this.misses += 1
      this.addFloater(ball.mesh.position.clone(), '丢失', true)
    }
    this.crosshair.classList.toggle('is-locked', this.locked)
  }

  private randomSpawn(config: DifficultyConfig) {
    return new THREE.Vector3(
      randomBetween(config.spread[0], config.spread[1]),
      randomBetween(config.height[0], config.height[1]),
      -randomBetween(config.depth[0], config.depth[1]),
    )
  }

  private disposeBall(ball: Ball) {
    this.scene.remove(ball.mesh)
    ball.mesh.material.dispose()
  }

  private disposeParticle(particle: Particle) {
    this.scene.remove(particle.mesh)
    particle.mesh.material.dispose()
  }

  private loop = (time = performance.now()) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.lastFrame === 0 ? 16.67 : Math.min(48, time - this.lastFrame)
    this.lastFrame = time
    if (this.status === 'running') this.update(dt)
    this.draw()
  }

  private update(dt: number) {
    const now = this.now()
    if (this.durationMs > 0 && this.remaining() <= 0) {
      this.status = 'ended'
      for (const ball of this.balls) this.disposeBall(ball)
      this.balls = []
      this.hideCrosshair()
      this.releaseLookLock()
      this.emit()
      return
    }

    if (this.mode === 'track') {
      this.moveTrackBall(dt)
      this.updateTrackLock(dt)
    } else {
      const config = DIFFICULTY[this.difficulty]
      if (now >= this.nextSpawnAt) {
        this.spawnBall()
        this.nextSpawnAt = now + randomBetween(config.spawnInterval[0], config.spawnInterval[1])
      }

      this.balls = this.balls.filter((ball) => {
        if (now - ball.born < ball.lifetime) return true
        this.registerMiss(ball.mesh.position.clone(), true)
        this.disposeBall(ball)
        return false
      })
    }

    this.particles = this.particles.filter((particle) => {
      particle.life += dt
      const step = dt / 1000
      particle.mesh.position.addScaledVector(particle.velocity, step)
      particle.velocity.multiplyScalar(0.92)
      particle.velocity.y -= 2.4 * step
      const alpha = 1 - particle.life / particle.maxLife
      particle.mesh.material.opacity = alpha
      particle.mesh.scale.setScalar(particle.size * alpha)
      if (particle.life < particle.maxLife) return true
      this.disposeParticle(particle)
      return false
    })

    this.floaters = this.floaters.filter((floater) => {
      floater.life += dt
      if (floater.life < floater.maxLife) return true
      floater.el.remove()
      return false
    })

    this.flash = Math.max(0, this.flash - dt / 180)
    this.flashLayer.style.opacity = String(this.flash * 0.14)
    if (now - this.lastTimeEmit > 80) {
      this.lastTimeEmit = now
      this.emit()
    }
  }

  private draw() {
    const now = this.now()
    for (const ball of this.balls) {
      const age = now - ball.born
      const appear = Math.min(1, age / 140)
      const remain =
        this.mode === 'track' ? 1 : Math.max(0, 1 - age / ball.lifetime)
      const pulse = 1 + Math.sin(now / 180 + ball.id) * 0.015
      const lockPulse = this.mode === 'track' && this.locked ? 1.08 : 1
      ball.mesh.scale.setScalar(ball.radius * (0.86 + appear * 0.14) * pulse * lockPulse)
      ball.mesh.material.opacity = 0.55 + remain * 0.45
      ball.mesh.material.emissiveIntensity =
        this.mode === 'track' && this.locked ? 0.85 : 0.22 + remain * 0.35
      ball.mesh.material.color.set(this.mode === 'track' && this.locked ? 0xb8ffd6 : 0xffffff)
      ball.mesh.material.emissive.set(this.mode === 'track' && this.locked ? 0x6dffb0 : 0xffffff)
    }

    this.syncCamera()

    for (const floater of this.floaters) {
      const progress = floater.life / floater.maxLife
      this.projectScratch.copy(floater.world)
      this.projectScratch.y += progress * 0.35
      this.projectScratch.project(this.camera)
      const x = (this.projectScratch.x * 0.5 + 0.5) * this.width
      const y = (-this.projectScratch.y * 0.5 + 0.5) * this.height
      floater.el.style.opacity = String(1 - progress)
      floater.el.style.transform = `translate(${x}px, ${y}px)`
    }

    this.ambient.intensity = 0.32 + this.flash * 0.2
    this.renderer.render(this.scene, this.camera)
  }
}
