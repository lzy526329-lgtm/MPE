import { APP_HOME_PAGE, APP_PAGE_TITLES, type AppPageId } from './appPages'

type PageListener = (pageId: AppPageId) => void

let currentPage: AppPageId = APP_HOME_PAGE
const listeners = new Set<PageListener>()

function syncToolbar(pageId: AppPageId) {
  const toolbar = document.querySelector<HTMLElement>('#workspace-toolbar')
  const title = document.querySelector<HTMLElement>('#workspace-title')
  const petNav = document.querySelector<HTMLElement>('#pet-settings-nav')
  const petChatBtn = document.querySelector<HTMLElement>('#open-pet-chat')
  if (!toolbar || !title) return
  const isHome = pageId === APP_HOME_PAGE
  toolbar.hidden = isHome
  title.textContent = APP_PAGE_TITLES[pageId] ?? ''
  if (petNav) petNav.hidden = !isHome
  if (petChatBtn) petChatBtn.hidden = !isHome
}

export function getCurrentPage() {
  return currentPage
}

export function navigateToPage(pageId: AppPageId) {
  if (!APP_PAGE_TITLES[pageId]) return
  currentPage = pageId
  document.querySelectorAll<HTMLElement>('.tool-page').forEach((page) => {
    page.hidden = page.id !== pageId
  })
  syncToolbar(pageId)
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
  window.electronAPI?.onMainNavigate?.((pageId) => {
    navigateToPage(pageId as AppPageId)
  })
  navigateToPage(APP_HOME_PAGE)
}
