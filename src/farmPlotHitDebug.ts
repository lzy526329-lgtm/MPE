const HIT_DEBUG_SESSION_KEY = 'farm-hit-debug'

export function isFarmHitDebugEnabled(): boolean {
  return sessionStorage.getItem(HIT_DEBUG_SESSION_KEY) === '1'
}

function setFarmHitDebugEnabled(enabled: boolean) {
  if (enabled) sessionStorage.setItem(HIT_DEBUG_SESSION_KEY, '1')
  else sessionStorage.removeItem(HIT_DEBUG_SESSION_KEY)
}

function clearLegacyHitOverlay(stage: HTMLElement) {
  stage.querySelectorAll('.farm-plot-hit-debug').forEach((el) => el.remove())
  stage.querySelector('.farm-hit-debug')?.remove()
}

export function syncFarmPlotHitDebug(farmRoot: HTMLElement): void {
  const scene = farmRoot.querySelector<HTMLElement>('.farm-scene')
  const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
  if (!scene || !stage) return

  let toggle = scene.querySelector<HTMLButtonElement>('.farm-hit-debug-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'farm-hit-debug-toggle'
    toggle.textContent = '🎯 点击范围'
    toggle.title = '显示/隐藏地块点击命中区'
    scene.querySelector('.farm-hud')?.append(toggle)
  }

  const updateToggleLabel = () => {
    toggle!.textContent = isFarmHitDebugEnabled() ? '🎯 隐藏范围' : '🎯 点击范围'
  }

  const showOverlay = () => {
    clearLegacyHitOverlay(stage)
    stage.classList.add('farm-stage--hit-debug')
    updateToggleLabel()
  }

  const hideOverlay = () => {
    stage.classList.remove('farm-stage--hit-debug')
    clearLegacyHitOverlay(stage)
    updateToggleLabel()
  }

  toggle.onclick = () => {
    if (isFarmHitDebugEnabled()) {
      setFarmHitDebugEnabled(false)
      hideOverlay()
    } else {
      setFarmHitDebugEnabled(true)
      showOverlay()
    }
  }

  if (isFarmHitDebugEnabled()) showOverlay()
  else hideOverlay()
}

export function refreshFarmPlotHitDebugIfEnabled(stage: HTMLElement | null) {
  if (!stage || !isFarmHitDebugEnabled()) return
  clearLegacyHitOverlay(stage)
  stage.classList.add('farm-stage--hit-debug')
}
