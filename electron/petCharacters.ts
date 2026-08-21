import fs from 'node:fs'
import path from 'node:path'

/** 相对 dist 根目录，兼容 file:// 打包与 Vite 开发服 */
export const PET_CHARACTERS_URL = './pet/characters'

/** 角色技能：动画 + 正面攻击盒 + 冷却 */
export type PetSkillConfig = {
  animation?: string
  range?: number
  halfHeight?: number
  minDist?: number
  /** 动画开始后延迟多久才开启判定（对齐下劈帧） */
  activeStartMs?: number
  activeMs?: number
  cooldownMs?: number
}

export type BallHitMinigameConfig = {
  skillId?: string
  durationMs?: number
  maxHp?: number
  ballDamage?: number
  spawnIntervalMs?: number
  ballSpeed?: number
  bodyHitReach?: number
}

export type PetCharacterMeta = {
  name?: string
  description?: string
  skills?: Record<string, PetSkillConfig>
  minigames?: {
    ballHit?: BallHitMinigameConfig
  }
}

export type PetCharacter = {
  id: string
  name: string
  description: string
  skeletonFile: string
  previewFile: string
  skeletonUrl: string
  previewUrl: string
  skills?: Record<string, PetSkillConfig>
  minigames?: {
    ballHit?: BallHitMinigameConfig
  }
}

function isDir(target: string) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function listFiles(dir: string) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function pickFile(files: string[], match: (name: string) => boolean) {
  return files.find(match)
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, n))
}

function sanitizeSkill(raw: unknown): PetSkillConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const skill: PetSkillConfig = {}
  if (typeof source.animation === 'string' && source.animation.trim()) {
    skill.animation = source.animation.trim()
  }
  const range = clampNumber(source.range, 8, 400)
  const halfHeight = clampNumber(source.halfHeight, 4, 300)
  const minDist = clampNumber(source.minDist, 0, 200)
  const activeStartMs = clampNumber(source.activeStartMs, 0, 2000)
  const activeMs = clampNumber(source.activeMs, 40, 2000)
  const cooldownMs = clampNumber(source.cooldownMs, 80, 5000)
  if (range !== undefined) skill.range = range
  if (halfHeight !== undefined) skill.halfHeight = halfHeight
  if (minDist !== undefined) skill.minDist = minDist
  if (activeStartMs !== undefined) skill.activeStartMs = activeStartMs
  if (activeMs !== undefined) skill.activeMs = activeMs
  if (cooldownMs !== undefined) skill.cooldownMs = cooldownMs
  return Object.keys(skill).length > 0 ? skill : null
}

function sanitizeSkills(raw: unknown): Record<string, PetSkillConfig> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, PetSkillConfig> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = id.trim()
    if (!key) continue
    const skill = sanitizeSkill(value)
    if (skill) out[key] = skill
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function sanitizeBallHit(raw: unknown): BallHitMinigameConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  const config: BallHitMinigameConfig = {}
  if (typeof source.skillId === 'string' && source.skillId.trim()) {
    config.skillId = source.skillId.trim()
  }
  const durationMs = clampNumber(source.durationMs, 5_000, 180_000)
  const maxHp = clampNumber(source.maxHp, 1, 9999)
  const ballDamage = clampNumber(source.ballDamage, 1, 9999)
  const spawnIntervalMs = clampNumber(source.spawnIntervalMs, 300, 10_000)
  const ballSpeed = clampNumber(source.ballSpeed, 0.2, 8)
  const bodyHitReach = clampNumber(source.bodyHitReach, 8, 120)
  if (durationMs !== undefined) config.durationMs = durationMs
  if (maxHp !== undefined) config.maxHp = maxHp
  if (ballDamage !== undefined) config.ballDamage = ballDamage
  if (spawnIntervalMs !== undefined) config.spawnIntervalMs = spawnIntervalMs
  if (ballSpeed !== undefined) config.ballSpeed = ballSpeed
  if (bodyHitReach !== undefined) config.bodyHitReach = bodyHitReach
  return Object.keys(config).length > 0 ? config : undefined
}

function readMeta(dir: string): PetCharacterMeta {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as PetCharacterMeta
  } catch {
    return {}
  }
}

export function scanPetCharacters(root: string): PetCharacter[] {
  if (!isDir(root)) return []
  return listFiles(root)
    .filter((id) => id !== '.' && id !== '..' && isDir(path.join(root, id)))
    .map((id) => {
      const dir = path.join(root, id)
      const files = listFiles(dir)
      const skeletonFile = pickFile(files, (name) => name.endsWith('.skel'))
        || pickFile(files, (name) => name.endsWith('.json') && name !== 'meta.json')
      const previewFile = pickFile(files, (name) => /^preview\.(png|webp)$/i.test(name))
        || pickFile(files, (name) => name.endsWith('.png') || name.endsWith('.webp'))
      if (!skeletonFile || !previewFile) return null
      if (!pickFile(files, (name) => name.endsWith('.atlas'))) return null
      const meta = readMeta(dir)
      const skills = sanitizeSkills(meta.skills)
      const ballHit = sanitizeBallHit(meta.minigames?.ballHit)
      const character: PetCharacter = {
        id,
        name: meta.name?.trim() || id,
        description: meta.description?.trim() || '',
        skeletonFile,
        previewFile,
        skeletonUrl: `${PET_CHARACTERS_URL}/${id}/${skeletonFile}`,
        previewUrl: `${PET_CHARACTERS_URL}/${id}/${previewFile}`,
      }
      if (skills) character.skills = skills
      if (ballHit) character.minigames = { ballHit }
      return character
    })
    .filter((item): item is PetCharacter => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export function petCharactersRoot(isDev = Boolean(process.env['VITE_DEV_SERVER_URL'])) {
  if (isDev) return path.join(process.cwd(), 'donghua')
  return path.join(process.env.DIST ?? path.join(process.cwd(), 'dist'), 'pet', 'characters')
}

export function listPetCharacters() {
  return scanPetCharacters(petCharactersRoot())
}

export function getPetCharacter(id?: string) {
  const characters = listPetCharacters()
  return characters.find((item) => item.id === id) ?? characters[0] ?? null
}
