import type { PetCharacter } from '../electron/petCharacters'
import type { PetReminderItem, PetStatus } from '../electron/pet'
import {
  ELEMENT_EMOJI,
  formatPersonalitySummary,
  GENDER_LABELS,
} from '../electron/petProfile'

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

function barClass(value: number) {
  if (value <= 25) return 'pet-stat-fill--danger'
  if (value <= 50) return 'pet-stat-fill--warn'
  return ''
}

function moodText(status: PetStatus) {
  if (status.health <= 20) return '身体很虚弱，先让它休息。'
  if (status.satiety <= 10) return '饿坏了，马上喂食。'
  if (status.satiety <= 30) return '非常饿，快准备点吃的。'
  if (status.satiety <= 60) return '有点饿了，等会记得喂它。'
  if (status.hygiene <= 10) return '脏兮兮的，需要立刻清洁。'
  if (status.hygiene <= 30) return '已经有点脏了，洗洗会更舒服。'
  if (status.mood <= 40) return '心情不太好，多陪陪它。'
  if (status.mood >= 85) return '心情很好，状态在线。'
  return '还不错，继续保持。'
}

function renderProfile(root: HTMLElement, status: PetStatus) {
  const profile = status.profile
  const name = root.querySelector<HTMLInputElement>('#pet-profile-name')
  const gender = root.querySelector<HTMLElement>('#pet-profile-gender')
  const title = root.querySelector<HTMLElement>('#pet-profile-title')
  const level = root.querySelector<HTMLElement>('#pet-profile-level')
  const growth = root.querySelector<HTMLElement>('#pet-profile-growth')
  const birthday = root.querySelector<HTMLElement>('#pet-profile-birthday')
  const createdAt = root.querySelector<HTMLElement>('#pet-profile-created-at')
  const personality = root.querySelector<HTMLElement>('#pet-profile-personality')
  const traits = root.querySelector<HTMLElement>('#pet-profile-traits')
  const coins = root.querySelector<HTMLElement>('#pet-profile-coins')
  if (
    !name ||
    !gender ||
    !title ||
    !level ||
    !growth ||
    !birthday ||
    !createdAt ||
    !personality ||
    !traits ||
    !coins
  ) {
    return
  }

  if (document.activeElement !== name) name.value = profile.name
  gender.textContent = GENDER_LABELS[profile.gender]
  title.textContent = profile.title
  level.textContent = String(profile.level)
  growth.textContent = String(profile.growth)
  birthday.textContent = profile.birthday
  createdAt.textContent = profile.createdAt
  personality.textContent = formatPersonalitySummary(profile.personality)
  traits.innerHTML = profile.personality.traits
    .map((trait) => `<span class="pet-trait-tag">${trait}</span>`)
    .join('')
  coins.textContent = String(profile.coins)
}

function renderStatus(root: HTMLElement, status: PetStatus) {
  const visible = root.querySelector<HTMLInputElement>('#pet-visible')
  const walk = root.querySelector<HTMLInputElement>('#pet-auto-walk')
  const size = root.querySelector<HTMLInputElement>('#pet-size')
  const sizeValue = root.querySelector<HTMLElement>('#pet-size-value')
  const satietyValue = root.querySelector<HTMLElement>('#pet-satiety-value')
  const hygieneValue = root.querySelector<HTMLElement>('#pet-hygiene-value')
  const healthValue = root.querySelector<HTMLElement>('#pet-health-value')
  const moodValue = root.querySelector<HTMLElement>('#pet-mood-value')
  const satietyFill = root.querySelector<HTMLElement>('#pet-satiety-fill')
  const hygieneFill = root.querySelector<HTMLElement>('#pet-hygiene-fill')
  const healthFill = root.querySelector<HTMLElement>('#pet-health-fill')
  const moodFill = root.querySelector<HTMLElement>('#pet-mood-fill')
  const mood = root.querySelector<HTMLElement>('#pet-mood')
  if (
    !visible ||
    !walk ||
    !size ||
    !sizeValue ||
    !satietyValue ||
    !hygieneValue ||
    !healthValue ||
    !moodValue ||
    !satietyFill ||
    !hygieneFill ||
    !healthFill ||
    !moodFill ||
    !mood
  ) {
    return
  }

  visible.checked = status.enabled
  walk.checked = status.autoWalk
  if (document.activeElement !== size) size.value = String(status.size)
  sizeValue.textContent = `${status.size} px`
  satietyValue.textContent = `${status.satiety}`
  hygieneValue.textContent = `${status.hygiene}`
  healthValue.textContent = `${status.health}`
  moodValue.textContent = `${status.mood}`
  satietyFill.style.width = `${status.satiety}%`
  hygieneFill.style.width = `${status.hygiene}%`
  healthFill.style.width = `${status.health}%`
  moodFill.style.width = `${status.mood}%`
  satietyFill.className = `pet-stat-fill ${barClass(status.satiety)}`
  hygieneFill.className = `pet-stat-fill ${barClass(status.hygiene)}`
  healthFill.className = `pet-stat-fill ${barClass(status.health)}`
  moodFill.className = `pet-stat-fill ${barClass(status.mood)}`
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

export type PetSettingsTab = 'profile' | 'character' | 'appearance' | 'status' | 'reminders'

export function switchPetSettingsTab(tab: PetSettingsTab) {
  document.querySelectorAll<HTMLButtonElement>('[data-pet-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.petTab === tab)
  })
  const root = document.querySelector<HTMLElement>('#pet-settings-root')
  if (!root) return
  root.querySelectorAll<HTMLElement>('[data-pet-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.petPanel !== tab
    panel.classList.toggle('is-active', panel.dataset.petPanel === tab)
  })
}

export function mountPetSettingsPage() {
  const root = document.querySelector<HTMLElement>('#pet-settings-root')
  if (!root) return

  root.innerHTML = `
    <div class="pet-settings-content">
        <section class="pet-settings-panel is-active" data-pet-panel="profile">
          <article class="pet-config-card">
            <h2>基础信息</h2>
            <p>首次打开时会随机生成名字、性别与性格。等级与成长会在后续玩法中提升。</p>
            <div class="pet-profile-grid">
              <label class="field">
                <span>名称</span>
                <input id="pet-profile-name" type="text" maxlength="12" />
              </label>
              <div class="pet-profile-item">
                <span>性别</span>
                <strong id="pet-profile-gender">-</strong>
              </div>
              <div class="pet-profile-item">
                <span>称号</span>
                <strong id="pet-profile-title">-</strong>
              </div>
              <div class="pet-profile-item">
                <span>等级</span>
                <strong id="pet-profile-level">0</strong>
              </div>
              <div class="pet-profile-item">
                <span>成长</span>
                <strong id="pet-profile-growth">0</strong>
              </div>
              <div class="pet-profile-item">
                <span>生日</span>
                <strong id="pet-profile-birthday">-</strong>
              </div>
              <div class="pet-profile-item">
                <span>初遇时间</span>
                <strong id="pet-profile-created-at">-</strong>
              </div>
              <div class="pet-profile-item">
                <span>金币</span>
                <strong id="pet-profile-coins">0</strong>
              </div>
              <div class="pet-profile-item pet-profile-item--wide">
                <span>性格</span>
                <strong id="pet-profile-personality">-</strong>
              </div>
              <div class="pet-profile-item pet-profile-item--wide">
                <span>性格关键词</span>
                <div class="pet-trait-list" id="pet-profile-traits"></div>
              </div>
            </div>
            <div class="pet-config-actions">
              <button class="primary-button" id="pet-profile-save" type="button">保存名称</button>
            </div>
            <p class="field-hint">元素性格：${ELEMENT_EMOJI.fire}火象 ${ELEMENT_EMOJI.earth}土象 ${ELEMENT_EMOJI.air}风象 ${ELEMENT_EMOJI.water}水象。不同元素会影响状态变化速度。</p>
          </article>
        </section>
        <section class="pet-settings-panel" data-pet-panel="character" hidden>
          <article class="pet-config-card">
            <h2>形象</h2>
            <p>每个角色一个文件夹。以后把新动画放到 <code>donghua/角色id/</code>，包含 <code>.skel</code>、<code>.atlas</code>、<code>.png</code> 和可选的 <code>meta.json</code>。</p>
            <div class="pet-character-grid" id="pet-characters"></div>
          </article>
        </section>
        <section class="pet-settings-panel" data-pet-panel="appearance" hidden>
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
        </section>
        <section class="pet-settings-panel" data-pet-panel="status" hidden>
          <article class="pet-config-card">
            <h2>状态</h2>
            <p id="pet-mood">精神很好，状态在线。</p>
            <div class="pet-stat">
              <div class="pet-stat-label">
                <span>饱食度</span>
                <strong id="pet-satiety-value">100</strong>
              </div>
              <div class="pet-stat-bar"><div class="pet-stat-fill" id="pet-satiety-fill"></div></div>
            </div>
            <div class="pet-stat">
              <div class="pet-stat-label">
                <span>卫生</span>
                <strong id="pet-hygiene-value">100</strong>
              </div>
              <div class="pet-stat-bar"><div class="pet-stat-fill" id="pet-hygiene-fill"></div></div>
            </div>
            <div class="pet-stat">
              <div class="pet-stat-label">
                <span>健康</span>
                <strong id="pet-health-value">100</strong>
              </div>
              <div class="pet-stat-bar"><div class="pet-stat-fill" id="pet-health-fill"></div></div>
              <p class="field-hint">数值越高越好。饱食度每小时约 -5，卫生每小时约 -2；过低时健康才会下降。</p>
            </div>
            <div class="pet-stat">
              <div class="pet-stat-label">
                <span>心情</span>
                <strong id="pet-mood-value">100</strong>
              </div>
              <div class="pet-stat-bar"><div class="pet-stat-fill" id="pet-mood-fill"></div></div>
              <p class="field-hint">当前先作为综合状态展示，后续会接入互动、小游戏、陪伴等玩法。</p>
            </div>
            <div class="pet-config-actions">
              <button class="primary-button" id="pet-feed" type="button">喂食</button>
              <button class="secondary-button" id="pet-clean" type="button">清洁</button>
              <button class="secondary-button" id="pet-rest" type="button">休息</button>
            </div>
          </article>
        </section>
        <section class="pet-settings-panel" data-pet-panel="reminders" hidden>
          <article class="pet-config-card">
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
        </section>
    </div>
  `

  document.querySelectorAll<HTMLButtonElement>('#pet-settings-nav [data-pet-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.petTab as PetSettingsTab | undefined
      if (!tab) return
      switchPetSettingsTab(tab)
    })
  })

  const apply = (status: PetStatus) => {
    renderProfile(root, status)
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
      switchPetSettingsTab('reminders')
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

  root.querySelector<HTMLButtonElement>('#pet-clean')?.addEventListener('click', async () => {
    if (!window.electronAPI?.cleanPet) return
    apply(await window.electronAPI.cleanPet())
  })

  root.querySelector<HTMLButtonElement>('#pet-rest')?.addEventListener('click', async () => {
    if (!window.electronAPI?.restPet) return
    apply(await window.electronAPI.restPet())
  })

  root.querySelector<HTMLButtonElement>('#pet-profile-save')?.addEventListener('click', async () => {
    if (!window.electronAPI?.updatePetProfile) return
    const name = root.querySelector<HTMLInputElement>('#pet-profile-name')?.value.trim()
    if (!name) return
    apply(await window.electronAPI.updatePetProfile({ name }))
  })
}
