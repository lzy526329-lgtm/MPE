import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { buildPetSystemPrompt } from './petContextBuilder'
import { getPetStatus } from './pet'
import type { AppPageId } from './appPages'
import {
  clearPetMemory,
  getRecentMemorySnippets,
  rememberConversationSummary,
} from './petMemory'
import {
  looksLikeWatermarkRequest,
  PET_AI_TOOLS,
  PET_SKILL_LABELS,
  runPetSkill,
  type PetSkillId,
  type PetSkillPrefill,
} from './petSkills'

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
  usedSkills?: Array<{ id: string; label: string }>
  openPage?: AppPageId
}

/** 对话页展示用消息（含工具提示） */
export type PetChatHistoryItem = {
  role: 'user' | 'assistant' | 'skill'
  text: string
}

type StoredAiSettings = {
  apiKey: string
  baseUrl: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type StoredChatHistory = {
  llm: ChatMessage[]
  display: PetChatHistoryItem[]
  updatedAt: string
}

type ApiMessage =
  | { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }

type DeepSeekMessage = {
  role?: string
  content?: string | null
  tool_calls?: Array<{
    id: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const MAX_HISTORY = 20
const MAX_DISPLAY_HISTORY = 100
const MAX_TOOL_ROUNDS = 3

let conversationHistory: ChatMessage[] = []
let displayHistory: PetChatHistoryItem[] = []
let ipcRegistered = false
let historyHydrated = false

function aiSettingsFile() {
  return path.join(app.getPath('userData'), 'ai-settings.json')
}

function chatHistoryFile() {
  return path.join(app.getPath('userData'), 'chat-history.json')
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

function persistChatHistory() {
  const payload: StoredChatHistory = {
    llm: conversationHistory.slice(-MAX_HISTORY),
    display: displayHistory.slice(-MAX_DISPLAY_HISTORY),
    updatedAt: new Date().toISOString(),
  }
  fs.mkdirSync(path.dirname(chatHistoryFile()), { recursive: true })
  fs.writeFileSync(chatHistoryFile(), JSON.stringify(payload, null, 2))
}

function hydrateChatHistory() {
  if (historyHydrated) return
  historyHydrated = true
  try {
    const raw = JSON.parse(fs.readFileSync(chatHistoryFile(), 'utf8')) as Partial<StoredChatHistory>
    const llm = Array.isArray(raw.llm) ? raw.llm : []
    const display = Array.isArray(raw.display) ? raw.display : []
    conversationHistory = llm
      .filter(
        (item): item is ChatMessage =>
          Boolean(item) &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string',
      )
      .slice(-MAX_HISTORY)
    displayHistory = display
      .filter(
        (item): item is PetChatHistoryItem =>
          Boolean(item) &&
          (item.role === 'user' || item.role === 'assistant' || item.role === 'skill') &&
          typeof item.text === 'string',
      )
      .slice(-MAX_DISPLAY_HISTORY)

    // 旧文件只有 llm 时，用它回填展示列表
    if (displayHistory.length === 0 && conversationHistory.length > 0) {
      displayHistory = conversationHistory.map((item) => ({
        role: item.role,
        text: item.content,
      }))
    }
  } catch {
    conversationHistory = []
    displayHistory = []
  }
}

function clearPersistedChatHistory() {
  conversationHistory = []
  displayHistory = []
  historyHydrated = true
  try {
    if (fs.existsSync(chatHistoryFile())) fs.unlinkSync(chatHistoryFile())
  } catch {
    persistChatHistory()
  }
}

function appendDisplayTurn(
  playerText: string,
  replyText: string,
  usedSkills?: Array<{ id: string; label: string }>,
) {
  displayHistory.push({ role: 'user', text: playerText })
  if (usedSkills?.length) {
    for (const skill of usedSkills) {
      displayHistory.push({ role: 'skill', text: skill.label })
    }
  }
  displayHistory.push({ role: 'assistant', text: replyText })
  if (displayHistory.length > MAX_DISPLAY_HISTORY) {
    displayHistory = displayHistory.slice(-MAX_DISPLAY_HISTORY)
  }
  persistChatHistory()
}

function settingsView(): PetAiSettingsView {
  const settings = readAiSettings()
  const hint = settings.apiKey.length >= 4 ? `****${settings.apiKey.slice(-4)}` : ''
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

async function callDeepSeek(messages: ApiMessage[], withTools: boolean) {
  const settings = readAiSettings()
  if (!settings.apiKey) {
    throw new Error('请先在对话页配置 DeepSeek API Key')
  }

  const baseUrl = settings.baseUrl.replace(/\/$/, '')
  const body: Record<string, unknown> = {
    model: PET_AI_MODEL,
    messages,
    stream: false,
  }
  if (withTools) body.tools = PET_AI_TOOLS

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`DeepSeek API 错误 (${response.status})：${detail.slice(0, 240)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: DeepSeekMessage }>
  }
  const message = payload.choices?.[0]?.message
  if (!message) throw new Error('DeepSeek 返回了空回复')
  return message
}

type OpenMainPageFn = (pageId: AppPageId, prefill?: PetSkillPrefill) => void

function applySkillOpen(
  result: Awaited<ReturnType<typeof runPetSkill>>,
  openMainPage: OpenMainPageFn | undefined,
) {
  if (!result.openPage) return undefined
  openMainPage?.(result.openPage, result.prefill)
  return result.openPage
}

async function summarizeConversationTurn(userText: string, assistantText: string) {
  const message = await callDeepSeek(
    [
      {
        role: 'system',
        content:
          '你是宠物记忆记录员。请用一句话、不超过30字、从宠物第一人称视角总结本次对话发生了什么。只输出摘要本身，不要引号或解释。',
      },
      {
        role: 'user',
        content: `玩家说：${userText.slice(0, 400)}\n你回复：${assistantText.slice(0, 400)}`,
      },
    ],
    false,
  )
  return message.content?.trim() ?? ''
}

async function storeTurnMemory(petId: string, userText: string, assistantText: string) {
  try {
    const summary = await summarizeConversationTurn(userText, assistantText)
    if (summary) rememberConversationSummary(petId, summary)
  } catch {
    // 摘要失败不影响主对话
  }
}

async function runChatWithSkills(playerText: string, openMainPage?: OpenMainPageFn) {
  hydrateChatHistory()
  const status = getPetStatus()
  const memorySnippets = getRecentMemorySnippets(status.profile.id)
  const systemPrompt = buildPetSystemPrompt(status, memorySnippets)
  const usedSkills: Array<{ id: string; label: string }> = []
  let openPage: AppPageId | undefined

  conversationHistory.push({ role: 'user', content: playerText })
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY)
  }

  const messages: ApiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((item) => ({ role: item.role, content: item.content })),
  ]

  let replyText = ''

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const message = await callDeepSeek(messages, true)
      const toolCalls = message.tool_calls?.filter((item) => item.function?.name) ?? []

      if (toolCalls.length === 0) {
        replyText = message.content?.trim() ?? ''
        break
      }

      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: toolCalls.map((item) => ({
          id: item.id,
          type: 'function' as const,
          function: {
            name: item.function?.name ?? '',
            arguments: item.function?.arguments ?? '{}',
          },
        })),
      })

      for (const toolCall of toolCalls) {
        const name = toolCall.function?.name ?? ''
        let result = await runPetSkill(name, toolCall.function?.arguments ?? '{}')
        if (result.id === 'open_watermark_tool' && !result.prefill?.input) {
          result = await runPetSkill(
            'open_watermark_tool',
            JSON.stringify({ share_text: playerText }),
          )
        }
        usedSkills.push({
          id: result.id,
          label: PET_SKILL_LABELS[result.id as PetSkillId] ?? result.label,
        })
        openPage = applySkillOpen(result, openMainPage) ?? openPage
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content,
        })
      }
    }

    // 模型没调工具时：识别去水印意图并兜底打开工具页
    if (
      !usedSkills.some((item) => item.id === 'open_watermark_tool') &&
      looksLikeWatermarkRequest(playerText)
    ) {
      const result = await runPetSkill(
        'open_watermark_tool',
        JSON.stringify({ share_text: playerText }),
      )
      usedSkills.push({
        id: result.id,
        label: PET_SKILL_LABELS[result.id] ?? result.label,
      })
      openPage = applySkillOpen(result, openMainPage) ?? openPage
      replyText = `${status.profile.name}帮你打开去水印工具啦，链接也填好了，点「开始解析」就行~`
    }

    if (!replyText) {
      const fallback = await callDeepSeek(messages, false)
      replyText = fallback.content?.trim() ?? ''
    }

    if (!replyText) throw new Error('DeepSeek 返回了空回复')
  } catch (error) {
    // 请求失败时回滚本轮刚写入的 user，避免脏历史
    const last = conversationHistory[conversationHistory.length - 1]
    if (last?.role === 'user' && last.content === playerText) {
      conversationHistory.pop()
    }
    throw error
  }

  conversationHistory.push({ role: 'assistant', content: replyText })
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY)
  }

  const uniqueSkills =
    usedSkills.length > 0
      ? Array.from(new Map(usedSkills.map((item) => [item.id, item])).values())
      : undefined

  appendDisplayTurn(playerText, replyText, uniqueSkills)
  void storeTurnMemory(status.profile.id, playerText, replyText)

  return {
    text: replyText,
    emotion: inferEmotionFromStatus(status),
    usedSkills: uniqueSkills,
    openPage,
  } satisfies PetAiReply
}

export function registerPetAiIpc(
  getPetWindow: () => BrowserWindow | null,
  openMainPage?: OpenMainPageFn,
) {
  if (ipcRegistered) return
  ipcRegistered = true
  hydrateChatHistory()

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

  ipcMain.handle('pet:ai-get-history', () => {
    hydrateChatHistory()
    return displayHistory
  })

  ipcMain.handle('pet:ai-clear-history', () => {
    clearPersistedChatHistory()
    return [] as PetChatHistoryItem[]
  })

  ipcMain.handle('pet:ai-clear-memory', () => {
    const status = getPetStatus()
    return clearPetMemory(status.profile.id)
  })

  ipcMain.handle('pet:ai-send', async (_event, text: string) => {
    const playerText = String(text ?? '').trim()
    if (!playerText) throw new Error('请输入消息')

    const reply = await runChatWithSkills(playerText, openMainPage)
    const petWin = getPetWindow()
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send('pet:ai-bubble', { text: bubbleSnippet(reply.text) })
    }
    return reply
  })
}
