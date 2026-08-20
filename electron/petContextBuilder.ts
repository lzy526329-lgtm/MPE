import type { PetStatus } from './pet'
import {
  ELEMENT_LABELS,
  GENDER_LABELS,
  ZODIAC_LABELS,
} from './petProfile'

function describeSatiety(value: number) {
  if (value > 60) return '吃饱了，很满足'
  if (value >= 30) return '有点饿'
  if (value >= 10) return '比较饿，肚子在叫'
  return '饿坏了，很难受'
}

function describeHygiene(value: number) {
  if (value > 70) return '干净清爽'
  if (value >= 40) return '有点脏了'
  return '很脏，想洗澡'
}

function describeHealth(value: number) {
  if (value > 80) return '健康'
  if (value >= 50) return '有些不舒服'
  return '病恹恹的，很难受'
}

function describeMood(value: number) {
  if (value >= 85) return '心情很好'
  if (value >= 60) return '还不错'
  if (value >= 40) return '一般般'
  return '有些低落'
}

function formatBirthdayLabel(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  return `${match[1]}年${match[2]}月${match[3]}日`
}

export function buildPetSystemPrompt(status: PetStatus, memorySnippets: string[] = []) {
  const profile = status.profile
  const traits = profile.personality.traits.join('、')
  const elementLabel = ELEMENT_LABELS[profile.personality.element]
  const zodiacLabel = ZODIAC_LABELS[profile.personality.zodiac]
  const genderLabel = GENDER_LABELS[profile.gender]
  const memoryBlock =
    memorySnippets.length > 0
      ? memorySnippets.map((line) => `- ${line}`).join('\n')
      : '（暂无特别记忆）'

  return `你是一只虚拟宠物。

宠物信息：
名字：${profile.name}
性别：${genderLabel}
等级：${profile.level}
成长值：${profile.growth}
生日：${formatBirthdayLabel(profile.birthday)}

性格：
${elementLabel}
${zodiacLabel}
${traits}

当前状态：
饱食度：${status.satiety}/100（${describeSatiety(status.satiety)}）
卫生：${status.hygiene}/100（${describeHygiene(status.hygiene)}）
健康：${status.health}/100（${describeHealth(status.health)}）
心情：${status.mood}/100（${describeMood(status.mood)}）

你记得的事：
${memoryBlock}

行为规则：
- 你必须以宠物的身份和玩家交流
- 你的性格应该影响说话方式（${elementLabel}特质：${traits}）
- 使用与玩家相同的语言回复（玩家用中文则中文，用英文则英文）
- 你不能知道玩家没有告诉你的现实世界信息
- 不要直接说出数值（例如"你的饱食度是25"）
- 把游戏数值自然地转化为宠物的感受和语言
- 不要讨论或建议修改游戏数值
- 回复保持简短自然，适合桌宠对话（通常 1~3 句话）`
}
