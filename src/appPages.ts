export type AppPageId =
  | 'pet-settings-page'
  | 'pet-chat-page'
  | 'image-page'
  | 'watermark-page'
  | 'compression-page'
  | 'archive-page'
  | 'pdf-page'
  | 'sysinfo-page'
  | 'disk-clean-page'

export const APP_HOME_PAGE: AppPageId = 'pet-settings-page'

export const APP_PAGE_TITLES: Record<AppPageId, string> = {
  'pet-settings-page': '宠物设置',
  'pet-chat-page': '与宠物对话',
  'image-page': '图片压缩',
  'watermark-page': '视频去水印',
  'compression-page': '文件压缩',
  'archive-page': '文件解压',
  'pdf-page': 'PDF 工具箱',
  'sysinfo-page': '电脑信息',
  'disk-clean-page': '磁盘瘦身',
}

export const TOOL_PAGES: AppPageId[] = [
  'image-page',
  'watermark-page',
  'compression-page',
  'archive-page',
  'pdf-page',
  'sysinfo-page',
  'disk-clean-page',
]
