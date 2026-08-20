import type { PetAiReply, PetAiSettingsView } from '../electron/petAi'
import type { PetStatus } from '../electron/pet'

type ChatItem = {
  role: 'user' | 'assistant'
  text: string
}

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function statusSummary(status: PetStatus) {
  return `饱食 ${status.satiety} · 卫生 ${status.hygiene} · 健康 ${status.health} · 心情 ${status.mood}`
}

export function mountPetChatPage() {
  const root = document.querySelector<HTMLElement>('#pet-chat-root')
  if (!root) return

  const apiKeyInput = root.querySelector<HTMLInputElement>('#pet-ai-api-key')!
  const keyHint = root.querySelector<HTMLElement>('#pet-ai-key-hint')!
  const saveKeyButton = root.querySelector<HTMLButtonElement>('#pet-ai-save-key')!
  const clearKeyButton = root.querySelector<HTMLButtonElement>('#pet-ai-clear-key')!
  const statusBar = root.querySelector<HTMLElement>('#pet-chat-status')!
  const messagesEl = root.querySelector<HTMLElement>('#pet-chat-messages')!
  const inputEl = root.querySelector<HTMLTextAreaElement>('#pet-chat-input')!
  const sendButton = root.querySelector<HTMLButtonElement>('#pet-chat-send')!
  const clearHistoryButton = root.querySelector<HTMLButtonElement>('#pet-chat-clear-history')!
  const errorEl = root.querySelector<HTMLElement>('#pet-chat-error')!

  let settings: PetAiSettingsView = {
    hasApiKey: false,
    apiKeyHint: '',
    model: 'deepseek-v4-flash',
  }
  let messages: ChatItem[] = []
  let sending = false

  function setError(text: string) {
    errorEl.textContent = text
  }

  function updateKeyUi() {
    keyHint.textContent = settings.hasApiKey
      ? `已保存 Key：${settings.apiKeyHint} · 模型：deepseek-v4-flash（经济档）`
      : '尚未配置 API Key · 对话使用 deepseek-v4-flash（最便宜）'
    sendButton.disabled = sending || !settings.hasApiKey
  }

  function renderMessages() {
    if (messages.length === 0) {
      messagesEl.innerHTML =
        '<p class="pet-chat-empty">右键桌宠选择「与我对话」，或在这里和宠物聊天吧。</p>'
      return
    }
    messagesEl.innerHTML = messages
      .map((item) => {
        const roleLabel = item.role === 'user' ? '你' : '宠物'
        return `
          <article class="pet-chat-bubble pet-chat-bubble--${item.role}">
            <span class="pet-chat-bubble-role">${roleLabel}</span>
            <p>${escapeHtml(item.text)}</p>
          </article>
        `
      })
      .join('')
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  async function refreshStatus() {
    try {
      const status = await window.electronAPI.getPetStatus()
      statusBar.textContent = `${status.profile.name} · ${statusSummary(status)}`
    } catch {
      statusBar.textContent = '无法读取宠物状态'
    }
  }

  async function loadSettings() {
    settings = await window.electronAPI.petAiGetSettings()
    updateKeyUi()
  }

  saveKeyButton.addEventListener('click', async () => {
    setError('')
    try {
      settings = await window.electronAPI.petAiSaveSettings({
        apiKey: apiKeyInput.value.trim(),
      })
      apiKeyInput.value = ''
      updateKeyUi()
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
    } catch (error) {
      setError(error instanceof Error ? error.message : '清除失败')
    }
  })

  clearHistoryButton.addEventListener('click', async () => {
    setError('')
    try {
      await window.electronAPI.petAiClearHistory()
      messages = []
      renderMessages()
    } catch (error) {
      setError(error instanceof Error ? error.message : '清空失败')
    }
  })

  async function sendMessage() {
    const text = inputEl.value.trim()
    if (!text || sending) return
    if (!settings.hasApiKey) {
      setError('请先保存 DeepSeek API Key')
      return
    }

    setError('')
    sending = true
    sendButton.disabled = true
    sendButton.textContent = '发送中…'
    inputEl.disabled = true

    messages.push({ role: 'user', text })
    renderMessages()
    inputEl.value = ''

    try {
      const reply: PetAiReply = await window.electronAPI.petAiSend(text)
      messages.push({ role: 'assistant', text: reply.text })
      renderMessages()
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败'
      setError(message)
      messages.push({ role: 'assistant', text: `（发送失败：${message}）` })
      renderMessages()
    } finally {
      sending = false
      inputEl.disabled = false
      sendButton.textContent = '发送'
      updateKeyUi()
      inputEl.focus()
    }
  }

  sendButton.addEventListener('click', () => void sendMessage())
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  })

  void loadSettings()
  void refreshStatus()
  renderMessages()

  window.electronAPI.onPetStatusChanged?.((status) => {
    statusBar.textContent = `${status.profile.name} · ${statusSummary(status)}`
  })
}
