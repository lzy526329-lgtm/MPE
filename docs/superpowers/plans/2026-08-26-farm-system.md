# 桌宠种菜系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MPT 增加可离线结算的事件驱动农场页（播种/浇水/赶虫/收割 + 简易背包），权威逻辑在 Electron 主进程。

**Architecture:** 纯函数引擎 `farmEngine` 负责生长与操作；`farmStore` 读写 `userData/farm.json`；`farmIpc` 暴露 IPC；渲染层 `farmPage` 只展示与调用。与 `pet.json` 分离，不改现有喂食。

**Tech Stack:** Electron + Vite + TypeScript；纯逻辑用 Vitest；UI 沿用现有 `tool-page` 模式。

**Spec:** `docs/superpowers/specs/2026-08-26-farm-system-design.md`

## Global Constraints

- 存档路径：`app.getPath('userData')/farm.json`，`version: 1`，默认 6 地块
- 作物仅三种：`lettuce` / `tomato` / `pumpkin`（数值以 catalog 为准）
- v1 不接 `pet.coins`、不改 `pet:feed`、不做宠物田边动画
- 非法操作返回 `{ ok: false, error: string }`，不抛未捕获异常到渲染进程
- 时钟回拨：`now < lastSettledAt` 时不推进生长，只对齐时间戳
- 中文 UI 文案；代码标识符英文

## File Structure

| 文件 | 职责 |
|------|------|
| `electron/farm/farmTypes.ts` | 类型定义 |
| `electron/farm/farmCatalog.ts` | 作物表、起步种子、每日种子、概率常量 |
| `electron/farm/farmEngine.ts` | 纯函数：settle、plant、water、debug、harvest、clearWithered、claimDailySeeds、rollOpenEvents |
| `electron/farm/farmEngine.test.ts` | 引擎单测 |
| `electron/farm/farmStore.ts` | 读写/损坏恢复 |
| `electron/farm/farmIpc.ts` | `registerFarmIpc()` |
| `electron/main.ts` | 调用 `registerFarmIpc()` |
| `electron/preload.ts` | 暴露 `farm*` API |
| `src/vite-env.d.ts` | 类型声明 |
| `src/appPages.ts` / `electron/appPages.ts` | `farm-page` |
| `electron/pet.ts` | 右键菜单「农场」 |
| `src/farmPage.ts` | 农场 UI |
| `src/main.ts` | 挂载页面 DOM + `mountFarmPage` |
| `package.json` | `vitest` + `test` script |
| `vitest.config.ts` | 测试配置 |

---

### Task 1: 类型、作物表与 Vitest 脚手架

**Files:**
- Create: `electron/farm/farmTypes.ts`
- Create: `electron/farm/farmCatalog.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`（devDependency `vitest`，script `"test": "vitest run"`）

**Interfaces:**
- Produces: `CropId`, `PlotState`, `FarmState`, `CropDef`, `CROPS`, `DEFAULT_SEEDS`, `DAILY_SEEDS`, `PLOT_COUNT`, `BUG_CHANCE`, `RAIN_CHANCE`, `WEATHER_COOLDOWN_MS`, `getCrop(id)`

- [ ] **Step 1: 安装 vitest 并写配置**

```bash
npm install -D vitest
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['electron/farm/**/*.test.ts'],
  },
})
```

`package.json` scripts 增加：`"test": "vitest run"`。

- [ ] **Step 2: 写入类型与 catalog**

`farmTypes.ts` 按 spec §3 定义 `CropId`、`PlotState`、`FarmState`、`Weather`。

`farmCatalog.ts` 示例：

```ts
import type { CropDef, CropId } from './farmTypes'

export const PLOT_COUNT = 6

export const CROPS: Record<CropId, CropDef> = {
  lettuce: {
    id: 'lettuce',
    name: '生菜',
    growMs: 2 * 60_000,
    waterIntervalMs: 45_000,
    yieldItemId: 'lettuce',
    yieldMin: 1,
    yieldMax: 2,
  },
  tomato: {
    id: 'tomato',
    name: '番茄',
    growMs: 20 * 60_000,
    waterIntervalMs: 5 * 60_000,
    yieldItemId: 'tomato',
    yieldMin: 1,
    yieldMax: 3,
  },
  pumpkin: {
    id: 'pumpkin',
    name: '南瓜',
    growMs: 45 * 60_000,
    waterIntervalMs: 10 * 60_000,
    yieldItemId: 'pumpkin',
    yieldMin: 2,
    yieldMax: 4,
  },
}

export const DEFAULT_SEEDS: Record<string, number> = {
  lettuce: 5,
  tomato: 3,
  pumpkin: 1,
}

export const DAILY_SEEDS: Record<string, number> = {
  lettuce: 2,
  tomato: 1,
}

export const BUG_CHANCE = 0.15
export const RAIN_CHANCE = 0.3
export const WEATHER_COOLDOWN_MS = 30 * 60_000

export function getCrop(id: CropId): CropDef {
  return CROPS[id]
}
```

- [ ] **Step 3: 确认测试命令可跑（暂无用例也 OK）**

```bash
npm test
```

Expected: 0 tests 或 pass（若 vitest 对空 include 报错，先加一个 `expect(PLOT_COUNT).toBe(6)` 的 smoke test 文件）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts electron/farm/farmTypes.ts electron/farm/farmCatalog.ts
git commit -m "$(cat <<'EOF'
feat(farm): add crop catalog, types, and vitest scaffold

EOF
)"
```

---

### Task 2: 默认农场状态与 settle / 操作纯函数

**Files:**
- Create: `electron/farm/farmEngine.ts`
- Create: `electron/farm/farmEngine.test.ts`

**Interfaces:**
- Consumes: types + catalog from Task 1
- Produces:
  - `createDefaultFarm(now: number): FarmState`
  - `settle(state: FarmState, now: number): FarmState`
  - `plant(state, plotIndex, cropId, now): FarmActionResult`
  - `water(state, plotIndex, now): FarmActionResult`
  - `debugPlot(state, plotIndex): FarmActionResult`（赶虫；避免与 JS `debugger` 混淆可用名 `squashBug`）
  - `harvest(state, plotIndex, now, rng?: () => number): FarmActionResult`
  - `clearWithered(state, plotIndex): FarmActionResult`
  - `claimDailySeeds(state, now): FarmActionResult`
  - `rollOpenEvents(state, now, rng?: () => number): FarmState`
  - `type FarmActionResult = { ok: true; state: FarmState } | { ok: false; error: string; state: FarmState }`

规则必须与 spec §4 一致：缺水暂停 progress；有虫 ×0.5；缺水逾 `2 * interval` 枯萎；雨天 interval ×1.5；回拨只对齐时间。

- [ ] **Step 1: 写失败测试（先测 createDefault + 正常成熟）**

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultFarm, settle, plant } from './farmEngine'

describe('farmEngine settle', () => {
  it('matures lettuce when watered and enough time passes', () => {
    const t0 = 1_000_000
    let state = createDefaultFarm(t0)
    const planted = plant(state, 0, 'lettuce', t0)
    expect(planted.ok).toBe(true)
    if (!planted.ok) return
    state = planted.state
    // 生菜 2min，浇水间隔 45s — 中途补浇一次避免枯萎
    state = settle(state, t0 + 40_000)
    const mid = water(state, 0, t0 + 40_000)
    expect(mid.ok).toBe(true)
    if (!mid.ok) return
    state = settle(mid.state, t0 + 120_000)
    expect(state.plots[0]).toMatchObject({ status: 'ready' })
  })
})
```

（实现时按同样风格补：缺水暂停、枯萎、雨天、有虫、回拨、收割入包、每日种子。）

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test
```

Expected: FAIL（模块或函数不存在）。

- [ ] **Step 3: 实现 `farmEngine.ts`**

要点伪代码：

```ts
export function settle(state: FarmState, now: number): FarmState {
  if (now < state.lastSettledAt) {
    return { ...state, lastSettledAt: now }
  }
  const from = state.lastSettledAt
  const plots = state.plots.map((plot) => advancePlot(plot, from, now, state.weather))
  return { ...state, plots, lastSettledAt: now }
}
```

`advancePlot`：仅处理 `growing`；按时间切片或积分：在 [from, now] 内若处于缺水则 progress 不加；有虫则加一半；达 `growMs` 变 `ready`；缺水过久变 `withered`。

`plant` / `water` / `squashBug` / `harvest` / `clearWithered` / `claimDailySeeds` / `rollOpenEvents` 按 spec 表实现。`harvest` 用 `rng()` 在 `[yieldMin, yieldMax]` 取整。

本地日期：`claimDailySeeds` 用 `new Date(now)` 的本地 `YYYY-MM-DD` 与 `lastDailySeedClaimAt` 比较。

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/farm/farmEngine.ts electron/farm/farmEngine.test.ts
git commit -m "$(cat <<'EOF'
feat(farm): implement settle engine and crop actions

EOF
)"
```

---

### Task 3: farmStore 持久化

**Files:**
- Create: `electron/farm/farmStore.ts`
- Create: `electron/farm/farmStore.test.ts`（可用临时目录；若测 fs 过重可改为导出 `parseFarmJson` / `loadFarmFromRaw` 纯函数测损坏恢复）

**Interfaces:**
- Consumes: `createDefaultFarm`, `settle` from engine
- Produces:
  - `loadFarm(userDataPath: string, now: number): FarmState` — 读文件 → 校验 → settle → 写回
  - `saveFarm(userDataPath: string, state: FarmState): void`
  - `withFarm(userDataPath, now, mutator): FarmActionResult` — 串行：load → mutate → save（可用模块级 Promise 链保证互斥）

损坏：读失败或 `version !== 1` 或 `plots` 非法 → 将原文件 rename 为 `farm.json.corrupt.<ts>` → `createDefaultFarm(now)`。

- [ ] **Step 1: 写 `parseOrReset` 单测**

```ts
it('resets corrupt payload', () => {
  const { state, didReset } = parseFarmPayload('not-json', 1234)
  expect(didReset).toBe(true)
  expect(state.version).toBe(1)
  expect(state.plots).toHaveLength(6)
})
```

- [ ] **Step 2: 实现 store + 使测试通过**

- [ ] **Step 3: Commit**

```bash
git add electron/farm/farmStore.ts electron/farm/farmStore.test.ts
git commit -m "$(cat <<'EOF'
feat(farm): persist farm.json with corrupt-file recovery

EOF
)"
```

---

### Task 4: IPC + preload + 类型

**Files:**
- Create: `electron/farm/farmIpc.ts`
- Modify: `electron/main.ts` — `registerFarmIpc()`
- Modify: `electron/preload.ts` — farm API
- Modify: `src/vite-env.d.ts` — Window electronAPI 类型

**Interfaces:**
- Produces IPC：
  - `farm:get-state` → settle + rollOpenEvents（仅 get 时 roll）→ save → 返回 state
  - `farm:plant` `{ plotIndex, cropId }`
  - `farm:water` `{ plotIndex }`
  - `farm:debug` `{ plotIndex }`（实现名 `squashBug`）
  - `farm:harvest` `{ plotIndex }`
  - `farm:clear-withered` `{ plotIndex }`
  - `farm:claim-daily-seeds`
- Preload：`farmGetState`, `farmPlant`, `farmWater`, `farmDebug`, `farmHarvest`, `farmClearWithered`, `farmClaimDailySeeds`

- [ ] **Step 1: 实现 `registerFarmIpc`**

```ts
export function registerFarmIpc() {
  const root = () => app.getPath('userData')
  ipcMain.handle('farm:get-state', () => {
    const now = Date.now()
    return withFarm(root(), now, (s) => ({
      ok: true as const,
      state: rollOpenEvents(s, now),
    }))
  })
  // plant/water/... 同理：withFarm 内调引擎
}
```

在 `electron/main.ts` 于其它 `register*Ipc` 旁调用 `registerFarmIpc()`。

- [ ] **Step 2: preload + vite-env**

对齐现有 `petFeed` 风格的 `ipcRenderer.invoke` 封装。

- [ ] **Step 3: `npm run build:app` 确认类型与打包通过**

```bash
npm run build:app
```

Expected: exit 0。

- [ ] **Step 4: Commit**

```bash
git add electron/farm/farmIpc.ts electron/main.ts electron/preload.ts src/vite-env.d.ts
git commit -m "$(cat <<'EOF'
feat(farm): expose farm IPC through preload

EOF
)"
```

---

### Task 5: 页面 id 与右键入口

**Files:**
- Modify: `src/appPages.ts` — 增加 `'farm-page'` 与标题「农场」
- Modify: `electron/appPages.ts` — 同步 `AppPageId`（若菜单要进工具列表可另加；农场用独立菜单项更清晰）
- Modify: `electron/pet.ts` — 右键菜单在「小游戏」附近加 `{ label: '农场', click: () => openMainPage('farm-page') }`

- [ ] **Step 1: 改 appPages（两端一致）**

- [ ] **Step 2: 改宠物菜单**

参考现有：

```ts
{ label: '与我对话', click: () => openMainPage('pet-chat-page') },
```

同级增加农场项。

- [ ] **Step 3: Commit**

```bash
git add src/appPages.ts electron/appPages.ts electron/pet.ts
git commit -m "$(cat <<'EOF'
feat(farm): add farm-page id and pet context menu entry

EOF
)"
```

---

### Task 6: 农场页 UI 并挂到主窗口

**Files:**
- Create: `src/farmPage.ts`
- Modify: `src/main.ts` — 增加 `#farm-page` section、sidebar 可选入口按钮、`mountFarmPage()`
- Modify: `src/style.css`（仅必要：田格 grid、状态色，避免大改全局）

**Interfaces:**
- Consumes: preload farm* API
- Produces: `mountFarmPage(): void`；`onPageChange` 进入 `farm-page` 时 `farmGetState` 刷新

- [ ] **Step 1: 在 `main.ts` 增加页面骨架**

```html
<section class="tool-page" id="farm-page" hidden>
  <header>
    <div>
      <p class="eyebrow">桌宠玩法</p>
      <h1>农场</h1>
      <p class="subtitle">播种、浇水、赶虫、收割。离开后作物仍会生长。</p>
    </div>
  </header>
  <div class="panel" id="farm-root"></div>
</section>
```

侧边栏可加：`<button class="nav-item" id="open-farm" type="button">农场</button>`，点击 `navigateToPage('farm-page')`。

- [ ] **Step 2: 实现 `mountFarmPage`**

- 渲染 6 格：根据 `status` / `hasBug` 显示文案与按钮（播种选作物、浇水、赶虫、收割、清理枯萎）
- 顶栏：天气、种子、背包列表
- 「领取今日种子」按钮 → `farmClaimDailySeeds`
- 错误：`result.ok === false` 时用现有 toast 或 `alert`/页内 `#farm-message` 显示 `error`
- 进入页面与每次操作成功后刷新

- [ ] **Step 3: 手动验收清单**

1. 右键宠物 → 农场 → 打开主窗口农场页  
2. 种生菜 → 等/改系统时间或临时把 catalog 改短 → 成熟收割进背包  
3. 不浇水直至缺水/枯萎  
4. 领取今日种子当日仅一次  
5. 重启 App 后生长进度仍在  

- [ ] **Step 4: Commit**

```bash
git add src/farmPage.ts src/main.ts src/style.css
git commit -m "$(cat <<'EOF'
feat(farm): add farm page UI and navigation

EOF
)"
```

---

### Task 7: 玩法文档同步与收尾

**Files:**
- Modify: `docs/pet-gameplay.md` — §10 增加「农场」一条指向 design spec
- Modify: `README.md` — 桌宠能力表增加一行「农场」
- Modify: `docs/superpowers/specs/2026-08-26-farm-system-design.md` — 若实现中有微调，回写最终数值

- [ ] **Step 1: 更新 README / pet-gameplay 各一段**

- [ ] **Step 2: `npm test && npm run build:app`**

Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add docs/pet-gameplay.md README.md docs/superpowers/specs/2026-08-26-farm-system-design.md
git commit -m "$(cat <<'EOF'
docs: document farm gameplay entry points

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 项 | Task |
|---------|------|
| 独立 farm.json / 引擎分层 | 1–4 |
| 6 地块、三作物、种子与背包 | 1–2, 6 |
| settle 离线、缺水、枯萎、雨、虫 | 2 |
| 打开页 roll 事件 | 2, 4 |
| 操作 IPC | 4 |
| 农场页 + 菜单 | 5–6 |
| 损坏恢复、回拨 | 2–3 |
| 每日种子 | 2, 6 |
| 不接喂食/金币/动画 | 全局约束 |
| 文档 | 7 |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-farm-system.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每任务新开 subagent，任务间复查，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 批量推进并设检查点  

选哪种？
