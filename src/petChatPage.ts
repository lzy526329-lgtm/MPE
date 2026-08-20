import type { PetAiReply, PetAiSettingsView, PetChatHistoryItem } from '../electron/petAi'
import type { PetStatus } from '../electron/pet'
import { onPageChange } from './appNavigation'

type ChatItem = PetChatHistoryItem

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function statusSummary(status: PetStatus) {
  return `${status.profile.name} · 饱食 ${status.satiety} · 卫生 ${status.hygiene} · 健康 ${status.health} · 心情 ${status.mood}`
}

export function mountPetChatPage() {
  const root = document.querySelector<HTMLElement>('#pet-chat-root')
  if (!root) return

  const settingsToggle = root.querySelector<HTMLButtonElement>('#pet-ai-settings-toggle')!
  const settingsPanel = root.querySelector<HTMLElement>('#pet-ai-settings')!
  const apiKeyInput = root.querySelector<HTMLInputElement>('#pet-ai-api-key')!
  const keyHint = root.querySelector<HTMLElement>('#pet-ai-key-hint')!
  const modelMeta = root.querySelector<HTMLElement>('#pet-ai-model-meta')!
  const modelChip = root.querySelector<HTMLElement>('#pet-ai-model-chip')!
  const saveKeyButton = root.querySelector<HTMLButtonElement>('#pet-ai-save-key')!
  const clearKeyButton = root.querySelector<HTMLButtonElement>('#pet-ai-clear-key')!
  const statusBar = root.querySelector<HTMLElement>('#pet-chat-status')!
  const messagesEl = root.querySelector<HTMLElement>('#pet-chat-messages')!
  const inputEl = root.querySelector<HTMLTextAreaElement>('#pet-chat-input')!
  const sendButton = root.querySelector<HTMLButtonElement>('#pet-chat-send')!
  const clearHistoryButton = root.querySelector<HTMLButtonElement>('#pet-chat-clear-history')!
  const clearMemoryButton = root.querySelector<HTMLButtonElement>('#pet-chat-clear-memory')!
  const errorEl = root.querySelector<HTMLElement>('#pet-chat-error')!

  let settings: PetAiSettingsView = {
    hasApiKey: false,
    apiKeyHint: '',
    model: 'deepseek-v4-flash',
  }
  let messages: ChatItem[] = []
  let sending = false
  let petName = '宠物'

  function setError(text: string) {
    errorEl.textContent = text
  }

  function autosizeInput() {
    const maxHeight = 160
    const minHeight = 34
    inputEl.style.height = '0px'
    inputEl.style.overflowY = 'hidden'
    const next = Math.min(Math.max(inputEl.scrollHeight, minHeight), maxHeight)
    inputEl.style.height = `${next}px`
    inputEl.style.overflowY = next >= maxHeight ? 'auto' : 'hidden'
  }

  function setSettingsOpen(open: boolean) {
    settingsPanel.hidden = !open
    settingsToggle.setAttribute('aria-expanded', String(open))
    settingsToggle.classList.toggle('is-active', open)
  }

  function updateKeyUi() {
    modelMeta.textContent = settings.hasApiKey ? `${settings.model} · 已连接` : `${settings.model} · 未配置`
    keyHint.textContent = settings.hasApiKey ? `已保存 Key：${settings.apiKeyHint}` : '尚未配置 API Key'
    modelChip.classList.toggle('is-ready', settings.hasApiKey)
    settingsToggle.classList.toggle('is-ready', settings.hasApiKey)
    sendButton.disabled = sending || !settings.hasApiKey
  }

  function renderMessages() {
    if (messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="pet-chat-empty">
          <strong>和${escapeHtml(petName)}聊聊吧</strong>
          <p>可以说「查看电脑信息」，会打开对应工具页，并由宠物口头总结。</p>
        </div>
      `
      return
    }

    messagesEl.innerHTML = messages
      .map((item) => {
        if (item.role === 'skill') {
          return `
            <div class="pet-chat-skill-note">
              <span>已打开工具</span>
              <strong>${escapeHtml(item.text)}</strong>
            </div>
          `
        }
        const roleLabel = item.role === 'user' ? '你' : petName
        return `
          <article class="pet-chat-row pet-chat-row--${item.role}">
            <div class="pet-chat-avatar" aria-hidden="true">${item.role === 'user' ? '你' : '宠'}</div>
            <div class="pet-chat-content">
              <span class="pet-chat-bubble-role">${escapeHtml(roleLabel)}</span>
              <p>${escapeHtml(item.text)}</p>
            </div>
          </article>
        `
      })
      .join('')
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  async function loadHistory() {
    try {
      messages = await window.electronAPI.petAiGetHistory()
      renderMessages()
    } catch {
      messages = []
      renderMessages()
    }
  }

  async function refreshStatus() {
    try {
      const status = await window.electronAPI.getPetStatus()
      petName = status.profile.name
      statusBar.textContent = statusSummary(status)
      if (messages.length === 0) renderMessages()
    } catch {
      statusBar.textContent = '无法读取宠物状态'
    }
  }

  async function loadSettings() {
    settings = await window.electronAPI.petAiGetSettings()
    updateKeyUi()
    if (!settings.hasApiKey) setSettingsOpen(true)
  }

  settingsToggle.addEventListener('click', () => {
    setSettingsOpen(settingsPanel.hidden)
  })

  saveKeyButton.addEventListener('click', async () => {
    setError('')
    try {
      settings = await window.electronAPI.petAiSaveSettings({
        apiKey: apiKeyInput.value.trim(),
      })
      apiKeyInput.value = ''
      updateKeyUi()
      if (settings.hasApiKey) setSettingsOpen(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败')
    }
  })

  clearKeyButton.addEventListener('click', async () => {
    setError('')
    try {
      settings = await window.electronAPI.petAiClearSettings()
      apiKeyInput.value = ''
      updateKeyUi()
      setSettingsOpen(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : '清除失败')
    }
  })

  clearHistoryButton.addEventListener('click', async () => {
    setError('')
    clearHistoryButton.disabled = true
    const prevLabel = clearHistoryButton.textContent
    clearHistoryButton.textContent = '保存记忆…'
    try {
      messages = await window.electronAPI.petAiClearHistory()
      renderMessages()
    } catch (error) {
      setError(error instanceof Error ? error.message : '清空失败')
    } finally {
      clearHistoryButton.disabled = false
      clearHistoryButton.textContent = prevLabel || '新对话'
    }
  })

  clearMemoryButton.addEventListener('click', async () => {
    setError('')
    const ok = window.confirm('确定清除宠物的长期记忆吗？喂食、改名、对话摘要都会删掉，且无法恢复。')
    if (!ok) return
    try {
      const result = await window.electronAPI.petAiClearMemory()
      const prev = statusBar.textContent
      statusBar.textContent =
        result.cleared > 0 ? `已清除 ${result.cleared} 条记忆` : '当前没有可清除的记忆'
      window.setTimeout(() => {
        if (statusBar.textContent.startsWith('已清除') || statusBar.textContent === '当前没有可清除的记忆') {
          statusBar.textContent = prev || ''
        }
      }, 2500)
    } catch (error) {
      setError(error instanceof Error ? error.message : '清除记忆失败')
    }
  })

  async function sendMessage() {
    const text = inputEl.value.trim()
    if (!text || sending) return
    if (!settings.hasApiKey) {
      setError('请先配置 DeepSeek API Key')
      setSettingsOpen(true)
      return
    }

    setError('')
    sending = true
    sendButton.disabled = true
    inputEl.disabled = true

    messages.push({ role: 'user', text })
    renderMessages()
    inputEl.value = ''
    autosizeInput()

    try {
      await window.electronAPI.petAiSend(text)
      messages = await window.electronAPI.petAiGetHistory()
      renderMessages()
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败'
      setError(message)
      messages.pop()
      messages.push({ role: 'assistant', text: `（发送失败：${message}）` })
      renderMessages()
    } finally {
      sending = false
      inputEl.disabled = false
      updateKeyUi()
      inputEl.focus()
    }
  }

  sendButton.addEventListener('click', () => void sendMessage())
  inputEl.addEventListener('input', autosizeInput)
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  })

  onPageChange((pageId) => {
    if (pageId === 'pet-chat-page') void loadHistory()
  })

  void loadSettings()
  void refreshStatus()
  void loadHistory()
  autosizeInput()

  window.electronAPI.onPetStatusChanged?.((status) => {
    petName = status.profile.name
    statusBar.textContent = statusSummary(status)
  })
}
