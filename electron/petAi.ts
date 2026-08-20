import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { buildPetSystemPrompt } from './petContextBuilder'
import { getPetStatus } from './pet'

/** DeepSeek 最便宜档，适合桌宠短对话 */
export const PET_AI_MODEL = 'deepseek-v4-flash'

export type EmotionTag = 'happy' | 'sad' | 'hungry' | 'angry' | 'sleep' | 'neutral'

export type PetAiSettingsView = {
  hasApiKey: boolean
  apiKeyHint: string
  model: typeof PET_AI_MODEL
}

export type PetAiReply = {
  text: string
  emotion: EmotionTag
}

type StoredAiSettings = {
  apiKey: string
  baseUrl: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const MAX_HISTORY = 20

let conversationHistory: ChatMessage[] = []
let ipcRegistered = false

function aiSettingsFile() {
  return path.join(app.getPath('userData'), 'ai-settings.json')
}

function readAiSettings(): StoredAiSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(aiSettingsFile(), 'utf8')) as Partial<StoredAiSettings>
    return {
      apiKey: String(raw.apiKey ?? ''),
      baseUrl: String(raw.baseUrl ?? DEFAULT_BASE_URL),
    }
  } catch {
    return { apiKey: '', baseUrl: DEFAULT_BASE_URL }
  }
}

function writeAiSettings(patch: Partial<StoredAiSettings>) {
  const next = { ...readAiSettings(), ...patch }
  fs.mkdirSync(path.dirname(aiSettingsFile()), { recursive: true })
  fs.writeFileSync(aiSettingsFile(), JSON.stringify(next, null, 2))
}

function settingsView(): PetAiSettingsView {
  const settings = readAiSettings()
  const hint =
    settings.apiKey.length >= 4 ? `****${settings.apiKey.slice(-4)}` : ''
  return {
    hasApiKey: settings.apiKey.length > 0,
    apiKeyHint: hint,
    model: PET_AI_MODEL,
  }
}

function inferEmotionFromStatus(status: ReturnType<typeof getPetStatus>): EmotionTag {
  if (status.satiety < 20) return 'hungry'
  if (status.mood < 40) return 'sad'
  if (status.mood >= 85) return 'happy'
  return 'neutral'
}

function bubbleSnippet(text: string) {
  const line = text.split('\n').find((item) => item.trim())?.trim() ?? text.trim()
  return line.length > 120 ? `${line.slice(0, 117)}…` : line
}

async function callDeepSeek(messages: Array<{ role: string; content: string }>) {
  const settings = readAiSettings()
  if (!settings.apiKey) {
    throw new Error('请先在对话页配置 DeepSeek API Key')
  }

  const baseUrl = settings.baseUrl.replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: PET_AI_MODEL,
      messages,
      stream: false,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`DeepSeek API 错误 (${response.status})：${detail.slice(0, 240)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('DeepSeek 返回了空回复')
  return content
}

export function registerPetAiIpc(getPetWindow: () => BrowserWindow | null) {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('pet:ai-get-settings', () => settingsView())

  ipcMain.handle('pet:ai-save-settings', (_event, input: { apiKey?: string }) => {
    const patch: Partial<StoredAiSettings> = {}
    if (input.apiKey !== undefined) patch.apiKey = String(input.apiKey).trim()
    writeAiSettings(patch)
    return settingsView()
  })

  ipcMain.handle('pet:ai-clear-settings', () => {
    writeAiSettings({ apiKey: '' })
    return settingsView()
  })

  ipcMain.handle('pet:ai-clear-history', () => {
    conversationHistory = []
  })

  ipcMain.handle('pet:ai-send', async (_event, text: string) => {
    const playerText = String(text ?? '').trim()
    if (!playerText) throw new Error('请输入消息')

    const status = getPetStatus()
    const systemPrompt = buildPetSystemPrompt(status)

    conversationHistory.push({ role: 'user', content: playerText })
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY)
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((item) => ({ role: item.role, content: item.content })),
    ]

    const replyText = await callDeepSeek(messages)
    conversationHistory.push({ role: 'assistant', content: replyText })
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY)
    }

    const emotion = inferEmotionFromStatus(status)
    const petWin = getPetWindow()
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send('pet:ai-bubble', { text: bubbleSnippet(replyText) })
    }

    return { text: replyText, emotion } satisfies PetAiReply
  })
}
