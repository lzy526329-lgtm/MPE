# 2D 鱼塘钓鱼玩法 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MPT 面板中增加手绘俯视 2D 鱼塘，打通购买鱼饵、限时收杆、鱼获入包、图鉴和出售换金币的完整玩法。

**Architecture:** 钓鱼目录和抽取规则实现为无副作用纯函数；一次抛竿的隐藏结果和时限只保存在 Electron 主进程内存会话中，鱼饵、鱼获、图鉴和金币进入统一 `game.json`。渲染层使用显式状态机驱动 DOM/CSS 动画，不参与奖励判定。

**Tech Stack:** TypeScript 5.8、Electron 35 IPC、原生 DOM/CSS、Vitest 4、JSON 目录配置

**Spec:** `docs/superpowers/specs/2026-09-08-fishing-pond-design.md`

## Global Constraints

- 使用手绘俯视 2D 鱼塘，不引入 Three.js、Canvas 游戏引擎或新的运行时依赖。
- 首版固定 5 种鱼、2 种鱼饵、1.2 秒收杆窗口、2.5～7 秒咬钩等待和 100 条鱼获上限。
- 与农场、商店、背包共用统一金币和 `game.json`。
- 鱼种、重量、售价和时间窗口只能由主进程生成并校验。
- 已有版本 1 存档必须无损迁移到版本 2，不能重复发放初始金币。
- 尊重 `prefers-reduced-motion`；关键状态必须同时提供文字反馈。
- 每个任务只提交该任务列出的文件，不提交 `.superpowers/` 或用户的其他工作区改动。

## File Structure

### 新增

- `electron/fishing/fishingTypes.ts`：鱼、鱼饵、鱼获、会话和 IPC 结果的共享类型。
- `electron/fishing/fishCatalog.json`：5 种鱼的稀有度、重量、售价和图片路径。
- `electron/fishing/fishCatalog.ts`：目录解析、校验和查询。
- `electron/fishing/baitCatalog.json`：2 种鱼饵的价格和稀有度概率。
- `electron/fishing/baitCatalog.ts`：鱼饵目录解析、校验和查询。
- `electron/fishing/fishingEngine.ts`：鱼种抽取、重量与售价计算、鱼获创建的纯函数。
- `electron/fishing/fishingEngine.test.ts`：抽取边界、重量和售价测试。
- `electron/fishing/fishingSession.ts`：按渲染进程 ID 管理一次性钓鱼会话。
- `electron/fishing/fishingSession.test.ts`：过早、成功、超时、重复和取消测试。
- `electron/fishing/fishingIpc.ts`：鱼塘状态、抛竿、收杆和取消 IPC。
- `electron/fishing/fishingIpc.test.ts`：IPC 处理器与持久化边界测试。
- `src/fishingStateMachine.ts`：鱼塘 UI 状态与合法迁移。
- `src/fishingStateMachine.test.ts`：渲染状态机测试。
- `src/fishingPage.ts`：鱼塘页面渲染、定时器、IPC 调用和动画触发。
- `src/fishingPage.test.ts`：鱼塘纯渲染和交互辅助函数测试。
- `src/fishingAssets.ts`：鱼塘与鱼类资源 URL、图标 HTML。
- `public/fishing/pond-bg.svg`：俯视鱼塘背景。
- `public/fishing/bobber.svg`：浮漂。
- `public/fishing/bait-basic.svg`、`public/fishing/bait-premium.svg`：鱼饵图标。
- `public/fishing/fish-crucian.svg`、`fish-carp.svg`、`fish-grass-carp.svg`、`fish-mandarin.svg`、`fish-golden-koi.svg`：5 种鱼的统一手绘图标。

### 修改

- `electron/game/gameTypes.ts`：存档版本 2、鱼饵/鱼获库存和钓鱼状态。
- `electron/game/gameEngine.ts`：克隆、默认状态、视图、购买鱼饵与出售鱼获。
- `electron/game/gameEngine.test.ts`：新经济操作测试。
- `electron/game/gameStore.ts`：版本 1→2 迁移和钓鱼字段修复。
- `electron/game/gameStore.test.ts`：迁移、损坏字段和上限测试。
- `electron/game/gameIpc.ts`、`electron/game/gameIpc.test.ts`：鱼饵购买与鱼获出售处理器。
- `electron/game/gameCatalog.ts`：导出鱼饵商品。
- `electron/main.ts`：注册钓鱼 IPC。
- `electron/preload.ts`、`src/vite-env.d.ts`：暴露类型安全的钓鱼 API。
- `src/appPages.ts`、`electron/appPages.ts`：注册 `fishing-page`。
- `src/main.ts`：菜单、页面容器、挂载与导航。
- `src/appPages.test.ts`：页面 ID 和标题测试。
- `src/shopPage.ts`、`src/shopPage.test.ts`：商店“鱼饵”页签。
- `src/backpackPage.ts`、`src/backpackPage.test.ts`：背包“鱼获”页签及出售。
- `src/gamePageShared.ts`：加入 `baits` 商店页签类型。
- `src/style.css`：鱼塘场景、HUD、浮漂、波纹、鱼影、弹层和响应式样式。

---

### Task 1: 钓鱼目录与随机鱼获引擎

**Files:**
- Create: `electron/fishing/fishingTypes.ts`
- Create: `electron/fishing/fishCatalog.json`
- Create: `electron/fishing/fishCatalog.ts`
- Create: `electron/fishing/baitCatalog.json`
- Create: `electron/fishing/baitCatalog.ts`
- Create: `electron/fishing/fishingEngine.ts`
- Test: `electron/fishing/fishingEngine.test.ts`

**Interfaces:**
- Produces: `BaitId`, `FishId`, `FishRarity`, `FishCatch`, `FishingState`
- Produces: `getFishCatalogEntry(fishId)`, `getBaitCatalogEntry(baitId)`, `buildBaitOffers()`
- Produces: `chooseFish(baitId, rng)`, `createFishCatch(fishId, now, id, rng)`

- [ ] **Step 1: 写目录结构与抽取边界的失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { chooseFish, createFishCatch } from './fishingEngine'

describe('fishingEngine', () => {
  it.each([
    [0, 'crucian'],
    [0.749999, 'carp'],
    [0.75, 'grassCarp'],
    [0.95, 'mandarin'],
  ] as const)('maps basic bait roll %s to %s', (roll, expectedRarityFish) => {
    expect(chooseFish('basic', () => roll)).toMatchObject({ fishId: expectedRarityFish })
  })

  it('creates a bounded catch and deterministic price', () => {
    const result = createFishCatch('crucian', 1_000, 'catch-1', () => 0)
    expect(result).toEqual({
      id: 'catch-1',
      fishId: 'crucian',
      weightKg: 0.2,
      sellPrice: 2,
      caughtAt: 1_000,
    })
  })
})
```

为避免“同稀有度鱼种权重”使单个随机数测试含糊，`chooseFish` 使用同一个 `[0,1)` roll：先按累计稀有度区间定位，再将区间内归一化位置映射到该稀有度鱼种。普通区间前半为鲫鱼，后半为鲤鱼。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- electron/fishing/fishingEngine.test.ts`

Expected: FAIL，提示 `./fishingEngine` 或导出不存在。

- [ ] **Step 3: 创建精确类型和 JSON 目录**

`fishingTypes.ts`：

```ts
export type BaitId = 'basic' | 'premium'
export type FishId = 'crucian' | 'carp' | 'grassCarp' | 'mandarin' | 'goldenKoi'
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'precious'

export type FishCatch = {
  id: string
  fishId: FishId
  weightKg: number
  sellPrice: number
  caughtAt: number
}

export type FishingState = {
  discoveredFish: FishId[]
  totalCaught: number
}

export type BaitOffer = {
  baitId: BaitId
  name: string
  price: number
  description: string
  image: string
}
```

`fishCatalog.json` 使用以下值：

```json
{
  "version": 1,
  "fish": {
    "crucian": { "name": "鲫鱼", "rarity": "common", "weightMin": 0.2, "weightMax": 1, "basePrice": 3, "image": "fish-crucian.svg" },
    "carp": { "name": "鲤鱼", "rarity": "common", "weightMin": 0.5, "weightMax": 2.5, "basePrice": 5, "image": "fish-carp.svg" },
    "grassCarp": { "name": "草鱼", "rarity": "uncommon", "weightMin": 1, "weightMax": 5, "basePrice": 8, "image": "fish-grass-carp.svg" },
    "mandarin": { "name": "鳜鱼", "rarity": "rare", "weightMin": 0.5, "weightMax": 3, "basePrice": 15, "image": "fish-mandarin.svg" },
    "goldenKoi": { "name": "金色锦鲤", "rarity": "precious", "weightMin": 0.3, "weightMax": 2, "basePrice": 30, "image": "fish-golden-koi.svg" }
  }
}
```

`baitCatalog.json` 使用普通鱼饵 `price: 2`、高级鱼饵 `price: 6`，稀有度权重分别为 `{ common: 0.75, uncommon: 0.2, rare: 0.05, precious: 0 }` 和 `{ common: 0.45, uncommon: 0.3, rare: 0.2, precious: 0.05 }`。

- [ ] **Step 4: 实现目录校验和纯函数**

`fishingEngine.ts` 的核心计算：

```ts
export function createFishCatch(
  fishId: FishId,
  now: number,
  id: string,
  rng: () => number = Math.random,
): FishCatch {
  const fish = getFishCatalogEntry(fishId)
  const roll = clampRoll(rng())
  const weightKg = roundTo(fish.weightMin + (fish.weightMax - fish.weightMin) * roll, 2)
  const position = fish.weightMax === fish.weightMin
    ? 0
    : (weightKg - fish.weightMin) / (fish.weightMax - fish.weightMin)
  const multiplier = 0.8 + position * 0.7
  return {
    id,
    fishId,
    weightKg,
    sellPrice: Math.max(1, Math.round(fish.basePrice * multiplier)),
    caughtAt: now,
  }
}
```

目录模块加载时校验：版本为 1、所有价格和重量为有限非负数、`weightMax >= weightMin`、每种鱼属于已知稀有度、每种鱼饵概率和误差不超过 `1e-9`。

- [ ] **Step 5: 运行钓鱼引擎测试**

Run: `npm test -- electron/fishing/fishingEngine.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交目录与引擎**

```bash
git add electron/fishing
git commit -m "feat(fishing): add fish catalogs and catch engine"
```

---

### Task 2: 统一存档版本 2 与兼容迁移

**Files:**
- Modify: `electron/game/gameTypes.ts`
- Modify: `electron/game/gameEngine.ts`
- Modify: `electron/game/gameStore.ts`
- Test: `electron/game/gameStore.test.ts`
- Test: `electron/game/gameEngine.test.ts`

**Interfaces:**
- Consumes: `BaitId`, `FishCatch`, `FishingState`, `FishId`
- Produces: `GameState.version: 2`
- Produces: `InventoryState.baits`, `InventoryState.fish`, `GameState.fishing`
- Produces: `normalizeFishCatch(value): FishCatch | null` as an internal store helper

- [ ] **Step 1: 写版本 1 迁移和局部修复失败测试**

```ts
it('migrates a version 1 save without changing wallet or farm', () => {
  const legacy = createVersionOneFixture({ coins: 42 })
  const state = parseGamePayload(JSON.stringify(legacy), 2_000)
  expect(state.version).toBe(2)
  expect(state.wallet.coins).toBe(42)
  expect(state.inventory.baits).toEqual({ basic: 0, premium: 0 })
  expect(state.inventory.fish).toEqual([])
  expect(state.fishing).toEqual({ discoveredFish: [], totalCaught: 0 })
})

it('drops invalid catches and caps valid catches at 100', () => {
  const raw = createVersionTwoFixtureWithFish(101)
  raw.inventory.fish.push({ id: '', fishId: 'hacker', weightKg: -1, sellPrice: -9, caughtAt: NaN })
  const state = parseGamePayload(JSON.stringify(raw), 2_000)
  expect(state.inventory.fish).toHaveLength(100)
  expect(state.wallet.coins).toBe(raw.wallet.coins)
})
```

- [ ] **Step 2: 运行存档和引擎测试并确认失败**

Run: `npm test -- electron/game/gameStore.test.ts electron/game/gameEngine.test.ts`

Expected: FAIL，版本仍为 1 且字段不存在。

- [ ] **Step 3: 扩展游戏类型和所有克隆/默认视图**

在 `InventoryState` 增加：

```ts
baits: Record<BaitId, number>
fish: FishCatch[]
```

在 `GameState` 增加 `fishing: FishingState` 并把版本字面量改为 `2`。`GameViewState` 增加 `fishing`、`baitOffers`；`cloneInventory` 深拷贝鱼获，`cloneGameState` 深拷贝图鉴。`createDefaultGameState`、`migrateLegacyGameState` 和 `emptyGameViewState` 都初始化空钓鱼字段。

- [ ] **Step 4: 实现版本 1/2 解析与字段修复**

`parseGamePayload` 接受 `value.version === 1 || value.version === 2`。版本 1 直接补空字段；版本 2：

```ts
const fish = Array.isArray(inventory.fish)
  ? inventory.fish.map(normalizeFishCatch).filter((item): item is FishCatch => item !== null).slice(0, 100)
  : []
const discoveredFish = parseFishIds(fishing.discoveredFish)
const totalCaught = normalizeItemCount(fishing.totalCaught)
```

`normalizeFishCatch` 要求非空 ID、已知鱼种、重量落在目录区间、售价为正整数、`caughtAt` 为有限非负数。鱼饵使用 `normalizeItemCount`。序列化后 `dirty` 会触发原子写回版本 2。

- [ ] **Step 5: 运行存档、引擎及现有农场兼容测试**

Run: `npm test -- electron/game/gameStore.test.ts electron/game/gameEngine.test.ts electron/farm/farmIpc.test.ts`

Expected: PASS，原有版本 1 测试按新规范更新后也通过。

- [ ] **Step 6: 提交存档迁移**

```bash
git add electron/game/gameTypes.ts electron/game/gameEngine.ts electron/game/gameStore.ts electron/game/gameStore.test.ts electron/game/gameEngine.test.ts
git commit -m "feat(fishing): migrate unified save to version two"
```

---

### Task 3: 鱼饵购买与鱼获出售经济操作

**Files:**
- Modify: `electron/game/gameCatalog.ts`
- Modify: `electron/game/gameEngine.ts`
- Modify: `electron/game/gameTypes.ts`
- Modify: `electron/game/gameIpc.ts`
- Modify: `electron/preload.ts`
- Test: `electron/game/gameEngine.test.ts`
- Test: `electron/game/gameIpc.test.ts`

**Interfaces:**
- Consumes: `buildBaitOffers()`, `BaitId`, `FishCatch`
- Produces: `buyBait(state, baitId)`, `sellFish(state, catchId)`, `sellAllFish(state)`
- Produces IPC: `game:buy-bait`, `game:sell-fish`, `game:sell-all-fish`

- [ ] **Step 1: 写购买和出售失败测试**

```ts
it('buys one basic bait with shared coins', () => {
  const result = buyBait(createDefaultGameState(1_000), 'basic')
  expect(result.ok).toBe(true)
  expect(result.game.wallet.coins).toBe(98)
  expect(result.game.inventory.baits.basic).toBe(1)
})

it('sells one catch by id and credits its stored price', () => {
  const state = withCatch(createDefaultGameState(1_000), {
    id: 'fish-1', fishId: 'crucian', weightKg: 0.4, sellPrice: 4, caughtAt: 1_000,
  })
  const result = sellFish(state, 'fish-1')
  expect(result.game.wallet.coins).toBe(104)
  expect(result.game.inventory.fish).toEqual([])
})

it('sells all catches in one atomic mutation', () => {
  const result = sellAllFish(withPricedCatches(createDefaultGameState(1_000), [4, 15]))
  expect(result.game.wallet.coins).toBe(119)
  expect(result.game.inventory.fish).toEqual([])
})
```

- [ ] **Step 2: 运行经济测试并确认失败**

Run: `npm test -- electron/game/gameEngine.test.ts electron/game/gameIpc.test.ts`

Expected: FAIL，三个 mutation 和 IPC 处理器不存在。

- [ ] **Step 3: 实现不可变经济 mutation**

沿用 `buySeed` 的错误结构。`buyBait` 校验商品和金币；`sellFish` 按唯一 ID 找鱼；`sellAllFish` 在空库存时返回 `INSUFFICIENT_STOCK`。所有成功结果通过 `toGameViewState(game)` 返回新视图，不能原地修改输入。

- [ ] **Step 4: 接入 game handler、IPC 和 preload**

为 `GameHandlers` 增加三个方法，并沿用 `withGame`、`renderableState`、`publish`、`publishPetStatus` 模式。`preload.ts` 暴露：

```ts
gameBuyBait: (baitId: BaitId) => ipcRenderer.invoke('game:buy-bait', baitId),
gameSellFish: (catchId: string) => ipcRenderer.invoke('game:sell-fish', catchId),
gameSellAllFish: () => ipcRenderer.invoke('game:sell-all-fish'),
```

- [ ] **Step 5: 运行经济和 IPC 测试**

Run: `npm test -- electron/game/gameEngine.test.ts electron/game/gameIpc.test.ts`

Expected: PASS，包括金币不足、未知商品、未知鱼获、空库存和持久化失败。

- [ ] **Step 6: 提交经济操作**

```bash
git add electron/game electron/preload.ts
git commit -m "feat(fishing): add bait purchases and fish sales"
```

---

### Task 4: 一次性钓鱼会话与安全结算

**Files:**
- Create: `electron/fishing/fishingSession.ts`
- Create: `electron/fishing/fishingSession.test.ts`
- Create: `electron/fishing/fishingIpc.ts`
- Create: `electron/fishing/fishingIpc.test.ts`
- Modify: `electron/game/gameEngine.ts`
- Modify: `electron/game/gameTypes.ts`
- Modify: `electron/main.ts`

**Interfaces:**
- Produces: `createFishingSessionManager({ now, rng, randomUUID })`
- Produces: `consumeBaitForCast(game, baitId)`, `addCaughtFish(game, fishCatch)`
- Produces IPC results `FishingCastResult`, `FishingReelResult`, `FishingViewState`
- Produces IPC: `fishing:get-state`, `fishing:cast`, `fishing:reel`, `fishing:cancel`

- [ ] **Step 1: 写会话时机失败测试**

```ts
it('allows one reel only inside the bite window', () => {
  let now = 1_000
  const manager = createFishingSessionManager({
    now: () => now,
    rng: () => 0,
    randomUUID: () => 'token-1',
  })
  const cast = manager.start(7, 'basic')
  expect(cast.biteAt).toBe(3_500)
  expect(cast.deadline).toBe(4_700)

  now = 3_499
  expect(manager.reel(7, cast.token)).toMatchObject({ status: 'too-early' })
  expect(manager.reel(7, cast.token)).toMatchObject({ status: 'invalid' })
})

it('returns a catch during the window and consumes the token', () => {
  let now = 1_000
  const manager = createFishingSessionManager({
    now: () => now,
    rng: () => 0,
    randomUUID: () => 'token-2',
  })
  const cast = manager.start(7, 'basic')
  now = cast.biteAt
  expect(manager.reel(7, cast.token)).toMatchObject({
    status: 'caught',
    catch: { id: 'token-2', fishId: 'crucian' },
  })
  expect(manager.reel(7, cast.token)).toEqual({ status: 'invalid' })
})

it('expires, cancels and isolates sessions by owner', () => {
  let now = 1_000
  let sequence = 0
  const manager = createFishingSessionManager({
    now: () => now,
    rng: () => 0,
    randomUUID: () => `token-${++sequence}`,
  })
  const expired = manager.start(7, 'basic')
  now = expired.deadline + 1
  expect(manager.reel(7, expired.token)).toEqual({ status: 'too-late' })

  now = 2_000
  const isolated = manager.start(7, 'premium')
  expect(manager.reel(8, isolated.token)).toEqual({ status: 'invalid' })
  expect(manager.cancel(7, isolated.token)).toBe(true)
  expect(manager.reel(7, isolated.token)).toEqual({ status: 'invalid' })
})
```

再增加一个断言：同一 owner 第二次 `start` 后，第一个 token 返回 `invalid`，第二个 token 仍可按时间结算。

- [ ] **Step 2: 运行会话测试并确认失败**

Run: `npm test -- electron/fishing/fishingSession.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现内存会话管理器**

```ts
type ActiveSession = {
  ownerId: number
  token: string
  baitId: BaitId
  biteAt: number
  deadline: number
  catch: FishCatch
}

const BITE_MIN_MS = 2_500
const BITE_MAX_MS = 7_000
const REEL_WINDOW_MS = 1_200
```

`start` 创建鱼获和时间后写入 `Map<number, ActiveSession>`；`reel` 在任何结果下先删除会话，再返回 `too-early | too-late | caught | invalid`；`cancel` 只允许 owner 删除自己的 token。

- [ ] **Step 4: 写 IPC handler 失败测试**

测试场景：

```ts
it('deducts bait before publishing a cast session', async () => {
  const result = await handlers.cast(12, 'basic')
  expect(result.ok).toBe(true)
  expect(result.state.inventory.baits.basic).toBe(0)
  expect(result.session).toMatchObject({ token: 'token-1', windowMs: 1_200 })
})

it('does not deduct bait when fish inventory has 100 catches', async () => {
  const result = await handlers.cast(12, 'basic')
  expect(result).toMatchObject({ ok: false, code: 'FISH_BAG_FULL' })
})
```

- [ ] **Step 5: 实现持久化 mutation 和 fishing handler**

`consumeBaitForCast` 在同一个 mutation 中按顺序校验鱼获上限、鱼饵 ID 和库存，再扣 1。`addCaughtFish` 校验未满、ID 未重复后追加鱼获、更新去重图鉴并将 `totalCaught + 1`。

`cast(ownerId, baitId)` 先用 `withGame` 持久化扣饵，成功后才 `sessions.start(ownerId, baitId)`。`reel(ownerId, token)` 先由 session manager 判定；只有 `caught` 才调用 `withGame(addCaughtFish)`。持久化失败返回错误且不向渲染层乐观增加鱼获。

- [ ] **Step 6: 注册 IPC 并按 sender ID 隔离**

```ts
ipcMain.handle('fishing:cast', (event, baitId: BaitId) =>
  handlers.cast(event.sender.id, baitId))
ipcMain.handle('fishing:reel', (event, token: string) =>
  handlers.reel(event.sender.id, token))
ipcMain.handle('fishing:cancel', (event, token: string) =>
  handlers.cancel(event.sender.id, token))
```

`electron/main.ts` 在 `registerGameIpc` 之后调用 `registerFishingIpc(() => win)`。成功扣饵和成功钓获都广播 `game:state-changed`。

- [ ] **Step 7: 运行会话、IPC、存档并发测试**

Run: `npm test -- electron/fishing electron/game/gameStore.test.ts electron/game/gameEngine.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交安全结算**

```bash
git add electron/fishing electron/game/gameEngine.ts electron/game/gameTypes.ts electron/main.ts
git commit -m "feat(fishing): add secure timed fishing sessions"
```

---

### Task 5: 渲染 API、页面注册与 UI 状态机

**Files:**
- Create: `src/fishingStateMachine.ts`
- Create: `src/fishingStateMachine.test.ts`
- Modify: `electron/preload.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `src/appPages.ts`
- Modify: `electron/appPages.ts`
- Modify: `src/appPages.test.ts`

**Interfaces:**
- Consumes: `FishingCastResult`, `FishingReelResult`, `FishingViewState`
- Produces: `FishingUiState`, `FishingUiEvent`, `reduceFishingState(state, event)`
- Produces renderer methods: `fishingGetState`, `fishingCast`, `fishingReel`, `fishingCancel`

- [ ] **Step 1: 写合法状态迁移失败测试**

```ts
it('moves idle through casting, waiting, biting and resolving', () => {
  let state: FishingUiState = { phase: 'idle' }
  state = reduceFishingState(state, { type: 'CAST_REQUESTED', baitId: 'basic' })
  expect(state.phase).toBe('casting')
  state = reduceFishingState(state, {
    type: 'CAST_ACCEPTED', token: 't1', biteAt: 3_500, deadline: 4_700,
  })
  expect(state.phase).toBe('waiting')
  state = reduceFishingState(state, { type: 'BITE_STARTED' })
  expect(state.phase).toBe('biting')
  state = reduceFishingState(state, { type: 'REEL_REQUESTED' })
  expect(state.phase).toBe('resolving')
})

it('ignores reel requests from idle and waiting', () => {
  expect(reduceFishingState({ phase: 'idle' }, { type: 'REEL_REQUESTED' }))
    .toEqual({ phase: 'idle' })
})
```

- [ ] **Step 2: 运行状态机测试并确认失败**

Run: `npm test -- src/fishingStateMachine.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现判别联合状态机**

状态必须用判别联合承载所需数据：

```ts
export type FishingUiState =
  | { phase: 'idle' }
  | { phase: 'casting'; baitId: BaitId }
  | { phase: 'waiting'; baitId: BaitId; token: string; biteAt: number; deadline: number }
  | { phase: 'biting'; baitId: BaitId; token: string; deadline: number }
  | { phase: 'resolving'; token: string }
  | { phase: 'caught'; catch: FishCatch }
  | { phase: 'failed'; reason: 'too-early' | 'too-late' | 'cancelled' | 'error' }
```

非法事件返回原对象；`RESET` 从 `caught/failed` 回到 `idle`。

- [ ] **Step 4: 暴露 preload API 并注册页面 ID**

`preload.ts` 增加四个方法；`vite-env.d.ts` 使用相同签名。`src/appPages.ts` 和 `electron/appPages.ts` 增加 `fishing-page` 与标题“鱼塘”。`src/appPages.test.ts` 断言 `APP_PAGE_TITLES['fishing-page'] === '鱼塘'`，并断言未知页面仍被导航层拒绝。

- [ ] **Step 5: 运行状态机和页面注册测试**

Run: `npm test -- src/fishingStateMachine.test.ts src/appPages.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交渲染基础设施**

```bash
git add src/fishingStateMachine.ts src/fishingStateMachine.test.ts electron/preload.ts src/vite-env.d.ts src/appPages.ts electron/appPages.ts src/appPages.test.ts
git commit -m "feat(fishing): register pond page and ui state machine"
```

---

### Task 6: 手绘鱼塘资源与完整页面交互

**Files:**
- Create: `src/fishingAssets.ts`
- Create: `src/fishingPage.ts`
- Create: `src/fishingPage.test.ts`
- Create: `public/fishing/pond-bg.svg`
- Create: `public/fishing/bobber.svg`
- Create: `public/fishing/bait-basic.svg`
- Create: `public/fishing/bait-premium.svg`
- Create: `public/fishing/fish-crucian.svg`
- Create: `public/fishing/fish-carp.svg`
- Create: `public/fishing/fish-grass-carp.svg`
- Create: `public/fishing/fish-mandarin.svg`
- Create: `public/fishing/fish-golden-koi.svg`
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `reduceFishingState`, preload 钓鱼 API、鱼类和鱼饵目录
- Produces: `mountFishingPage()`, `renderFishingPage(view, uiState, selectedBait, message)`
- Produces: `getFishImagePath(fishId)`, `getBaitImagePath(baitId)`

- [ ] **Step 1: 写纯渲染与时间判断失败测试**

```ts
it('renders cast controls and selected bait while idle', () => {
  const html = renderFishingPage(viewFixture(), { phase: 'idle' }, 'basic', '')
  expect(html).toContain('普通鱼饵')
  expect(html).toContain('data-fishing-cast')
  expect(html).toContain('图鉴 0 / 5')
})

it('maps current time to bite and timeout events', () => {
  expect(nextTimedEvent(waitingFixture(), 3_499)).toBeNull()
  expect(nextTimedEvent(waitingFixture(), 3_500)).toEqual({ type: 'BITE_STARTED' })
  expect(nextTimedEvent(bitingFixture(), 4_701)).toEqual({ type: 'BITE_EXPIRED' })
})
```

- [ ] **Step 2: 运行页面测试并确认失败**

Run: `npm test -- src/fishingPage.test.ts`

Expected: FAIL，页面模块不存在。

- [ ] **Step 3: 创建统一 SVG 资源**

`pond-bg.svg` 使用 16:9 `viewBox="0 0 1600 900"`，包含不规则青蓝池水、沙土岸边、草地、石块和水草；不包含文字。5 个鱼 SVG 使用同一 `viewBox="0 0 240 120"`、粗深色描边、两到三档纯色阴影和透明背景。金色锦鲤使用金黄主体与橙色斑纹。所有 SVG 必须设置描述性 `<title>`，装饰性加载时由 HTML 使用空 `alt`。

- [ ] **Step 4: 实现页面渲染和事件委托**

`src/main.ts` 增加侧栏按钮、页面容器、挂载和导航：

```html
<button class="nav-item pet-chat-sidebar-btn" id="open-fishing" type="button">鱼塘</button>
```

```ts
mountFishingPage()
document.querySelector<HTMLButtonElement>('#open-fishing')?.addEventListener('click', () => {
  navigateToPage('fishing-page')
})
```

页面结构固定为：

```html
<div class="fishing-scene">
  <div class="fishing-hud">金币、鱼饵、图鉴</div>
  <div class="fishing-pond" data-fishing-pond>
    <div class="fishing-water-shimmer"></div>
    <div class="fishing-fish-shadows">三条装饰鱼影</div>
    <img class="fishing-bobber" alt="" />
    <div class="fishing-ripple"></div>
    <p class="fishing-status" role="status"></p>
  </div>
  <div class="fishing-bait-bar">两个鱼饵按钮和主操作按钮</div>
</div>
```

根节点只绑定一次点击事件。`cast` 时先进入 `casting`，调用 `fishingCast` 成功后用服务端绝对时间安排 `BITE_STARTED`；点击等待中的主按钮仍调用 `fishingReel`，由主进程返回 `too-early`。进入 `biting` 后按钮文案为“收杆！”。

- [ ] **Step 5: 实现定时器和页面生命周期清理**

维护 `biteTimer`、`deadlineTimer`、`resetTimer`。每次状态变化前清理旧 timer。`onPageChange` 离开 `fishing-page` 时：

```ts
if (activeToken) void window.electronAPI.fishingCancel(activeToken)
clearTimers()
uiState = { phase: 'idle' }
```

重新进入时调用 `fishingGetState`。`beforeunload` 同样尽力取消。IPC 失败显示明确错误并刷新一次状态，不能本地增加库存。

- [ ] **Step 6: 实现 CSS 动画和低动画降级**

CSS 包含：

- `.fishing-pond` 使用背景 SVG、`aspect-ratio: 16 / 9` 和安全溢出。
- `@keyframes fishing-shimmer`、`fishing-shadow-swim`、`fishing-ripple`、`fishing-bobber-bite`。
- `biting` 状态让浮漂快速下沉、状态条高亮、收杆按钮脉冲。
- `@media (prefers-reduced-motion: reduce)` 禁用 shimmer、鱼影循环和脉冲，只保留静态浮漂位置及文字。
- 小窗口下 HUD 换行、鱼饵栏横向滚动，主按钮保持可见。

- [ ] **Step 7: 运行页面、状态机和应用类型检查**

Run: `npm test -- src/fishingPage.test.ts src/fishingStateMachine.test.ts`

Expected: PASS。

Run: `npm run build:app`

Expected: TypeScript 和 Vite 构建均成功。

- [ ] **Step 8: 提交鱼塘页面**

```bash
git add src/fishingAssets.ts src/fishingPage.ts src/fishingPage.test.ts src/main.ts src/style.css public/fishing
git commit -m "feat(fishing): add hand-painted pond gameplay page"
```

---

### Task 7: 商店鱼饵页签

**Files:**
- Modify: `src/gamePageShared.ts`
- Modify: `src/shopPage.ts`
- Test: `src/shopPage.test.ts`

**Interfaces:**
- Consumes: `GameViewState.baitOffers`, `inventory.baits`, `gameBuyBait`
- Produces: `GameTab` 包含 `'baits'`

- [ ] **Step 1: 写鱼饵商店失败测试**

```ts
it('renders bait offers with owned count and affordability', () => {
  const state = gameViewFixture({ coins: 5, basicBaits: 2 })
  const html = renderShopPage(state, defaultOptions({ activeTab: 'baits' }))
  expect(html).toContain('鱼饵')
  expect(html).toContain('普通鱼饵')
  expect(html).toContain('拥有 2')
  expect(html).toContain('高级鱼饵')
  expect(html).toContain('金币不足')
})
```

- [ ] **Step 2: 运行商店测试并确认失败**

Run: `npm test -- src/shopPage.test.ts`

Expected: FAIL，`baits` 不是合法页签或页面没有鱼饵商品。

- [ ] **Step 3: 实现页签、渲染和购买**

把 `GameTab` 扩为 `'food' | 'seeds' | 'supplies' | 'decors' | 'baits'`，但保留 `DEFAULT_GAME_TAB = 'seeds'`。`ShopRenderOptions` 增加 `busyBaitId`。渲染鱼饵卡片时显示图标、描述、拥有数量和价格，购买按钮使用 `data-buy-bait`。

事件委托调用 `window.electronAPI.gameBuyBait(baitId)`，沿用现有 generation 失效机制；成功状态直接替换本地 `state`，错误通过 `gameErrorMessage` 显示。

- [ ] **Step 4: 运行商店和共享页签测试**

Run: `npm test -- src/shopPage.test.ts`

Expected: PASS，原有四类商品测试不回归。

- [ ] **Step 5: 提交商店接入**

```bash
git add src/gamePageShared.ts src/shopPage.ts src/shopPage.test.ts
git commit -m "feat(fishing): sell bait in the shared shop"
```

---

### Task 8: 背包鱼获页签和出售

**Files:**
- Modify: `src/backpackPage.ts`
- Test: `src/backpackPage.test.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `inventory.fish`, `fishing.discoveredFish`, `gameSellFish`, `gameSellAllFish`
- Produces: `BackpackTab` 包含 `'fish'`

- [ ] **Step 1: 写鱼获分组和出售失败测试**

```ts
it('groups catches by species while preserving per-catch actions', () => {
  const html = renderBackpackPage(
    gameViewWithFish([
      { id: 'a', fishId: 'crucian', weightKg: 0.4, sellPrice: 3, caughtAt: 1 },
      { id: 'b', fishId: 'crucian', weightKg: 0.8, sellPrice: 4, caughtAt: 2 },
    ]),
    defaultBackpackOptions({ activeTab: 'fish' }),
  )
  expect(html).toContain('鲫鱼')
  expect(html).toContain('共 2 条')
  expect(html).toContain('data-sell-fish="a"')
  expect(html).toContain('全部出售 · 7 金币')
})
```

- [ ] **Step 2: 运行背包测试并确认失败**

Run: `npm test -- src/backpackPage.test.ts`

Expected: FAIL，鱼获页签和渲染不存在。

- [ ] **Step 3: 实现鱼获页签和两类出售操作**

`BackpackTab` 加 `'fish'`；`BackpackRenderOptions` 加 `busyCatchId`、`sellingAllFish`。按目录顺序分组，每组展示鱼名、稀有度、数量，再列出每条重量、售价和“出售”按钮。顶部提供“全部出售 · N 金币”。

单条点击调用 `gameSellFish(catchId)`；全部出售调用 `gameSellAllFish()`。操作期间禁用所有鱼获出售按钮，成功后替换状态，失败保留现有列表并显示错误。

- [ ] **Step 4: 补充分组卡片样式并运行测试**

Run: `npm test -- src/backpackPage.test.ts`

Expected: PASS，种子、农产品、食物、杂货和装饰页签仍通过。

- [ ] **Step 5: 提交背包接入**

```bash
git add src/backpackPage.ts src/backpackPage.test.ts src/style.css
git commit -m "feat(fishing): add catch inventory and fish sales"
```

---

### Task 9: 全链路验证与回归

**Files:**
- Modify only if verification exposes a fishing-related defect; include the matching regression test in the same commit.

**Interfaces:**
- Consumes: Tasks 1–8 的全部接口
- Produces: 可发布的鱼塘玩法

- [ ] **Step 1: 运行全部自动化测试**

Run: `npm test`

Expected: 所有 Vitest 测试通过，无未处理 promise rejection。

- [ ] **Step 2: 运行应用构建**

Run: `npm run build:app`

Expected: `tsc --noEmit` 和 Vite build 均退出 0。

- [ ] **Step 3: 启动应用并完成手工主路径**

Run: `npm run dev`

验收顺序：

1. 打开商店“鱼饵”，购买普通鱼饵和高级鱼饵，金币和数量正确变化。
2. 打开鱼塘，选择普通鱼饵抛竿，提前收杆显示失败且只扣一个鱼饵。
3. 再次抛竿，在浮漂下沉后 1.2 秒内收杆，钓获弹层显示鱼名、重量和售价。
4. 打开背包“鱼获”，找到同一条鱼和相同数值；出售后金币增加对应售价。
5. 钓获至少两条后执行全部出售，鱼获清空且金币增加总价。
6. 快速重复点击抛竿/收杆不会重复扣饵或重复发鱼。
7. 抛竿后切到农场再返回，旧轮次不能结算。

- [ ] **Step 4: 验证兼容和无障碍降级**

使用测试夹具复制一份版本 1 `game.json` 到开发用户数据目录后启动：

- 原金币、种子、农产品、食物、杂货、装饰和农场布局保持不变。
- 自动出现空鱼饵、空鱼获和空图鉴。
- DevTools 模拟 `prefers-reduced-motion: reduce` 后持续水面/鱼影动画停止，咬钩文字和按钮仍清楚。
- 缩小窗口后 HUD 和鱼饵栏不遮挡主操作按钮。

- [ ] **Step 5: 检查工作区和提交修复**

Run: `git status --short && git diff --check`

Expected: 只包含计划内改动；无空白错误。若步骤 1–4 暴露缺陷，先写可复现失败测试，再做最小修复并提交：

```bash
git add electron/fishing src/fishingPage.ts src/fishingPage.test.ts src/fishingStateMachine.ts src/fishingStateMachine.test.ts
git commit -m "fix(fishing): correct verified gameplay regression"
```

只暂存实际产生修复的上述文件；没有缺陷时不运行这两条命令，也不创建空提交。
