import '@pixi/unsafe-eval'
import 'pixi-spine'
import { Application, Assets } from 'pixi.js'
import { Spine } from 'pixi-spine'

const CHARACTER = {
  id: 'cupid',
  name: '丘比特',
  skel: './assets/characters/cupid/cupid_01.skel',
}

/** @type {Map<HTMLElement, { app: Application, spine: Spine, destroy: () => void }>} */
const mounts = new Map()

function animationNames(spine) {
  return spine.spineData.animations.map((item) => item.name)
}

function pickAnimation(spine, candidates) {
  const names = animationNames(spine)
  return candidates.find((name) => names.includes(name)) ?? names[0]
}

function preferredIdle(spine) {
  return pickAnimation(spine, ['idle', 'stand', 'normal'])
}

function preferredWalk(spine) {
  return pickAnimation(spine, ['walk', 'run', 'move'])
}

function fitSpine(spine, width, height) {
  spine.autoUpdate = false
  spine.scale.set(1)
  spine.position.set(0, 0)
  spine.pivot.set(0, 0)
  spine.skeleton.setToSetupPose()

  const idle = preferredIdle(spine)
  if (idle) {
    spine.state.setAnimation(0, idle, false)
    spine.update(0.05)
  }
  const box = spine.getLocalBounds()
  if (box.width < 1 || box.height < 1) {
    spine.autoUpdate = true
    return
  }

  const pad = Math.max(8, Math.round(Math.min(width, height) * 0.08))
  const scale = Math.min((width - pad * 2) / box.width, (height - pad * 2) / box.height)
  spine.pivot.set(box.x + box.width / 2, box.y + box.height / 2)
  spine.position.set(width / 2, height / 2 + height * 0.08)
  spine.scale.set(scale)
  spine.autoUpdate = true
}

/**
 * @param {HTMLElement} host
 * @param {{ mode?: 'idle' | 'walk', facing?: 1 | -1 }} [options]
 */
export async function mountPet(host, options = {}) {
  if (mounts.has(host)) return mounts.get(host)

  for (let i = 0; i < 12; i++) {
    if (host.clientWidth > 40 && host.clientHeight > 40) break
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }

  const mode = options.mode ?? 'idle'
  const facing = options.facing ?? 1
  const width = Math.max(80, Math.round(host.clientWidth || 160))
  const height = Math.max(80, Math.round(host.clientHeight || 160))

  const app = new Application({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  })
  const view = app.view
  view.style.width = '100%'
  view.style.height = '100%'
  view.style.display = 'block'
  host.replaceChildren(view)

  const resource = await Assets.load(CHARACTER.skel)
  const spineData = resource.spineData ?? resource
  const spine = new Spine(spineData)
  fitSpine(spine, width, height)
  spine.scale.x = Math.abs(spine.scale.x) * facing

  const anim =
    mode === 'walk' ? preferredWalk(spine) ?? preferredIdle(spine) : preferredIdle(spine)
  if (anim) spine.state.setAnimation(0, anim, true)

  app.stage.addChild(spine)

  const entry = {
    app,
    spine,
    setFacing(next) {
      spine.scale.x = Math.abs(spine.scale.x) * (next >= 0 ? 1 : -1)
    },
    setAnimation(name, loop = true) {
      const picked = pickAnimation(spine, [name]) ?? preferredIdle(spine)
      if (picked) spine.state.setAnimation(0, picked, loop)
    },
    destroy() {
      mounts.delete(host)
      try {
        app.destroy(true, { children: true, texture: false, baseTexture: false })
      } catch {
        /* ignore */
      }
      host.replaceChildren()
    },
  }

  mounts.set(host, entry)
  return entry
}

export async function mountSitePets() {
  const nodes = [...document.querySelectorAll('[data-pet]')]
  await Promise.all(
    nodes.map((host) => {
      if (!(host instanceof HTMLElement)) return Promise.resolve()
      const mode = host.dataset.pet === 'walk' ? 'walk' : 'idle'
      const facing = host.dataset.facing === '-1' ? -1 : 1
      return mountPet(host, { mode, facing }).catch((error) => {
        console.warn('宠物加载失败', error)
        host.classList.add('pet-host--failed')
      })
    }),
  )
}

export { CHARACTER }
