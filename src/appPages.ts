export type AppPageId =
  | 'pet-settings-page'
  | 'pet-chat-page'
  | 'pet-home-page'
  | 'farm-page'
  | 'shop-page'
  | 'backpack-page'
  | 'account-page'
  | 'friend-page'
  | 'fishing-page'
  | 'animal-flip-page'
  | 'toolbox-page'
  | 'image-page'
  | 'cutout-page'
  | 'watermark-page'
  | 'compression-page'
  | 'archive-page'
  | 'pdf-page'
  | 'photoplus-page'
  | 'sysinfo-page'
  | 'disk-clean-page'
  | 'spritesheet-page'
  | 'video-frames-page'

export const APP_HOME_PAGE: AppPageId = 'pet-settings-page'

export type AppPageGroup = 'pet' | 'play' | 'tool' | 'account'

export type AppPageDefinition = {
  id: AppPageId
  title: string
  eyebrow: string
  group: AppPageGroup
  navLabel: string
  showInGlobalNav: boolean
}

const page = (
  id: AppPageId,
  title: string,
  eyebrow: string,
  group: AppPageGroup,
  showInGlobalNav = true,
): AppPageDefinition => ({ id, title, eyebrow, group, navLabel: title, showInGlobalNav })

export const APP_PAGE_DEFINITIONS: Readonly<Record<AppPageId, AppPageDefinition>> = Object.freeze({
  'pet-settings-page': page('pet-settings-page', '宠物设置', '桌宠', 'pet'),
  'pet-chat-page': page('pet-chat-page', '与宠物对话', '桌宠', 'pet'),
  'pet-home-page': page('pet-home-page', '个人小屋', '桌宠', 'pet', false),
  'farm-page': page('farm-page', '农场', '玩法', 'play'),
  'fishing-page': page('fishing-page', '鱼塘', '玩法', 'play'),
  'animal-flip-page': page('animal-flip-page', '象狮虎豹', '玩法', 'play'),
  'shop-page': page('shop-page', '商店', '玩法', 'play'),
  'backpack-page': page('backpack-page', '背包', '玩法', 'play'),
  'account-page': page('account-page', '账号与同步', '账号', 'account'),
  'friend-page': page('friend-page', '好友', '账号', 'account'),
  'toolbox-page': page('toolbox-page', '工具箱', '实用工具', 'tool'),
  'image-page': page('image-page', '图片压缩', '工具箱', 'tool', false),
  'cutout-page': page('cutout-page', '图片抠图', '工具箱', 'tool', false),
  'watermark-page': page('watermark-page', '视频去水印', '工具箱', 'tool', false),
  'compression-page': page('compression-page', '文件压缩', '工具箱', 'tool', false),
  'archive-page': page('archive-page', '文件解压', '工具箱', 'tool', false),
  'pdf-page': page('pdf-page', 'PDF 工具箱', '工具箱', 'tool', false),
  'photoplus-page': page('photoplus-page', '拉取图片', '工具箱', 'tool', false),
  'sysinfo-page': page('sysinfo-page', '电脑信息', '工具箱', 'tool', false),
  'disk-clean-page': page('disk-clean-page', '磁盘瘦身', '工具箱', 'tool', false),
  'spritesheet-page': page('spritesheet-page', '序列帧预览', '工具箱', 'tool', false),
  'video-frames-page': page('video-frames-page', '视频转序列帧', '工具箱', 'tool', false),
})

export const APP_PAGE_TITLES: Record<AppPageId, string> = Object.fromEntries(
  Object.entries(APP_PAGE_DEFINITIONS).map(([id, definition]) => [id, definition.title]),
) as Record<AppPageId, string>

export function getAppPageDefinition(pageId: string): AppPageDefinition | undefined {
  return APP_PAGE_DEFINITIONS[pageId as AppPageId]
}

export const TOOL_PAGES = [
  'image-page',
  'cutout-page',
  'watermark-page',
  'compression-page',
  'archive-page',
  'pdf-page',
  'photoplus-page',
  'sysinfo-page',
  'disk-clean-page',
  'spritesheet-page',
  'video-frames-page',
] as const satisfies readonly AppPageId[]
