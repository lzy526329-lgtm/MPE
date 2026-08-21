/** 只读样板间：当前仅展示墙 + 地板（平面 2D），家具 / 宠物后续再加。 */

export function mountPetHomePage() {
  const root = document.querySelector<HTMLElement>('#pet-home-root')
  if (!root) return

  root.innerHTML = `
    <div class="home-shell">
      <div class="home-stage" aria-label="样板间预览">
        <div class="home-layer home-layer--bg" data-layer="background">
          <div class="home-wall">
            <div class="home-wall-panel"></div>
            <div class="home-wall-panel"></div>
            <div class="home-wall-panel"></div>
            <div class="home-wall-panel"></div>
            <div class="home-baseboard"></div>
          </div>
          <div class="home-floor"></div>
        </div>
      </div>
      <p class="home-hint">样板间施工中：目前只有墙和地板，家具与宠物稍后加入。</p>
    </div>
  `
}
