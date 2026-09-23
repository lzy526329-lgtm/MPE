import path from 'node:path'

export function resolveBattleTestProfile(isPackaged: boolean, profile: string | undefined, defaultUserData: string) {
  if (isPackaged || !profile) return null
  if (profile !== 'A' && profile !== 'B') throw new Error('MPT_TEST_PROFILE must be A or B')
  return {
    id: profile,
    title: `MPT · 本地对战测试 ${profile}`,
    userData: path.join(`${defaultUserData}-battle-test`, profile),
  }
}
