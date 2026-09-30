import type { CloudPawsCommand } from './types'

export function validateCloudPawsCommand(value: unknown): CloudPawsCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的房间操作')
  const v = value as Record<string, unknown>
  const actions = ['create', 'join', 'ready', 'start', 'leave', 'input', 'recover', 'respawn', 'rematch']
  if (typeof v.action !== 'string' || !actions.includes(v.action)) throw new Error('无效的房间操作')
  const result: CloudPawsCommand = { action: v.action as CloudPawsCommand['action'] }
  if (v.requestId !== undefined) {
    if (typeof v.requestId !== 'string' || v.requestId.length > 80) throw new Error('无效的请求编号')
    result.requestId = v.requestId
  }
  if (v.action === 'create' || v.action === 'join') {
    result.animal = v.animal === 'bunny' ? 'bunny' : 'fox'
    if (v.action === 'join') { if (typeof v.code !== 'string' || !/^\d{6}$/.test(v.code)) throw new Error('请输入 6 位房间码'); result.code = v.code }
  }
  if (v.action === 'ready') result.ready = v.ready === true
  if (v.action === 'input') {
    const i = v.input as Record<string, unknown> | undefined
    if (!Number.isSafeInteger(v.seq) || Number(v.seq) < 0 || !i ||
      typeof i.x !== 'number' || !Number.isFinite(i.x) || Math.abs(i.x) > 1.01 ||
      typeof i.z !== 'number' || !Number.isFinite(i.z) || Math.abs(i.z) > 1.01 ||
      typeof i.jump !== 'boolean' || typeof i.sprint !== 'boolean') throw new Error('无效的移动指令')
    result.seq = Number(v.seq); result.input = { x: i.x, z: i.z, jump: i.jump, sprint: i.sprint }
  }
  return result
}
