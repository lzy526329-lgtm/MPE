import type { WatermarkResult } from '../electron/watermark'

export function mountWatermarkPage() {
  const input = document.querySelector<HTMLTextAreaElement>('#watermark-input')!
  const parseButton = document.querySelector<HTMLButtonElement>('#watermark-parse-button')!
  const editor = document.querySelector<HTMLElement>('#watermark-editor')!
  const player = document.querySelector<HTMLVideoElement>('#watermark-player')!
  const picture = document.querySelector<HTMLImageElement>('#watermark-picture')!
  const gallery = document.querySelector<HTMLElement>('#watermark-gallery')!
  const author = document.querySelector<HTMLElement>('#watermark-author')!
  const desc = document.querySelector<HTMLElement>('#watermark-desc')!
  const type = document.querySelector<HTMLElement>('#watermark-type')!
  const platform = document.querySelector<HTMLElement>('#watermark-platform')!
  const link = document.querySelector<HTMLAnchorElement>('#watermark-link')!
  const copyButton = document.querySelector<HTMLButtonElement>('#watermark-copy-button')!
  const saveButton = document.querySelector<HTMLButtonElement>('#watermark-save-button')!
  const resultBox = document.querySelector<HTMLElement>('#watermark-result')!
  const resultDetail = document.querySelector<HTMLElement>('#watermark-result-detail')!
  const revealButton = document.querySelector<HTMLButtonElement>('#watermark-reveal-button')!
  const errorMessage = document.querySelector<HTMLElement>('#watermark-error')!

  let parsed: WatermarkResult | null = null
  let savedPath = ''

  const resetResult = () => {
    resultBox.hidden = true
    errorMessage.textContent = ''
    savedPath = ''
  }

  const platformLabel = (value: WatermarkResult['platform']) =>
    value === 'douyin' ? '抖音' : '快手'

  const renderResult = (data: WatermarkResult) => {
    parsed = data
    author.textContent = data.user_name || '-'
    desc.textContent = data.desc || '-'
    type.textContent = data.type === 'picture' ? '图集' : '视频'
    platform.textContent = platformLabel(data.platform)
    link.textContent = data.video_url || '-'
    link.href = data.video_url || '#'

    const showPictures = data.type === 'picture' && (data.images.length > 0 || Boolean(data.video_url))
    player.hidden = showPictures
    picture.hidden = !showPictures
    gallery.hidden = !(showPictures && data.images.length > 1)

    if (showPictures) {
      player.removeAttribute('src')
      picture.src = data.images[0] || data.video_url
      gallery.innerHTML = ''
      for (const url of data.images.slice(0, 8)) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'watermark-thumb'
        button.dataset.url = url
        const image = document.createElement('img')
        image.src = url
        image.alt = ''
        button.append(image)
        gallery.append(button)
      }
    } else {
      picture.removeAttribute('src')
      gallery.innerHTML = ''
      player.poster = data.img_url || ''
      player.src = data.video_url
    }

    editor.hidden = false
  }

  const parse = async () => {
    const text = input.value.trim()
    if (!text) {
      errorMessage.textContent = '请先粘贴分享链接或分享文案。'
      return
    }

    parseButton.disabled = true
    parseButton.textContent = '正在解析…'
    resetResult()
    editor.hidden = true

    try {
      renderResult(await window.electronAPI.parseWatermark(text))
    } catch (error) {
      errorMessage.textContent = ipcErrorMessage(error, '解析失败，请检查链接后重试。')
    } finally {
      parseButton.disabled = false
      parseButton.textContent = '开始解析'
    }
  }

  gallery.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.watermark-thumb')
    if (!target?.dataset.url) return
    picture.src = target.dataset.url
  })

  parseButton.addEventListener('click', () => void parse())
  input.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void parse()
  })

  const applyPrefill = (text: string) => {
    const value = text.trim()
    if (!value) return
    input.value = value
    errorMessage.textContent = ''
  }

  window.electronAPI?.onToolPrefill?.((payload) => {
    if (payload.pageId !== 'watermark-page') return
    applyPrefill(payload.input)
  })

  copyButton.addEventListener('click', async () => {
    if (!parsed?.video_url) return
    try {
      await navigator.clipboard.writeText(parsed.video_url)
      errorMessage.textContent = ''
      resultDetail.textContent = '无水印地址已复制'
      resultBox.hidden = false
    } catch {
      errorMessage.textContent = '复制失败，请手动选中地址。'
    }
  })

  saveButton.addEventListener('click', async () => {
    if (!parsed) return
    saveButton.disabled = true
    saveButton.textContent = '正在保存…'
    resetResult()
    try {
      const output = await window.electronAPI.saveWatermark(parsed)
      if (!output) return
      savedPath = output.outputPath
      resultDetail.textContent = `已保存到 ${output.outputPath}`
      resultBox.hidden = false
    } catch (error) {
      errorMessage.textContent = ipcErrorMessage(error, '保存失败，请稍后重试。')
    } finally {
      saveButton.disabled = false
      saveButton.textContent = '保存到本地'
    }
  })

  revealButton.addEventListener('click', () => {
    if (savedPath) void window.electronAPI.revealPath(savedPath)
  })
}

function ipcErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^(?:Error: )?(?:WatermarkError: )?/i, '')
    .trim()
  return cleaned || fallback
}
