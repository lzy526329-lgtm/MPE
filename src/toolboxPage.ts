import { APP_PAGE_DEFINITIONS, TOOL_PAGES } from './appPages'
import { navigateToPage } from './appNavigation'
import './toolbox.css'

type ToolPageId = typeof TOOL_PAGES[number]
type ToolCategory = 'media' | 'files' | 'system'

const categories: { id: ToolCategory; title: string }[] = [
  { id: 'media', title: '图片与视频' },
  { id: 'files', title: '文件与文档' },
  { id: 'system', title: '系统工具' },
]

const tools: Record<ToolPageId, { category: ToolCategory; description: string; icon: string }> = {
  'image-page': {
    category: 'media', description: '减小图片体积，尽可能保持清晰度。',
    icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  },
  'cutout-page': {
    category: 'media', description: '去除纯色背景，导出透明 PNG。',
    icon: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 12.3 12.3M8.2 15.8 20.5 3.5"/>',
  },
  'watermark-page': {
    category: 'media', description: '解析抖音、快手链接，保存无水印视频。',
    icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
  },
  'photoplus-page': {
    category: 'media', description: '通过 PhotoPlus 相册链接下载图片。',
    icon: '<path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M12 3v12m-5-5 5 5 5-5"/>',
  },
  'spritesheet-page': {
    category: 'media', description: '导入雪碧图，预览序列帧动画。',
    icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  },
  'video-frames-page': {
    category: 'media', description: '提取视频帧，合成为雪碧图 PNG。',
    icon: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4m-7-6 3 2-3 2Z"/>',
  },
  'compression-page': {
    category: 'files', description: '将多个文件或文件夹打包压缩。',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M9 11l3 3 3-3M12 9v9m-3 0h6"/>',
  },
  'archive-page': {
    category: 'files', description: '解压常见压缩包，文件保留在本地。',
    icon: '<path d="M3 7h18v4H3zM5 11v9h14v-9M12 17V3m-3 3 3-3 3 3"/>',
  },
  'pdf-page': {
    category: 'files', description: '合并、拆分、压缩 PDF，转换图片。',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h5"/>',
  },
  'sysinfo-page': {
    category: 'system', description: '查看电脑硬件配置与存储使用情况。',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M6 13V9M10 13V7M14 13v-3M18 13V6"/>',
  },
  'disk-clean-page': {
    category: 'system', description: '清理缓存和临时文件，释放磁盘空间。',
    icon: '<path d="m5 4-3 9v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3-9ZM2 13h20M6 17h.01M10 17h.01"/>',
  },
}

export function renderToolboxPage(): string {
  return `<div class="toolbox">
    <header class="toolbox-heading">
      <div><h1>工具箱</h1><p>选一个工具，轻松处理日常小事。</p></div>
      <span class="toolbox-count">${TOOL_PAGES.length} 个实用工具</span>
    </header>
    ${categories.map(category => `<section class="toolbox-group toolbox-group--${category.id}" aria-labelledby="toolbox-${category.id}-title">
      <h2 id="toolbox-${category.id}-title">${category.title}</h2>
      <div class="toolbox-grid">
        ${TOOL_PAGES.filter(id => tools[id].category === category.id).map(id => `
          <button class="toolbox-card" type="button" data-tool-page="${id}" aria-labelledby="toolbox-${id}-title" aria-describedby="toolbox-${id}-description">
            <span class="toolbox-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${tools[id].icon}</svg></span>
            <span class="toolbox-card-title" id="toolbox-${id}-title">${APP_PAGE_DEFINITIONS[id].title}</span>
            <span class="toolbox-card-description" id="toolbox-${id}-description">${tools[id].description}</span>
            <span class="toolbox-card-enter" aria-hidden="true">打开工具 <span>↗</span></span>
          </button>
        `).join('')}
      </div>
    </section>`).join('')}
  </div>`
}

export function mountToolboxPage(): void {
  const root = document.querySelector<HTMLElement>('#toolbox-root')
  if (!root) return
  root.innerHTML = renderToolboxPage()
  root.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLElement>('[data-tool-page]')
    const pageId = TOOL_PAGES.find(id => id === target?.dataset.toolPage)
    if (pageId) navigateToPage(pageId)
  })
}
