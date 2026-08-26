import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type MemoryEntryType = 'event' | 'gift' | 'conversation_summary' | 'player_fact'

export type MemoryEntry = {
  id: string
  timestamp: string
  type: MemoryEntryType
  content: string
  metadata?: Record<string, string>
}

export type PetMemory = {
  petId: string
  entries: MemoryEntry[]
  maxEntries: number
  /** 主人自我介绍等固定长期记忆，不受条目裁剪影响 */
  ownerNotes: string
}

const DEFAULT_MAX_ENTRIES = 100
const DEFAULT_RECENT_LIMIT = 10
/** 控制面板「关于主人」文本上限 */
export const MAX_OWNER_NOTES = 2000

function memoryFile() {
  return path.join(app.getPath('userData'), 'memory.json')
}

function emptyMemory(petId: string): PetMemory {
  return {
    petId,
    entries: [],
    maxEntries: DEFAULT_MAX_ENTRIES,
    ownerNotes: '',
  }
}

function todayLabel(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function readPetMemory(petId: string): PetMemory {
  try {
    const raw = JSON.parse(fs.readFileSync(memoryFile(), 'utf8')) as Partial<PetMemory>
    const entries = Array.isArray(raw.entries) ? (raw.entries as MemoryEntry[]) : []
    return {
      petId: String(raw.petId || petId),
      entries: entries.filter((item) => item && typeof item.content === 'string'),
      maxEntries: Math.max(10, Number(raw.maxEntries) || DEFAULT_MAX_ENTRIES),
      ownerNotes: typeof raw.ownerNotes === 'string' ? raw.ownerNotes : '',
    }
  } catch {
    return emptyMemory(petId)
  }
}

function writePetMemory(memory: PetMemory) {
  fs.mkdirSync(path.dirname(memoryFile()), { recursive: true })
  fs.writeFileSync(memoryFile(), JSON.stringify(memory, null, 2))
}

/** 超出上限时优先删最旧的 conversation_summary，其次 player_fact */
function trimMemory(memory: PetMemory): PetMemory {
  const max = memory.maxEntries
  if (memory.entries.length <= max) return memory

  const entries = [...memory.entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  const removableOrder: MemoryEntryType[] = ['conversation_summary', 'player_fact']
  for (const type of removableOrder) {
    while (entries.length > max) {
      const index = entries.findIndex((item) => item.type === type)
      if (index < 0) break
      entries.splice(index, 1)
    }
  }

  return { ...memory, entries }
}

export function appendMemoryEntry(
  petId: string,
  input: {
    type: MemoryEntryType
    content: string
    metadata?: Record<string, string>
    id?: string
    timestamp?: string
  },
) {
  const content = input.content.trim()
  if (!content) return readPetMemory(petId)

  const memory = readPetMemory(petId)
  memory.petId = petId
  memory.entries.push({
    id: input.id || randomUUID(),
    timestamp: input.timestamp || new Date().toISOString(),
    type: input.type,
    content,
    metadata: input.metadata,
  })
  const next = trimMemory(memory)
  writePetMemory(next)
  return next
}

/** 最近 N 条 content，供 system prompt 注入（新→旧） */
export function getRecentMemorySnippets(petId: string, limit = DEFAULT_RECENT_LIMIT): string[] {
  const memory = readPetMemory(petId)
  return [...memory.entries]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
    .map((item) => item.content)
}

export function getOwnerNotes(petId: string): string {
  return readPetMemory(petId).ownerNotes
}

/** 保存主人自我介绍等固定长期记忆 */
export function setOwnerNotes(petId: string, notes: string): string {
  const memory = readPetMemory(petId)
  memory.petId = petId
  memory.ownerNotes = String(notes ?? '')
    .trim()
    .slice(0, MAX_OWNER_NOTES)
  writePetMemory(memory)
  return memory.ownerNotes
}

export function rememberCareEvent(petId: string, kind: 'feed' | 'clean' | 'rest') {
  const day = todayLabel()
  const content =
    kind === 'feed'
      ? `玩家在 ${day} 给我喂了食物`
      : kind === 'clean'
        ? `玩家在 ${day} 帮我洗了澡`
        : `玩家在 ${day} 让我好好休息了一下`
  return appendMemoryEntry(petId, {
    type: 'event',
    content,
    metadata: { kind, day },
  })
}

export function rememberRename(petId: string, name: string) {
  return appendMemoryEntry(petId, {
    type: 'gift',
    content: `玩家把我的名字改成了「${name}」`,
    metadata: { name },
  })
}

export function rememberConversationSummary(petId: string, summary: string) {
  return appendMemoryEntry(petId, {
    type: 'conversation_summary',
    content: summary.slice(0, 80),
  })
}

/** 清空事件/摘要类长期记忆；主人自我介绍保留，需在控制面板单独清空 */
export function clearPetMemory(petId: string) {
  const previous = readPetMemory(petId)
  const count = previous.entries.length
  writePetMemory({
    petId,
    entries: [],
    maxEntries: previous.maxEntries || DEFAULT_MAX_ENTRIES,
    ownerNotes: previous.ownerNotes || '',
  })
  return { cleared: count }
}
