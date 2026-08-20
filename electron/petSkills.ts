import type { AppPageId } from './appPages'
import { formatSystemInfoForAi, getSystemInfo } from './systemInfo'

export type PetSkillId = 'get_system_info' | 'open_watermark_tool'

export type PetSkillPrefill = {
  input: string
}

export type PetSkillResult = {
  id: PetSkillId
  label: string
  /** 给 LLM 看的文本摘要 */
  content: string
  /** 打开对应工具页 */
  openPage?: AppPageId
  /** 打开工具页时预填内容 */
  prefill?: PetSkillPrefill
}

type ToolDef = {
  type: 'function'
  function: {
    name: PetSkillId
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
      additionalProperties: boolean
    }
  }
}

/** DeepSeek / OpenAI 兼容的 tools 列表 */
export const PET_AI_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description:
        '查看本机电脑信息（操作系统、CPU、内存、GPU、磁盘等）。当用户问电脑配置、系统信息、内存还剩多少、磁盘空间、CPU 型号等时调用。调用后会打开电脑信息工具页。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_watermark_tool',
      description:
        '打开本应用内置的「视频去水印」工具页，用于解析抖音/快手分享链接并下载无水印视频。当用户提到去水印、去除水印、下载无水印视频，或粘贴了抖音/快手分享文案、v.douyin.com / kuaishou.com 链接时，必须调用此工具，并把完整分享文案或链接放入 share_text。不要说自己不会去水印。',
      parameters: {
        type: 'object',
        properties: {
          share_text: {
            type: 'string',
            description: '用户消息中的完整分享文案，或提取出的视频链接（如 https://v.douyin.com/...）',
          },
        },
        required: ['share_text'],
        additionalProperties: false,
      },
    },
  },
]

function parseShareText(argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as { share_text?: string; url?: string }
    return String(args.share_text || args.url || '').trim()
  } catch {
    return ''
  }
}

/** 用户消息是否像在请求去水印（LLM 未调工具时的兜底） */
export function looksLikeWatermarkRequest(text: string): boolean {
  const raw = text.trim()
  if (!raw) return false
  if (/去水印|去除水印|无水印|去个水印|解析.*视频|下载.*视频/.test(raw)) return true
  if (/v\.douyin\.com|iesdouyin\.com|douyin\.com|kuaishou\.com|gifshow\.com|v\.kuaishou\.com/i.test(raw)) {
    return /水印|下载|解析|去一下|帮我|视频/.test(raw) || /https?:\/\//i.test(raw)
  }
  return false
}

export async function runPetSkill(name: string, argsJson = '{}'): Promise<PetSkillResult> {
  switch (name) {
    case 'get_system_info': {
      const info = getSystemInfo()
      return {
        id: 'get_system_info',
        label: '查看电脑信息',
        content: formatSystemInfoForAi(info),
        openPage: 'sysinfo-page',
      }
    }
    case 'open_watermark_tool': {
      const shareText = parseShareText(argsJson)
      return {
        id: 'open_watermark_tool',
        label: '打开视频去水印',
        content: shareText
          ? `已打开「视频去水印」工具页，并已将用户提供的分享文案/链接填入输入框。请用宠物口吻告诉用户：工具已打开、链接已填好，点「开始解析」即可。不要说你不会去水印，也不要推荐外部在线工具。`
          : `已打开「视频去水印」工具页，但未解析到可填入的链接。请用宠物口吻请用户粘贴抖音/快手分享链接。`,
        openPage: 'watermark-page',
        prefill: shareText ? { input: shareText } : undefined,
      }
    }
    default:
      return {
        id: name as PetSkillId,
        label: name,
        content: `未知工具：${name}`,
      }
  }
}

export const PET_SKILL_LABELS: Record<PetSkillId, string> = {
  get_system_info: '查看电脑信息',
  open_watermark_tool: '打开视频去水印',
}
