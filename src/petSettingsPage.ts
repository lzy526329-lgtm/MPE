import type { PetCharacter } from '../electron/petCharacters'
import type { PetStatus } from '../electron/pet'

const PET_SIZE_MIN = 96
const PET_SIZE_MAX = 280
const PET_SIZE_DEFAULT = 160

function barClass(value: number, invert = false) {
  const score = invert ? 100 - value : value
  if (score <= 25) return 'pet-stat-fill--danger'
  if (score <= 50) return 'pet-stat-fill--warn'
  return ''
}

function moodText(status: PetStatus) {
  if (status.health <= 20) return '状态很差，需要休息。'
  if (status.hunger >= 80) return '非常饿，先喂一点吧。'
  if (status.hunger >= 50) return '有点饿了。'
  if (status.health >= 80 && status.hunger <= 30) return '精神很好。'
  return '还不错。'
}

function renderStatus(root: HTMLElement, status: PetStatus) {
  const walk = root.querySelector<HTMLInputElement>('#pet-auto-walk')
  const size = root.querySelector<HTMLInputElement>('#pet-size')
  const sizeValue = root.querySelector<HTMLElement>('#pet-size-value')
  const healthValue = root.querySelector<HTMLElement>('#pet-health-value')
  const hungerValue = root.querySelector<HTMLElement>('#pet-hunger-value')
  const healthFill = root.querySelector<HTMLElement>('#pet-health-fill')
  const hungerFill = root.querySelector<HTMLElement>('#pet-hunger-fill')
  const mood = root.querySelector<HTMLElement>('#pet-mood')
  if (!walk || !size || !sizeValue || !healthValue || !hungerValue || !healthFill || !hungerFill || !mood) {
    return
  }

  walk.checked = status.autoWalk
  if (document.activeElement !== size) size.value = String(status.size)
  sizeValue.textContent = `${status.size} px`
  healthValue.textContent = `${status.health}`
  hungerValue.textContent = `${status.hunger}`
  healthFill.style.width = `${status.health}%`
  hungerFill.style.width = `${status.hunger}%`
  healthFill.className = `pet-stat-fill ${barClass(status.health)}`
  hungerFill.className = `pet-stat-fill ${barClass(status.hunger, true)}`
  mood.textContent = moodText(status)
}

function renderCharacters(root: HTMLElement, characters: PetCharacter[], selectedId: string) {
  const grid = root.querySelector<HTMLElement>('#pet-characters')
  if (!grid) return
  if (!characters.length) {
    grid.innerHTML = '<p class="field-hint">还没有可用形象。把 Spine 资源放到 donghua/角色名/ 后重启应用。</p>'
    return
  }
  grid.innerHTML = characters
    .map(
      (item) => `
        <button class="pet-character-card${item.id === selectedId ? ' is-selected' : ''}" type="button" data-character="${item.id}">
          <img alt="" src="${item.previewUrl}" />
          <span>
            <strong>${item.name}</strong>
            <em>${item.description || item.id}</em>
          </span>
        </button>
      `,
    )
    .join('')
}

export function mountPetSettingsPage() {
  const root = document.querySelector<HTMLElement>('#pet-settings-root')
  if (!root) return

  root.innerHTML = `
    <div class="pet-config-grid">
      <article class="pet-config-card pet-config-card--wide">
        <h2>形象</h2>
        <p>每个角色一个文件夹。以后把新动画放到 <code>donghua/角色id/</code>，包含 <code>.skel</code>、<code>.atlas</code>、<code>.png</code> 和可选的 <code>meta.json</code>。</p>
        <div class="pet-character-grid" id="pet-characters"></div>
      </article>
      <article class="pet-config-card">
        <h2>外观与行为</h2>
        <p>窗口越小越不挡视线。关掉自动行走后会停在原地，仍可拖动和点击。</p>
        <label class="pet-size-field">
          <span class="pet-stat-label">
            <span>显示大小</span>
            <strong id="pet-size-value">${PET_SIZE_DEFAULT} px</strong>
          </span>
          <input
            id="pet-size"
            type="range"
            min="${PET_SIZE_MIN}"
            max="${PET_SIZE_MAX}"
            step="8"
            value="${PET_SIZE_DEFAULT}"
          />
          <span class="pet-size-marks">
            <em>小 ${PET_SIZE_MIN}</em>
            <em>大 ${PET_SIZE_MAX}</em>
          </span>
        </label>
        <label class="pet-config-switch">
          <input id="pet-auto-walk" type="checkbox" />
          <span>
            <strong>自动行走</strong>
            <em>开启后会在桌面上随机走动。</em>
          </span>
        </label>
      </article>
      <article class="pet-config-card">
        <h2>状态</h2>
        <p id="pet-mood">精神很好。</p>
        <div class="pet-stat">
          <div class="pet-stat-label">
            <span>健康值</span>
            <strong id="pet-health-value">100</strong>
          </div>
          <div class="pet-stat-bar"><div class="pet-stat-fill" id="pet-health-fill"></div></div>
        </div>
        <div class="pet-stat">
          <div class="pet-stat-label">
            <span>饥饿值</span>
            <strong id="pet-hunger-value">20</strong>
          </div>
          <div class="pet-stat-bar"><div class="pet-stat-fill" id="pet-hunger-fill"></div></div>
          <p class="field-hint">越高越饿。大约每 30 秒增加 2 点；过饿会扣健康。</p>
        </div>
        <div class="pet-config-actions">
          <button class="primary-button" id="pet-feed" type="button">喂食</button>
          <button class="secondary-button" id="pet-rest" type="button">休息</button>
        </div>
      </article>
    </div>
  `

  const apply = (status: PetStatus) => {
    renderStatus(root, status)
    void loadCharacters(status.characterId)
  }

  async function loadCharacters(selectedId: string) {
    const characters = window.electronAPI?.getPetCharacters
      ? await window.electronAPI.getPetCharacters()
      : await fetch('/pet/characters/catalog.json').then((response) => (response.ok ? response.json() : []))
    renderCharacters(root!, characters, selectedId)
  }

  if (window.electronAPI?.getPetStatus) {
    void window.electronAPI.getPetStatus().then(apply)
  } else {
    void loadCharacters('')
  }
  window.electronAPI?.onPetStatusChanged?.(apply)

  const sizeInput = root.querySelector<HTMLInputElement>('#pet-size')
  const sizeValue = root.querySelector<HTMLElement>('#pet-size-value')
  let sizeTimer = 0

  const persistSize = async (value: number) => {
    if (!window.electronAPI?.setPetSize) return
    apply(await window.electronAPI.setPetSize(value))
  }

  sizeInput?.addEventListener('input', () => {
    if (sizeValue && sizeInput) sizeValue.textContent = `${sizeInput.value} px`
    window.clearTimeout(sizeTimer)
    sizeTimer = window.setTimeout(() => {
      if (sizeInput) void persistSize(Number(sizeInput.value))
    }, 80)
  })

  sizeInput?.addEventListener('change', () => {
    window.clearTimeout(sizeTimer)
    if (sizeInput) void persistSize(Number(sizeInput.value))
  })

  root.querySelector<HTMLInputElement>('#pet-auto-walk')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement
    if (!window.electronAPI?.setPetAutoWalk) return
    apply(await window.electronAPI.setPetAutoWalk(input.checked))
  })

  root.querySelector<HTMLButtonElement>('#pet-feed')?.addEventListener('click', async () => {
    if (!window.electronAPI?.feedPet) return
    apply(await window.electronAPI.feedPet())
  })

  root.querySelector<HTMLButtonElement>('#pet-rest')?.addEventListener('click', async () => {
    if (!window.electronAPI?.restPet) return
    apply(await window.electronAPI.restPet())
  })

  root.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-character]')
    if (!button?.dataset.character || !window.electronAPI?.setPetCharacter) return
    apply(await window.electronAPI.setPetCharacter(button.dataset.character))
  })
}
