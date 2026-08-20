export type CareKind = 'feed' | 'clean'

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
