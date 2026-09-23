import { APP_HOME_PAGE, getAppPageDefinition, type AppPageId } from './appPages'

type PageListener = (pageId: AppPageId) => void

let currentPage: AppPageId = APP_HOME_PAGE
const listeners = new Set<PageListener>()

function syncNavigation(pageId: AppPageId) {
  const toolbar = document.querySelector<HTMLElement>('#workspace-toolbar')
  const title = document.querySelector<HTMLElement>('#workspace-title')
  const eyebrow = document.querySelector<HTMLElement>('#workspace-eyebrow')
  const petNav = document.querySelector<HTMLElement>('#pet-settings-nav')
  const toolboxBack = document.querySelector<HTMLElement>('#workspace-toolbox-back')
  const definition = getAppPageDefinition(pageId)
  if (!definition) return
  const isHome = pageId === APP_HOME_PAGE
  if (toolbar) toolbar.hidden = isHome
  if (title) title.textContent = definition.title
  if (eyebrow) eyebrow.textContent = definition.eyebrow
  if (petNav) petNav.hidden = false
  const isToolDetail = definition.group === 'tool' && pageId !== 'toolbox-page'
  if (toolboxBack) toolboxBack.hidden = !isToolDetail

  document.querySelectorAll<HTMLElement>('[data-page]').forEach((button) => {
    const isActive = button.dataset.page === pageId || (isToolDetail && button.dataset.page === 'toolbox-page')
    button.hidden = false
    button.classList.toggle('active', isActive)
    if (isActive) button.setAttribute('aria-current', button.dataset.page === pageId ? 'page' : 'location')
    else button.removeAttribute('aria-current')
  })
}

export function getCurrentPage() {
  return currentPage
}

export function navigateToPage(pageId: AppPageId) {
  if (!getAppPageDefinition(pageId)) return
  currentPage = pageId
  document.querySelectorAll<HTMLElement>('.tool-page').forEach((page) => {
    page.hidden = page.id !== pageId
  })
  syncNavigation(pageId)
  listeners.forEach((listener) => listener(pageId))
}

export function onPageChange(listener: PageListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setupAppNavigation() {
  document.querySelector<HTMLElement>('#workspace-toolbox-back')?.addEventListener('click', () => navigateToPage('toolbox-page'))
  const globalNav = document.querySelector<HTMLElement>('.sidebar')
    ?? document.querySelector<HTMLElement>('#global-nav')
  globalNav?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-page]')
    const pageId = target?.dataset.page as AppPageId | undefined
    if (!pageId) return
    navigateToPage(pageId)
  })

  window.electronAPI?.onMainNavigate?.((pageId) => {
    navigateToPage(getAppPageDefinition(pageId) ? pageId as AppPageId : APP_HOME_PAGE)
  })
  navigateToPage(APP_HOME_PAGE)
}
