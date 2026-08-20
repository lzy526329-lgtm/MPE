import fs from 'node:fs'
import path from 'node:path'

export const PET_CHARACTERS_URL = '/pet/characters'

export type PetCharacterMeta = {
  name?: string
  description?: string
}

export type PetCharacter = {
  id: string
  name: string
  description: string
  skeletonFile: string
  previewFile: string
  skeletonUrl: string
  previewUrl: string
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
      return {
        id,
        name: meta.name?.trim() || id,
        description: meta.description?.trim() || '',
        skeletonFile,
        previewFile,
        skeletonUrl: `${PET_CHARACTERS_URL}/${id}/${skeletonFile}`,
        previewUrl: `${PET_CHARACTERS_URL}/${id}/${previewFile}`,
      } satisfies PetCharacter
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
