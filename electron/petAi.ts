import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { buildPetSystemPrompt, buildSituationalLineSystemPrompt, buildSituationalLineUserPrompt } from './petContextBuilder'
import { getPetStatus, markPetInteracted } from './pet'
import type { AppPageId } from './appPages'
import {
  clearPetMemory,
  getOwnerNotes,
  getRecentMemorySnippets,
  rememberConversationSummary,
  setOwnerNotes,
} from './petMemory'
import {
  looksLikeWatermarkRequest,
  PET_AI_TOOLS,
  PET_SKILL_LABELS,
  runPetSkill,
  type PetSkillId,
  type PetSkillPrefill,
} from './petSkills'
import type { CareKind } from './petCareLines'
import type { ProactiveKind } from './petProactiveChat'

/** DeepSeek 最便宜档，适合桌宠短对话 */
export const PET_AI_MODEL = 'deepseek-v4-flash'

export type EmotionTag = 'happy' | 'sad' | 'hungry' | 'angry' | 'sleep' | 'neutral'

export type PetAiSettingsView = {
  hasApiKey: boolean
  apiKeyHint: string
  model: typeof PET_AI_MODEL
  /** 控制板「确认 AI 对话」：主动搭话/照顾反馈走大模型 */
  proactiveAiEnabled: boolean
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
  /** 开启后主动说话/照顾反馈用 LLM 生成文案 */
  proactiveAiEnabled: boolean
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
      proactiveAiEnabled: Boolean(raw.proactiveAiEnabled),
    }
  } catch {
    return { apiKey: '', baseUrl: DEFAULT_BASE_URL, proactiveAiEnabled: false }
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
    proactiveAiEnabled: settings.proactiveAiEnabled,
  }
}

/** 已配置 Key 且控制板打开「确认 AI 对话」 */
export function isProactiveAiEnabled() {
  const settings = readAiSettings()
  return settings.proactiveAiEnabled && settings.apiKey.trim().length > 0
}

function sanitizeSituationalLine(raw: string, fallback: string, maxLen = 80) {
  let text = raw
    .replace(/^[\s"'「」『』【】]+|[\s"'「」『』【】]+$/g, '')
    .trim()
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\d*・\-\s]+/, '').trim())
    .filter(Boolean)
  text = lines.slice(0, 2).join(' ').trim()
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`
  return text || fallback
}

/**
 * 按场景生成一句桌宠台词；失败或未开启时由调用方使用本地模板。
 */
export async function generateSituationalLine(
  kind: ProactiveKind | CareKind,
  fallback: string,
): Promise<string> {
  if (!isProactiveAiEnabled()) return fallback

  const status = getPetStatus()
  const memorySnippets = getRecentMemorySnippets(status.profile.id)
  const ownerNotes = getOwnerNotes(status.profile.id)
  const maxLen = kind === 'sing' ? 100 : 80

  try {
    const message = await callDeepSeek(
      [
        {
          role: 'system',
          content: buildSituationalLineSystemPrompt(status, memorySnippets, ownerNotes),
        },
        {
          role: 'user',
          content: buildSituationalLineUserPrompt(kind),
        },
      ],
      false,
    )
    return sanitizeSituationalLine(message.content ?? '', fallback, maxLen)
  } catch {
    return fallback
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

/** HTTP 头只能是 ByteString；Key 里若有中文/全角字符会直接炸 */
function assertAsciiHttpToken(value: string, label: string) {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 255) {
      throw new Error(
        `${label} 含有非英文字符，无法用于请求头。请只粘贴 DeepSeek 的 sk- 开头密钥，不要带中文说明。`,
      )
    }
  }
}

async function callDeepSeek(messages: ApiMessage[], withTools: boolean) {
  const settings = readAiSettings()
  const apiKey = settings.apiKey.trim()
  if (!apiKey) {
    throw new Error('请先在对话页配置 DeepSeek API Key')
  }
  assertAsciiHttpToken(apiKey, 'API Key')

  const baseUrl = settings.baseUrl.replace(/\/$/, '')
  assertAsciiHttpToken(baseUrl, 'API 地址')

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
      Authorization: `Bearer ${apiKey}`,
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

async function summarizeSessionAndStore() {
  hydrateChatHistory()
  if (conversationHistory.length < 2) return

  const settings = readAiSettings()
  if (!settings.apiKey) return

  const transcript = conversationHistory
    .slice(-12)
    .map((item) => `${item.role === 'user' ? '玩家' : '宠物'}：${item.content.slice(0, 200)}`)
    .join('\n')

  try {
    const message = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你是宠物记忆记录员。请用一句话、不超过30字、从宠物第一人称视角总结整段对话里最重要的事。只输出摘要本身，不要引号或解释。',
        },
        {
          role: 'user',
          content: `对话记录：\n${transcript}`,
        },
      ],
      false,
    )
    const summary = message.content?.trim()
    if (summary) {
      rememberConversationSummary(getPetStatus().profile.id, summary)
    }
  } catch {
    // 摘要失败不影响开启新对话
  }
}

async function runChatWithSkills(playerText: string, openMainPage?: OpenMainPageFn) {
  hydrateChatHistory()
  const status = getPetStatus()
  const memorySnippets = getRecentMemorySnippets(status.profile.id)
  const ownerNotes = getOwnerNotes(status.profile.id)
  const systemPrompt = buildPetSystemPrompt(status, memorySnippets, ownerNotes)
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

  ipcMain.handle('pet:ai-save-settings', (_event, input: { apiKey?: string; proactiveAiEnabled?: boolean }) => {
    const patch: Partial<StoredAiSettings> = {}
    if (input.apiKey !== undefined) {
      const apiKey = String(input.apiKey).trim()
      if (apiKey) assertAsciiHttpToken(apiKey, 'API Key')
      patch.apiKey = apiKey
    }
    if (input.proactiveAiEnabled !== undefined) {
      patch.proactiveAiEnabled = Boolean(input.proactiveAiEnabled)
    }
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

  ipcMain.handle('pet:ai-clear-history', async () => {
    await summarizeSessionAndStore()
    clearPersistedChatHistory()
    return [] as PetChatHistoryItem[]
  })

  ipcMain.handle('pet:ai-clear-memory', () => {
    const status = getPetStatus()
    return clearPetMemory(status.profile.id)
  })

  ipcMain.handle('pet:ai-get-owner-notes', () => {
    const status = getPetStatus()
    return { notes: getOwnerNotes(status.profile.id) }
  })

  ipcMain.handle('pet:ai-set-owner-notes', (_event, input: { notes?: string }) => {
    const status = getPetStatus()
    const notes = setOwnerNotes(status.profile.id, String(input?.notes ?? ''))
    return { notes }
  })

  ipcMain.handle('pet:ai-send', async (_event, text: string) => {
    const playerText = String(text ?? '').trim()
    if (!playerText) throw new Error('请输入消息')

    const reply = await runChatWithSkills(playerText, openMainPage)
    markPetInteracted()
    const petWin = getPetWindow()
    if (petWin && !petWin.isDestroyed()) {
      petWin.webContents.send('pet:ai-bubble', { text: bubbleSnippet(reply.text) })
    }
    return reply
  })
}
