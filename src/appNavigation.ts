import { APP_HOME_PAGE, getAppPageDefinition, type AppPageId } from './appPages'

type PageListener = (pageId: AppPageId) => void

let currentPage: AppPageId = APP_HOME_PAGE
const listeners = new Set<PageListener>()

function syncNavigation(pageId: AppPageId) {
  const toolbar = document.querySelector<HTMLElement>('#workspace-toolbar')
  const title = document.querySelector<HTMLElement>('#workspace-title')
  const eyebrow = document.querySelector<HTMLElement>('#workspace-eyebrow')
  const petNav = document.querySelector<HTMLElement>('#pet-settings-nav')
  const definition = getAppPageDefinition(pageId)
  if (!definition) return
  const isHome = pageId === APP_HOME_PAGE
  if (toolbar) toolbar.hidden = isHome
  if (title) title.textContent = definition.title
  if (eyebrow) eyebrow.textContent = definition.eyebrow
  if (petNav) petNav.hidden = false

  document.querySelectorAll<HTMLElement>('[data-page]').forEach((button) => {
    const isActive = button.dataset.page === pageId
    button.hidden = false
    button.classList.toggle('active', isActive)
    if (isActive) button.setAttribute('aria-current', 'page')
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
  document.querySelector<HTMLButtonElement>('#workspace-back')?.addEventListener('click', () => {
    navigateToPage(APP_HOME_PAGE)
  })

  const globalNav = document.querySelector<HTMLElement>('#global-nav')
    ?? document.querySelector<HTMLElement>('.sidebar')
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
