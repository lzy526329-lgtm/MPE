export type CareKind = 'feed' | 'clean'

export const DREAM_LINES = [
  '刚才梦到你带我去野餐，草地软软的，我还偷吃了一颗草莓～',
  '我梦见自己变成一朵小云，飘到你窗口对你招手。',
  '梦里有一条会发光的小河，我踩着石头去找你。',
  '刚才梦见好多星星围着我转圈，其中一个好像在叫我的名字。',
  '我梦到我们一起躲雨，你把外套盖在我头上，好暖。',
  '睡着的时候梦见自己在云上打滚，一骨碌滚进你怀里啦。',
]

/** 喂食 / 清洁本地语音包（台词，不调 LLM） */
const FEED_LINES = [
  '唔唔…好好吃！再来一口嘛～',
  '嗝～吃饱啦，你最好了！',
  '哇，今天的零食也太香了吧！',
  '谢谢投喂！我感觉能量满满！',
  '咕嘟咕嘟…幸福就是这种味道！',
  '啊哈，肚子暖暖的，超开心！',
]

const CLEAN_LINES = [
  '啊哈～洗得好舒服！',
  '亮晶晶的！我又是小仙女啦～',
  '谢谢帮忙，现在全身香香的！',
  '擦干净啦！抱抱你！',
  '清爽得想转个圈炫耀一下！',
  '呼——黏糊糊都没啦，谢谢你！',
]

export function pickCareLine(kind: CareKind): string {
  const pool = kind === 'feed' ? FEED_LINES : CLEAN_LINES
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
}

export function pickDreamLine(random = Math.random): string {
  const index = Math.min(DREAM_LINES.length - 1, Math.floor(random() * DREAM_LINES.length))
  return DREAM_LINES[index] ?? DREAM_LINES[0]
}
