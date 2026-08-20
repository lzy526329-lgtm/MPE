import '@pixi/unsafe-eval'
import 'pixi-spine'
import { Application, Assets } from 'pixi.js'
import { Spine } from 'pixi-spine'
import type { PetBounds, PetChatMessage } from '../electron/pet'
import './pet.css'

type AnimName = 'idle' | 'walk' | 'drag' | 'click'
type WalkDir = 'walkLeft' | 'walkRight'

const DEFAULT_VIEW_SIZE = 160

const root = document.querySelector<HTMLElement>('#pet-root')!

const app = new Application({
  width: DEFAULT_VIEW_SIZE,
  height: DEFAULT_VIEW_SIZE,
  backgroundAlpha: 0,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
})

const canvas = app.view as HTMLCanvasElement
canvas.id = 'pet'
root.appendChild(canvas)

const chatBubble = document.createElement('section')
chatBubble.className = 'pet-chat'
chatBubble.hidden = true
const chatText = document.createElement('p')
chatText.className = 'pet-chat-text'
const chatConfirmButton = document.createElement('button')
chatConfirmButton.className = 'pet-chat-confirm'
chatConfirmButton.type = 'button'
chatConfirmButton.textContent = '知道了'
chatBubble.append(chatText, chatConfirmButton)
root.appendChild(chatBubble)

let spine: Spine | null = null
let baseScale = 0.22
let anim: AnimName = 'idle'
let walkDir: WalkDir = 'walkRight'
let facing = 1
let dragging = false
let dragOffsetX = 0
let dragOffsetY = 0
let clickLockUntil = 0
let nextWanderAt = performance.now() + 2500
let walkTarget: { x: number; y: number } | null = null
let ignoreMouse = false
let wanderBusy = false
let dragMoved = false
let dragOriginX = 0
let dragOriginY = 0
let autoWalk = true
let contentSize = DEFAULT_VIEW_SIZE
let viewSize = DEFAULT_VIEW_SIZE
let hitCenterX = DEFAULT_VIEW_SIZE / 2
let hitCenterY = DEFAULT_VIEW_SIZE * 0.58
let loadedCharacterId = ''
let loadedSkeletonUrl = ''
let characterLoadSeq = 0
let loadingId = ''
let chatHideTimer = 0
let activeChatReminderId: string | null = null
let viewportSyncSeq = 0

const hasPetApi = Boolean(window.electronAPI?.petGetBounds)

function setCanvasSize(size: number) {
  const next = Math.max(64, Math.round(size))
  if (next === viewSize) return
  viewSize = next
  canvas.style.width = `${next}px`
  canvas.style.height = `${next}px`
  app.renderer.resize(next, next)
}

function syncPetViewport(size: number) {
  const next = Math.max(contentSize, Math.round(size))
  setCanvasSize(next)
  const seq = ++viewportSyncSeq
  void window.electronAPI?.setPetViewport?.(next).then((applied) => {
    if (seq !== viewportSyncSeq || typeof applied !== 'number') return
    setCanvasSize(applied)
  })
}

function applyPetStatus(status: { autoWalk: boolean; size: number; characterId?: string }) {
  const nextContent = Math.max(64, Math.round(status.size))
  const contentChanged = nextContent !== contentSize
  contentSize = nextContent

  const wantId = status.characterId || loadedCharacterId
  if (wantId && wantId !== loadedCharacterId) {
    void loadCharacter(wantId)
  } else if (spine && contentChanged) {
    const playing = currentAnimationName()
    fitSpineToView(spine)
    setFacing(facing)
    if (playing && preferredTouch(spine) === playing) playTouch()
    else if (anim === 'walk') playWalk()
    else playIdle()
  } else if (wantId && !spine) {
    void loadCharacter(wantId)
  }

  autoWalk = status.autoWalk !== false
  if (autoWalk) return
  walkTarget = null
  if (anim === 'walk') setAnim('idle')
}

function hideChatMessage() {
  window.clearTimeout(chatHideTimer)
  chatHideTimer = 0
  activeChatReminderId = null
  chatBubble.hidden = true
}

function showAiBubble(text: string) {
  window.clearTimeout(chatHideTimer)
  activeChatReminderId = null
  chatText.textContent = text
  chatConfirmButton.hidden = true
  chatBubble.hidden = false
  chatHideTimer = window.setTimeout(() => {
    hideChatMessage()
  }, 8000)
}

function showChatMessage(message: PetChatMessage) {
  window.clearTimeout(chatHideTimer)
  activeChatReminderId = message.reminderId
  chatText.textContent = message.text
  chatConfirmButton.hidden = !message.requireConfirm
  chatBubble.hidden = false
  if (!message.requireConfirm && message.dismissAfterMs) {
    chatHideTimer = window.setTimeout(() => {
      hideChatMessage()
    }, message.dismissAfterMs)
  }
}

function setFacing(next: number) {
  facing = next < 0 ? -1 : 1
  if (!spine) return
  spine.scale.x = Math.abs(baseScale) * facing
}

function currentAnimationName() {
  const state = spine?.state as { getCurrent?: (track: number) => { animation?: { name: string } } | null }
  return state?.getCurrent?.(0)?.animation?.name
}

function animationNames(character: Spine) {
  return character.spineData.animations.map((item) => item.name)
}

function pickAnimation(character: Spine, candidates: string[]) {
  const names = animationNames(character)
  return candidates.find((name) => names.includes(name)) ?? null
}

function preferredIdle(character: Spine) {
  return pickAnimation(character, ['idle', 'stand', 'normal']) ?? animationNames(character)[0]
}

function preferredTouch(character: Spine) {
  return pickAnimation(character, ['touch', 'skill_touch', 'hit', 'click'])
}

function preferredWalk(character: Spine) {
  return pickAnimation(character, ['walk', 'run'])
}

function playIdle() {
  if (!spine) return
  const idle = preferredIdle(spine)
  if (!idle) return
  if (currentAnimationName() !== idle) spine.state.setAnimation(0, idle, true)
}

function playTouch() {
  if (!spine) return
  const touch = preferredTouch(spine) ?? preferredIdle(spine)
  if (!touch) return
  spine.state.setAnimation(0, touch, false)
}

function playWalk() {
  if (!spine) return
  const walk = preferredWalk(spine) ?? preferredIdle(spine)
  if (!walk) return
  if (currentAnimationName() !== walk) spine.state.setAnimation(0, walk, true)
}

function setAnim(next: AnimName) {
  if (anim === next) return
  anim = next
  if (next === 'click') {
    playTouch()
    return
  }
  if (next === 'walk') {
    playWalk()
    return
  }
  playIdle()
}

function animationDuration(character: Spine, name: string) {
  return character.spineData.animations.find((item) => item.name === name)?.duration ?? 0
}

function unionBounds(
  box: { x: number; y: number; width: number; height: number } | null,
  next: { x: number; y: number; width: number; height: number },
) {
  if (!box) return { ...next }
  const left = Math.min(box.x, next.x)
  const top = Math.min(box.y, next.y)
  const right = Math.max(box.x + box.width, next.x + next.width)
  const bottom = Math.max(box.y + box.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function sampleAnimationBounds(character: Spine, name: string) {
  const duration = Math.max(animationDuration(character, name), 0.05)
  const samples = Math.max(12, Math.ceil(duration * 24))
  character.state.setAnimation(0, name, false)
  character.update(0)
  let box: { x: number; y: number; width: number; height: number } | null = null
  for (let i = 0; i <= samples; i++) {
    if (i > 0) character.update(duration / samples)
    const next = character.getLocalBounds()
    box = unionBounds(box, { x: next.x, y: next.y, width: next.width, height: next.height })
  }
  return box
}

function fitSpineToView(character: Spine) {
  character.autoUpdate = false
  character.scale.set(1)
  character.position.set(0, 0)
  character.pivot.set(0, 0)
  character.skeleton.setToSetupPose()

  const idle = preferredIdle(character)
  const idleBox = idle ? sampleAnimationBounds(character, idle) : null
  if (!idleBox || idleBox.width < 1 || idleBox.height < 1) {
    character.autoUpdate = true
    return
  }

  // idle 决定体型；扫描全部动画算特效范围，窗口自动放大，无需按宠物单独配置
  let extentBox = { ...idleBox }
  for (const name of animationNames(character)) {
    if (name === idle) continue
    const next = sampleAnimationBounds(character, name)
    if (next) extentBox = unionBounds(extentBox, next)!
  }

  const padding = Math.max(8, Math.round(contentSize * 0.06))
  const available = Math.max(1, contentSize - padding * 2)
  baseScale = Math.min(available / idleBox.width, available / idleBox.height)

  const pivotX = idleBox.x + idleBox.width / 2
  const pivotY = idleBox.y + idleBox.height
  character.pivot.set(pivotX, pivotY)

  const left = (extentBox.x - pivotX) * baseScale
  const right = (extentBox.x + extentBox.width - pivotX) * baseScale
  const top = (extentBox.y - pivotY) * baseScale
  const bottom = (extentBox.y + extentBox.height - pivotY) * baseScale
  const needW = Math.ceil(right - left + padding * 2)
  const needH = Math.ceil(bottom - top + padding * 2)
  const maxView = Math.max(contentSize, Math.min(Math.round(contentSize * 2.4), 520))
  const nextView = Math.max(contentSize, Math.min(maxView, Math.max(needW, needH)))

  syncPetViewport(nextView)

  const extentW = right - left
  const extentH = bottom - top
  const posX = (nextView - extentW) / 2 - left
  const bottomAlignedY = nextView - padding - bottom
  const posY = bottomAlignedY + top >= padding * 0.25
    ? bottomAlignedY
    : (nextView - extentH) / 2 - top
  character.position.set(posX, posY)
  character.scale.set(baseScale)
  hitCenterX = posX
  hitCenterY = posY - contentSize * 0.42
  character.autoUpdate = true
}

async function loadCatalog() {
  if (window.electronAPI?.getPetCharacters) {
    return window.electronAPI.getPetCharacters()
  }
  const response = await fetch('/pet/characters/catalog.json')
  if (!response.ok) return []
  return response.json() as Promise<{ id: string; skeletonUrl: string }[]>
}

function clearSpine() {
  if (!spine) return
  app.stage.removeChild(spine)
  spine.destroy({ children: true })
  spine = null
}

async function loadCharacter(id: string) {
  if ((id && id === loadedCharacterId && spine) || (id && id === loadingId)) return
  const seq = ++characterLoadSeq
  const catalog = await loadCatalog()
  const selected = catalog.find((item) => item.id === id) ?? catalog[0]
  if (!selected || seq !== characterLoadSeq) return
  loadingId = selected.id

  if (loadedSkeletonUrl && loadedSkeletonUrl !== selected.skeletonUrl) {
    try {
      await Assets.unload(loadedSkeletonUrl)
    } catch {
      /* ignore */
    }
  }

  try {
    const resource = await Assets.load(selected.skeletonUrl)
    if (seq !== characterLoadSeq) return
    const spineData = resource.spineData ?? resource
    const character = new Spine(spineData)
    fitSpineToView(character)
    const idle = preferredIdle(character)
    if (idle) character.state.setAnimation(0, idle, true)
    character.state.addListener({
      complete: (entry) => {
        const name = (entry as { animation?: { name: string } }).animation?.name
        if (name && preferredTouch(character) === name && anim === 'click') setAnim('idle')
      },
    })
    clearSpine()
    app.stage.addChild(character)
    spine = character
    loadedCharacterId = selected.id
    loadedSkeletonUrl = selected.skeletonUrl
    anim = 'idle'
    setFacing(facing)
  } finally {
    if (loadingId === selected.id) loadingId = ''
  }
}

function hitTest(clientX: number, clientY: number) {
  const rx = contentSize * 0.34
  const ry = contentSize * 0.42
  const nx = (clientX - hitCenterX) / rx
  const ny = (clientY - hitCenterY) / ry
  return nx * nx + ny * ny <= 1
}

function bubbleHitTest(clientX: number, clientY: number) {
  if (chatBubble.hidden) return false
  const rect = chatBubble.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

async function bounds(): Promise<PetBounds | null> {
  if (!hasPetApi) return null
  return window.electronAPI.petGetBounds()
}

function directionFromDelta(dx: number): WalkDir {
  if (dx < 0) return 'walkLeft'
  if (dx > 0) return 'walkRight'
  return walkDir
}

async function wander(now: number) {
  if (!autoWalk) {
    walkTarget = null
    if (anim === 'walk') setAnim('idle')
    return
  }
  if (wanderBusy || dragging || anim === 'click' || now < clickLockUntil) return
  if (!walkTarget && now < nextWanderAt) {
    if (anim !== 'idle') setAnim('idle')
    return
  }
  wanderBusy = true
  try {
    const info = await bounds()
    if (!info) return

    if (!walkTarget && now >= nextWanderAt) {
      if (Math.random() < 0.55) {
        const maxX = info.workArea.x + info.workArea.width - info.width
        const maxY = info.workArea.y + info.workArea.height - info.height
        walkTarget = {
          x: Math.round(info.workArea.x + Math.random() * Math.max(1, maxX - info.workArea.x)),
          y: Math.round(info.workArea.y + Math.random() * Math.max(1, maxY - info.workArea.y)),
        }
        setAnim('walk')
      } else {
        nextWanderAt = now + 2000 + Math.random() * 4000
        setAnim('idle')
      }
    }

    if (!walkTarget) {
      if (anim !== 'idle') setAnim('idle')
      return
    }

    const dx = walkTarget.x - info.x
    const dy = walkTarget.y - info.y
    const dist = Math.hypot(dx, dy)
    if (dist < 3) {
      walkTarget = null
      nextWanderAt = now + 2500 + Math.random() * 4000
      setAnim('idle')
      return
    }

    walkDir = directionFromDelta(dx)
    setFacing(dx)
    setAnim('walk')
    const speed = 2.4
    await window.electronAPI.petSetPosition(info.x + (dx / dist) * speed, info.y + (dy / dist) * speed)
  } finally {
    wanderBusy = false
  }
}

function tick(now: number) {
  if (anim === 'click' && now >= clickLockUntil) setAnim('idle')
  if (!dragging) void wander(now)
  requestAnimationFrame(tick)
}

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  if (hasPetApi) void window.electronAPI.petPopupMenu()
})

canvas.addEventListener('mousedown', async (event) => {
  if (event.button !== 0) return
  const info = await bounds()
  if (!info) {
    clickLockUntil = performance.now() + 900
    setAnim('click')
    return
  }
  dragging = true
  dragMoved = false
  walkTarget = null
  dragOriginX = event.screenX
  dragOriginY = event.screenY
  dragOffsetX = event.screenX - info.x
  dragOffsetY = event.screenY - info.y
  setAnim('drag')
})

window.addEventListener('mousemove', async (event) => {
  if (dragging) {
    if (Math.hypot(event.screenX - dragOriginX, event.screenY - dragOriginY) > 6) {
      dragMoved = true
    }
    if (hasPetApi) {
      await window.electronAPI.petSetPosition(
        event.screenX - dragOffsetX,
        event.screenY - dragOffsetY,
      )
    }
    return
  }

  const hit = hitTest(event.clientX, event.clientY) || bubbleHitTest(event.clientX, event.clientY)
  if (hit === ignoreMouse) {
    ignoreMouse = !hit
    if (hasPetApi) await window.electronAPI.petIgnoreMouse(!hit)
  }
})

window.addEventListener('mouseup', (event) => {
  if (!dragging || event.button !== 0) return
  dragging = false
  if (dragMoved) {
    setAnim('idle')
    nextWanderAt = performance.now() + 1800
    return
  }
  clickLockUntil = performance.now() + 900
  setAnim('click')
  nextWanderAt = performance.now() + 1800
})

chatConfirmButton.addEventListener('click', async () => {
  if (!window.electronAPI?.confirmPetReminder) return
  await window.electronAPI.confirmPetReminder(activeChatReminderId ?? undefined)
  hideChatMessage()
})

async function boot() {
  try {
    const status = window.electronAPI?.getPetStatus ? await window.electronAPI.getPetStatus() : null
    if (status) applyPetStatus(status)
    else await loadCharacter('')
  } catch (error) {
    console.error('Spine 加载失败', error)
  }
  requestAnimationFrame(tick)
}

const onPetStatusChanged = window.electronAPI?.onPetStatusChanged
if (onPetStatusChanged) onPetStatusChanged(applyPetStatus)
window.electronAPI?.onPetChatMessage?.(showChatMessage)
window.electronAPI?.onPetChatClear?.(hideChatMessage)
window.electronAPI?.onPetAiBubble?.((payload) => showAiBubble(payload.text))

void boot()
