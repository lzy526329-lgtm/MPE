import type { PhotoplusDownloadResult, PhotoplusProgress } from '../electron/photoplus'

export function mountPhotoplusPage() {
  const input = document.querySelector<HTMLTextAreaElement>('#photoplus-input')!
  const startButton = document.querySelector<HTMLButtonElement>('#photoplus-start-button')!
  const pauseButton = document.querySelector<HTMLButtonElement>('#photoplus-pause-button')!
  const cancelButton = document.querySelector<HTMLButtonElement>('#photoplus-cancel-button')!
  const progressBox = document.querySelector<HTMLElement>('#photoplus-progress')!
  const progressDetail = document.querySelector<HTMLElement>('#photoplus-progress-detail')!
  const progressBar = document.querySelector<HTMLElement>('#photoplus-progress-bar')!
  const resultBox = document.querySelector<HTMLElement>('#photoplus-result')!
  const resultDetail = document.querySelector<HTMLElement>('#photoplus-result-detail')!
  const openButton = document.querySelector<HTMLButtonElement>('#photoplus-open-button')!
  const errorMessage = document.querySelector<HTMLElement>('#photoplus-error')!

  let outputDirectory = ''
  let running = false
  let paused = false

  const setControlsVisible = (visible: boolean) => {
    pauseButton.hidden = !visible
    cancelButton.hidden = !visible
  }

  const setPausedUi = (nextPaused: boolean) => {
    paused = nextPaused
    pauseButton.textContent = nextPaused ? '继续' : '暂停'
  }

  const reset = () => {
    resultBox.hidden = true
    progressBox.hidden = true
    errorMessage.textContent = ''
    progressDetail.textContent = ''
    progressBar.style.width = '0%'
    outputDirectory = ''
    setPausedUi(false)
  }

  const renderProgress = (progress: PhotoplusProgress) => {
    progressBox.hidden = false
    progressDetail.textContent = progress.message
    if (progress.outputDirectory) outputDirectory = progress.outputDirectory

    if (progress.phase === 'paused') setPausedUi(true)
    else if (progress.phase === 'downloading' || progress.phase === 'listing') setPausedUi(false)

    if (progress.total > 0 && (progress.phase === 'downloading' || progress.phase === 'paused')) {
      const done = progress.completed + progress.failed + progress.skipped
      const percent = Math.min(100, Math.round((done / progress.total) * 100))
      progressBar.style.width = `${percent}%`
    } else if (progress.phase === 'done' || progress.phase === 'cancelled') {
      progressBar.style.width = progress.phase === 'done' ? '100%' : progressBar.style.width
    }
  }

  const formatResult = (result: PhotoplusDownloadResult) => {
    const skipAlbumNote =
      result.skippedAlbums.length > 0
        ? `；跳过 ${result.skippedAlbums.length} 个加密专辑`
        : ''
    if (result.status === 'cancelled') {
      return (
        `已取消「${result.activityName || result.activityNo}」：` +
        `下载 ${result.downloaded}，跳过 ${result.skipped}，失败 ${result.failed}，` +
        `未下 ${result.remaining}${skipAlbumNote}。` +
        (result.outputDirectory ? ` 已保存到 ${result.outputDirectory}` : '')
      )
    }
    return (
      `「${result.activityName}」共 ${result.total} 张：下载 ${result.downloaded}，` +
      `已存在跳过 ${result.skipped}，失败 ${result.failed}${skipAlbumNote}。` +
      ` 已保存到 ${result.outputDirectory}`
    )
  }

  const start = async () => {
    const text = input.value.trim()
    if (!text) {
      errorMessage.textContent = '请先粘贴 PhotoPlus 相册链接。'
      return
    }
    if (running) return

    running = true
    startButton.disabled = true
    startButton.textContent = '拉取中…'
    setControlsVisible(true)
    setPausedUi(false)
    reset()
    setControlsVisible(true)

    try {
      const result: PhotoplusDownloadResult = await window.electronAPI.downloadPhotoplus(text)
      outputDirectory = result.outputDirectory
      resultDetail.textContent = formatResult(result)
      resultBox.hidden = false
      progressBox.hidden = true
    } catch (error) {
      errorMessage.textContent = ipcErrorMessage(error, '拉取失败，请检查链接后重试。')
    } finally {
      running = false
      startButton.disabled = false
      startButton.textContent = '开始拉取'
      setControlsVisible(false)
      setPausedUi(false)
    }
  }

  startButton.addEventListener('click', () => void start())
  pauseButton.addEventListener('click', () => {
    if (!running) return
    if (paused) void window.electronAPI.resumePhotoplus()
    else void window.electronAPI.pausePhotoplus()
  })
  cancelButton.addEventListener('click', () => {
    if (!running) return
    void window.electronAPI.cancelPhotoplus()
  })

  input.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void start()
  })

  window.electronAPI.onPhotoplusProgress((progress) => {
    renderProgress(progress)
  })

  window.electronAPI.onToolPrefill?.((payload) => {
    if (payload.pageId !== 'photoplus-page') return
    const value = payload.input.trim()
    if (!value) return
    input.value = value
    errorMessage.textContent = ''
  })

  openButton.addEventListener('click', () => {
    if (outputDirectory) void window.electronAPI.openPath(outputDirectory)
  })
}

function ipcErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ''
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^(?:Error: )?(?:PhotoplusError: )?/i, '')
    .trim()
  return cleaned || fallback
}
