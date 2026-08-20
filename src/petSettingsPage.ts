import type { PetCharacter } from '../electron/petCharacters'
import type { PetReminderItem, PetStatus } from '../electron/pet'

const PET_SIZE_MIN = 96
const PET_SIZE_MAX = 280
const PET_SIZE_DEFAULT = 160
const REMINDER_DATE_STEP = 60

type ReminderMode = 'interval-repeat' | 'interval-once' | 'datetime-once' | 'daily-time'

function toLocalDateTimeValue(isoText: string) {
  if (!isoText) return ''
  const stamp = Date.parse(isoText)
  if (Number.isNaN(stamp)) return ''
  const d = new Date(stamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${hh}:${mm}`
}

function fromLocalDateTimeValue(value: string) {
  if (!value) return ''
  const stamp = Date.parse(value)
  if (Number.isNaN(stamp)) return ''
  return new Date(stamp).toISOString()
}

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
  const visible = root.querySelector<HTMLInputElement>('#pet-visible')
  const walk = root.querySelector<HTMLInputElement>('#pet-auto-walk')
  const size = root.querySelector<HTMLInputElement>('#pet-size')
  const sizeValue = root.querySelector<HTMLElement>('#pet-size-value')
  const healthValue = root.querySelector<HTMLElement>('#pet-health-value')
  const hungerValue = root.querySelector<HTMLElement>('#pet-hunger-value')
  const healthFill = root.querySelector<HTMLElement>('#pet-health-fill')
  const hungerFill = root.querySelector<HTMLElement>('#pet-hunger-fill')
  const mood = root.querySelector<HTMLElement>('#pet-mood')
  if (!visible || !walk || !size || !sizeValue || !healthValue || !hungerValue || !healthFill || !hungerFill || !mood) {
    return
  }

  visible.checked = status.enabled
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

function reminderSummary(item: PetReminderItem) {
  if (!item.enabled) return '已暂停'
  if (item.pendingText && item.requireConfirm) return '待确认'
  if (item.mode === 'interval-repeat') return `每 ${item.minutes} 分钟`
  if (item.mode === 'interval-once') return `${item.minutes} 分钟后一次`
  if (item.mode === 'datetime-once') {
    return item.onceAt ? new Date(item.onceAt).toLocaleString() : '未设时间'
  }
  return `每天 ${item.dailyTime}`
}

function toggleReminderModeFields(root: HTMLElement, mode: ReminderMode) {
  root.querySelector<HTMLElement>('#pet-reminder-minutes-field')!.hidden =
    !(mode === 'interval-repeat' || mode === 'interval-once')
  root.querySelector<HTMLElement>('#pet-reminder-once-at-field')!.hidden = mode !== 'datetime-once'
  root.querySelector<HTMLElement>('#pet-reminder-daily-time-field')!.hidden = mode !== 'daily-time'
}

function renderReminderList(root: HTMLElement, reminders: PetReminderItem[], editingId: string | null) {
  const list = root.querySelector<HTMLElement>('#pet-reminder-list')
  const hint = root.querySelector<HTMLElement>('#pet-reminder-hint')
  if (!list || !hint) return

  if (!reminders.length) {
    list.innerHTML = '<p class="field-hint">还没有提醒，在下方填写后点击「添加提醒」。</p>'
    hint.textContent = '可创建多条提醒，例如喝水、休息、开会等。'
    return
  }

  list.innerHTML = reminders
    .map(
      (item) => `
        <article class="pet-reminder-card${editingId === item.id ? ' is-editing' : ''}" data-reminder-id="${item.id}">
          <div class="pet-reminder-card-main">
            <strong>${item.text}</strong>
            <em>${reminderSummary(item)} · ${item.requireConfirm ? '需确认' : '10 秒后消失'}</em>
          </div>
          <div class="pet-reminder-card-actions">
            <button class="secondary-button" type="button" data-reminder-edit="${item.id}">编辑</button>
            <button class="secondary-button" type="button" data-reminder-delete="${item.id}">删除</button>
          </div>
        </article>
      `,
    )
    .join('')

  const pending = reminders.filter((item) => item.pendingText && item.requireConfirm)
  if (pending.length) {
    hint.textContent = `有 ${pending.length} 条待确认提醒。`
  } else {
    const active = reminders.filter((item) => item.enabled)
    hint.textContent = active.length
      ? `共 ${reminders.length} 条提醒，其中 ${active.length} 条启用中。`
      : `共 ${reminders.length} 条提醒，均未启用。`
  }
}

function fillReminderForm(root: HTMLElement, item: PetReminderItem | null) {
  const enabled = root.querySelector<HTMLInputElement>('#pet-reminder-enabled')
  const mode = root.querySelector<HTMLSelectElement>('#pet-reminder-mode')
  const minutes = root.querySelector<HTMLInputElement>('#pet-reminder-minutes')
  const onceAt = root.querySelector<HTMLInputElement>('#pet-reminder-once-at')
  const dailyTime = root.querySelector<HTMLInputElement>('#pet-reminder-daily-time')
  const text = root.querySelector<HTMLInputElement>('#pet-reminder-text')
  const requireConfirm = root.querySelector<HTMLSelectElement>('#pet-reminder-confirm')
  const saveBtn = root.querySelector<HTMLButtonElement>('#pet-reminder-save')
  const cancelBtn = root.querySelector<HTMLButtonElement>('#pet-reminder-cancel')
  if (!enabled || !mode || !minutes || !onceAt || !dailyTime || !text || !requireConfirm || !saveBtn || !cancelBtn) {
    return
  }

  if (!item) {
    enabled.checked = true
    mode.value = 'interval-repeat'
    minutes.value = '10'
    onceAt.value = ''
    dailyTime.value = '18:00'
    text.value = '该喝水啦'
    requireConfirm.value = 'yes'
    saveBtn.textContent = '添加提醒'
    cancelBtn.hidden = true
    toggleReminderModeFields(root, 'interval-repeat')
    return
  }

  enabled.checked = item.enabled
  mode.value = item.mode
  minutes.value = String(item.minutes)
  onceAt.value = toLocalDateTimeValue(item.onceAt)
  dailyTime.value = item.dailyTime
  text.value = item.text
  requireConfirm.value = item.requireConfirm ? 'yes' : 'no'
  saveBtn.textContent = '保存修改'
  cancelBtn.hidden = false
  toggleReminderModeFields(root, item.mode)
}

function readReminderForm(root: HTMLElement) {
  const enabled = root.querySelector<HTMLInputElement>('#pet-reminder-enabled')?.checked ?? true
  const mode =
    (root.querySelector<HTMLSelectElement>('#pet-reminder-mode')?.value as ReminderMode | undefined)
    ?? 'interval-repeat'
  const minutes = Number(root.querySelector<HTMLInputElement>('#pet-reminder-minutes')?.value || 10)
  const onceAt = fromLocalDateTimeValue(
    root.querySelector<HTMLInputElement>('#pet-reminder-once-at')?.value ?? '',
  )
  const dailyTime = root.querySelector<HTMLInputElement>('#pet-reminder-daily-time')?.value ?? '18:00'
  const text = root.querySelector<HTMLInputElement>('#pet-reminder-text')?.value || '该喝水啦'
  const requireConfirm =
    (root.querySelector<HTMLSelectElement>('#pet-reminder-confirm')?.value ?? 'yes') === 'yes'
  return { enabled, mode, minutes, onceAt, dailyTime, text, requireConfirm }
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
        <p>窗口越小越不挡视线。关闭显示后宠物会从桌面消失，可随时重新开启。</p>
        <label class="pet-config-switch">
          <input id="pet-visible" type="checkbox" />
          <span>
            <strong>显示宠物</strong>
            <em>关闭后宠物窗口会隐藏，设置仍会自动保存。</em>
          </span>
        </label>
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
      <article class="pet-config-card pet-config-card--wide">
        <h2>交流提醒</h2>
        <p>可创建多条提醒。支持循环、仅一次、指定日期一次、每天定点提醒。</p>
        <div class="pet-reminder-list" id="pet-reminder-list"></div>
        <h3 class="pet-reminder-form-title">新建 / 编辑提醒</h3>
        <div class="pet-reminder-grid">
          <label class="pet-config-switch">
            <input id="pet-reminder-enabled" type="checkbox" />
            <span>
              <strong>启用此条提醒</strong>
              <em>关闭后仅暂停这一条，不影响其他提醒。</em>
            </span>
          </label>
          <label class="field">
            <span>提醒类型</span>
            <select id="pet-reminder-mode">
              <option value="interval-repeat">每隔 N 分钟（循环）</option>
              <option value="interval-once">N 分钟后（仅一次）</option>
              <option value="datetime-once">指定日期时间（仅一次）</option>
              <option value="daily-time">每天固定时间</option>
            </select>
          </label>
          <label class="field" id="pet-reminder-minutes-field">
            <span>间隔（分钟）</span>
            <input id="pet-reminder-minutes" type="number" min="1" max="1440" step="1" value="10" />
          </label>
          <label class="field" id="pet-reminder-once-at-field" hidden>
            <span>提醒时间</span>
            <input id="pet-reminder-once-at" type="datetime-local" step="${REMINDER_DATE_STEP}" />
          </label>
          <label class="field" id="pet-reminder-daily-time-field" hidden>
            <span>每日时间</span>
            <input id="pet-reminder-daily-time" type="time" value="18:00" />
          </label>
          <label class="field">
            <span>提醒内容</span>
            <input id="pet-reminder-text" type="text" value="该喝水啦" maxlength="60" />
          </label>
          <label class="field">
            <span>手动确认</span>
            <select id="pet-reminder-confirm">
              <option value="yes">是（不自动消失）</option>
              <option value="no">否（10 秒后自动消失）</option>
            </select>
          </label>
        </div>
        <div class="pet-config-actions">
          <button class="primary-button" id="pet-reminder-save" type="button">添加提醒</button>
          <button class="secondary-button" id="pet-reminder-cancel" type="button" hidden>取消编辑</button>
          <button class="secondary-button" id="pet-reminder-confirm-now" type="button">确认待处理提醒</button>
        </div>
        <p class="field-hint" id="pet-reminder-hint">可创建多条提醒。</p>
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
  window.electronAPI?.onPetEnabledChanged?.((enabled) => {
    const visible = root.querySelector<HTMLInputElement>('#pet-visible')
    if (visible) visible.checked = enabled
  })

  root.querySelector<HTMLInputElement>('#pet-visible')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement
    if (!window.electronAPI?.setPetEnabled) return
    await window.electronAPI.setPetEnabled(input.checked)
    if (window.electronAPI.getPetStatus) apply(await window.electronAPI.getPetStatus())
  })

  let editingReminderId: string | null = null

  const applyReminders = (reminders: PetReminderItem[]) => {
    renderReminderList(root, reminders, editingReminderId)
    if (editingReminderId) {
      const editing = reminders.find((item) => item.id === editingReminderId)
      if (editing) fillReminderForm(root, editing)
      else {
        editingReminderId = null
        fillReminderForm(root, null)
      }
    }
  }

  if (window.electronAPI?.getPetReminders) {
    void window.electronAPI.getPetReminders().then((reminders) => {
      applyReminders(reminders)
      fillReminderForm(root, null)
    })
  } else {
    fillReminderForm(root, null)
  }
  window.electronAPI?.onPetRemindersUpdated?.(applyReminders)

  root.querySelector<HTMLButtonElement>('#pet-reminder-save')?.addEventListener('click', async () => {
    if (!window.electronAPI?.upsertPetReminder) return
    const form = readReminderForm(root)
    const reminders = await window.electronAPI.upsertPetReminder({
      ...form,
      id: editingReminderId ?? undefined,
    })
    editingReminderId = null
    applyReminders(reminders)
    fillReminderForm(root, null)
  })

  root.querySelector<HTMLButtonElement>('#pet-reminder-cancel')?.addEventListener('click', () => {
    editingReminderId = null
    fillReminderForm(root, null)
    if (window.electronAPI?.getPetReminders) {
      void window.electronAPI.getPetReminders().then(applyReminders)
    }
  })

  root.querySelector<HTMLSelectElement>('#pet-reminder-mode')?.addEventListener('change', () => {
    const mode =
      (root.querySelector<HTMLSelectElement>('#pet-reminder-mode')?.value as ReminderMode | undefined)
      ?? 'interval-repeat'
    toggleReminderModeFields(root, mode)
  })

  root
    .querySelector<HTMLButtonElement>('#pet-reminder-confirm-now')
    ?.addEventListener('click', async () => {
      if (!window.electronAPI?.confirmPetReminder) return
      applyReminders(await window.electronAPI.confirmPetReminder())
    })

  root.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement
    const editId = target.closest<HTMLButtonElement>('[data-reminder-edit]')?.dataset.reminderEdit
    const deleteId = target.closest<HTMLButtonElement>('[data-reminder-delete]')?.dataset.reminderDelete

    if (editId && window.electronAPI?.getPetReminders) {
      const reminders = await window.electronAPI.getPetReminders()
      const item = reminders.find((r) => r.id === editId)
      if (item) {
        editingReminderId = editId
        fillReminderForm(root, item)
        applyReminders(reminders)
      }
      return
    }

    if (deleteId && window.electronAPI?.deletePetReminder) {
      const reminders = await window.electronAPI.deletePetReminder(deleteId)
      if (editingReminderId === deleteId) {
        editingReminderId = null
        fillReminderForm(root, null)
      }
      applyReminders(reminders)
      return
    }

    const characterButton = target.closest<HTMLButtonElement>('button[data-character]')
    if (characterButton?.dataset.character && window.electronAPI?.setPetCharacter) {
      apply(await window.electronAPI.setPetCharacter(characterButton.dataset.character))
    }
  })

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
}
