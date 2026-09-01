import {
  FARM_LEVEL_CAP,
  buildFarmLevelRewardPreviews,
  type FarmLevelRewardPreview,
} from '../electron/farm/farmLevelCatalog'
import { totalXpForLevel } from '../electron/farm/farmLevel'
import type { FarmPageContext } from '../electron/farm/farmTypes'
import { escapeHtml } from './gamePageShared'

type LevelGuideStatus = 'done' | 'next' | 'locked'

function levelGuideStatus(level: number, farmLevel: number): LevelGuideStatus {
  if (level <= farmLevel) return 'done'
  if (level === farmLevel + 1) return 'next'
  return 'locked'
}

function renderRewardLines(preview: FarmLevelRewardPreview): string {
  const lines = [
    `小麦种子 ×${preview.wheatSeeds}`,
    `随机宠物食物：${preview.foodPoolLabel} ${preview.foodCountLabel}`,
    ...preview.bonusHints,
  ]
  return lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
}

function renderGuideItem(preview: FarmLevelRewardPreview, context: FarmPageContext): string {
  const status = levelGuideStatus(preview.level, context.farmLevel)
  const xpNeed = totalXpForLevel(preview.level)
  const statusLabel =
    status === 'done' ? '已达成' : status === 'next' ? '下一级' : '未解锁'

  return `
    <li class="farm-level-guide-item farm-level-guide-item--${status}">
      <div class="farm-level-guide-item-head">
        <strong class="farm-level-guide-level">Lv.${preview.level}</strong>
        <span class="farm-level-guide-badge">${statusLabel}</span>
      </div>
      <p class="farm-level-guide-xp">累计 ${xpNeed} 经验升级</p>
      <ul class="farm-level-guide-rewards">${renderRewardLines(preview)}</ul>
    </li>
  `
}

export function renderFarmLevelGuide(context: FarmPageContext): string {
  const previews = buildFarmLevelRewardPreviews(FARM_LEVEL_CAP)
  const progress = context.farmXpProgress
  const progressText = progress.isMaxLevel
    ? `当前 Lv.${context.farmLevel}（已满级）`
    : `当前 Lv.${context.farmLevel} · 经验 ${progress.current}/${progress.required}`

  return `
    <div class="farm-level-guide-backdrop" data-farm-level-guide-close></div>
    <div class="farm-level-guide-panel" role="dialog" aria-modal="true" aria-label="农场等级奖励">
      <header class="farm-level-guide-header">
        <div>
          <h2>农场等级奖励</h2>
          <p class="farm-level-guide-subtitle">${escapeHtml(progressText)}</p>
        </div>
        <button type="button" class="text-button farm-level-guide-close" data-farm-level-guide-close aria-label="关闭">×</button>
      </header>
      <p class="farm-level-guide-note">每次升级随机发放；等级越高，种子更多、食物奖池越好，并可能获得额外奖励。</p>
      <ol class="farm-level-guide-list">
        ${previews.map((preview) => renderGuideItem(preview, context)).join('')}
      </ol>
      <footer class="farm-level-guide-footer">
        <button type="button" class="secondary-button" data-farm-level-guide-close>关闭</button>
      </footer>
    </div>
  `
}

export function openFarmLevelGuide(context: FarmPageContext): () => void {
  const host = document.createElement('div')
  host.className = 'farm-level-guide-host'
  host.innerHTML = renderFarmLevelGuide(context)
  document.body.appendChild(host)

  const close = () => {
    host.remove()
  }

  host.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[data-farm-level-guide-close]')) close()
  })

  host.querySelector<HTMLElement>('.farm-level-guide-panel')?.focus()

  return close
}
