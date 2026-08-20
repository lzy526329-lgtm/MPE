import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

export const PET_CLIP_KEYS = ['idle', 'walk'] as const

export type PetClipKey = (typeof PET_CLIP_KEYS)[number]
export type PetClipLayout = 'row' | 'column'
export type PetWalkFacing = 'left' | 'right'

export type PetClipConfig = {
  fileName: string
  originalName: string
  frames: number
  fps: number
  layout: PetClipLayout
  facing?: PetWalkFacing
  width: number
  height: number
}

export type PetSkinConfig = {
  clips: Partial<Record<PetClipKey, PetClipConfig>>
}

export type PetClipView = PetClipConfig & {
  dataUrl: string
}

export type PetSkinView = {
  clips: Partial<Record<PetClipKey, PetClipView>>
}

export type SavePetClipRequest = {
  key: PetClipKey
  bytes: Uint8Array
  originalName: string
  frames: number
  fps: number
  layout: PetClipLayout
  facing?: PetWalkFacing
}

export type UpdatePetClipRequest = {
  key: PetClipKey
  frames?: number
  fps?: number
  layout?: PetClipLayout
  facing?: PetWalkFacing
}

function clipsDir() {
  return path.join(app.getPath('userData'), 'pet-clips')
}

export function isPetClipKey(value: string): value is PetClipKey {
  return (PET_CLIP_KEYS as readonly string[]).includes(value)
}

export function clampClipMeta(input: {
  frames?: number
  fps?: number
  layout?: PetClipLayout
  facing?: PetWalkFacing
}) {
  const frames = Math.min(64, Math.max(1, Math.round(Number(input.frames) || 1)))
  const fps = Math.min(30, Math.max(0.2, Number(input.fps) || 1))
  const layout: PetClipLayout = input.layout === 'column' ? 'column' : 'row'
  const facing: PetWalkFacing = input.facing === 'left' ? 'left' : 'right'
  return { frames, fps, layout, facing }
}

export function readSkinConfig(settings: { skin?: { clips?: Record<string, PetClipConfig> } }): PetSkinConfig {
  const raw = settings.skin?.clips ?? {}
  const clips: PetSkinConfig['clips'] = {}
  if (raw.idle) clips.idle = raw.idle
  if (raw.walk) {
    clips.walk = raw.walk
  } else {
    const legacy = raw.walkRight ?? raw.walkLeft
    if (legacy) {
      const destName = 'walk.png'
      try {
        const from = clipFilePath(legacy.fileName)
        const to = clipFilePath(destName)
        if (fs.existsSync(from) && from !== to) fs.copyFileSync(from, to)
        clips.walk = { ...legacy, fileName: destName }
      } catch {
        clips.walk = { ...legacy, fileName: 'walk.png' }
      }
    }
  }
  return { clips }
}

export function clipFilePath(fileName: string) {
  return path.join(clipsDir(), fileName)
}

export function pruneLegacyClipFiles() {
  for (const name of ['walkUp.png', 'walkDown.png', 'walkLeft.png', 'walkRight.png']) {
    try {
      fs.unlinkSync(clipFilePath(name))
    } catch {
      /* ignore */
    }
  }
}

export async function savePetClip(request: SavePetClipRequest): Promise<PetClipView> {
  if (!isPetClipKey(request.key)) throw new Error('未知的动作类型')
  const meta = clampClipMeta(request)
  fs.mkdirSync(clipsDir(), { recursive: true })
  const fileName = `${request.key}.png`
  const dest = clipFilePath(fileName)
  const buffer = Buffer.from(request.bytes)
  const info = await sharp(buffer).metadata()
  if (!info.width || !info.height) throw new Error('无法读取图片尺寸')
  await sharp(buffer).png().toFile(dest)
  const config: PetClipConfig = {
    fileName,
    originalName: request.originalName || fileName,
    frames: meta.frames,
    fps: meta.fps,
    layout: meta.layout,
    facing: request.key === 'walk' ? meta.facing : undefined,
    width: info.width,
    height: info.height,
  }
  const saved = fs.readFileSync(dest)
  return {
    ...config,
    dataUrl: `data:image/png;base64,${saved.toString('base64')}`,
  }
}

export function updatePetClip(
  skin: PetSkinConfig,
  request: UpdatePetClipRequest,
): PetSkinConfig {
  const current = skin.clips[request.key]
  if (!current) throw new Error('请先上传该动作的精灵图')
  const meta = clampClipMeta({
    frames: request.frames ?? current.frames,
    fps: request.fps ?? current.fps,
    layout: request.layout ?? current.layout,
    facing: request.facing ?? current.facing,
  })
  return {
    clips: {
      ...skin.clips,
      [request.key]: {
        ...current,
        ...meta,
        facing: request.key === 'walk' ? meta.facing : undefined,
      },
    },
  }
}

export function removePetClip(skin: PetSkinConfig, key: PetClipKey): PetSkinConfig {
  const current = skin.clips[key]
  if (current) {
    try {
      fs.unlinkSync(clipFilePath(current.fileName))
    } catch {
      /* ignore */
    }
  }
  const clips = { ...skin.clips }
  delete clips[key]
  return { clips }
}

export function resetPetSkin(skin: PetSkinConfig): PetSkinConfig {
  for (const key of PET_CLIP_KEYS) {
    const current = skin.clips[key]
    if (!current) continue
    try {
      fs.unlinkSync(clipFilePath(current.fileName))
    } catch {
      /* ignore */
    }
  }
  return { clips: {} }
}

export function loadSkinView(skin: PetSkinConfig): PetSkinView {
  const clips: PetSkinView['clips'] = {}
  for (const key of PET_CLIP_KEYS) {
    const current = skin.clips[key]
    if (!current) continue
    try {
      const saved = fs.readFileSync(clipFilePath(current.fileName))
      clips[key] = {
        ...current,
        dataUrl: `data:image/png;base64,${saved.toString('base64')}`,
      }
    } catch {
      /* missing file */
    }
  }
  return { clips }
}
