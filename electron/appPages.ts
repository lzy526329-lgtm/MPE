export type AppPageId =
  | 'pet-settings-page'
  | 'pet-chat-page'
  | 'pet-home-page'
  | 'farm-page'
  | 'shop-page'
  | 'backpack-page'
  | 'image-page'
  | 'cutout-page'
  | 'watermark-page'
  | 'compression-page'
  | 'archive-page'
  | 'pdf-page'
  | 'photoplus-page'
  | 'sysinfo-page'
  | 'disk-clean-page'

export const APP_HOME_PAGE: AppPageId = 'pet-settings-page'

export const PET_TOOL_MENU: { id: AppPageId; label: string }[] = [
  { id: 'image-page', label: '图片压缩' },
  { id: 'cutout-page', label: '图片抠图' },
  { id: 'watermark-page', label: '视频去水印' },
  { id: 'compression-page', label: '文件压缩' },
  { id: 'archive-page', label: '文件解压' },
  { id: 'pdf-page', label: 'PDF 工具箱' },
  { id: 'photoplus-page', label: '拉取图片' },
  { id: 'sysinfo-page', label: '电脑信息' },
  { id: 'disk-clean-page', label: '磁盘瘦身' },
]
