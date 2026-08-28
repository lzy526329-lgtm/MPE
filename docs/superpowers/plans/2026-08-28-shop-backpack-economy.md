# 商店、背包与统一经济系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在控制面板增加商店和背包，并用单一 `game.json` 原子管理金币、库存与农场状态。

**Architecture:** 新增 `electron/game` 领域模块，静态目录定义种子价格，纯函数引擎处理购买及农场兼容映射，串行 `GameStore` 负责旧存档迁移与原子写盘。现有农场 IPC 保持 `FarmActionResult` 契约，宠物状态保持 `profile.coins` 兼容字段，渲染层新增两个独立页面。

**Tech Stack:** Electron 35、TypeScript 5.8、Vite 6、Vitest 4；Node `fs` 同步原子文件操作；原生 DOM 字符串渲染。

**Spec:** `docs/superpowers/specs/2026-08-28-shop-backpack-economy-design.md`

## Global Constraints

- 权威存档固定为 `app.getPath('userData')/game.json`，`version: 1`。
- 初始金币固定为 100；同一存档只发一次。
- 种子单颗售价固定为：生菜 5、番茄 10、南瓜 20。
- 商店和背包默认打开“种子”Tab；食物本期不开放购买。
- `pet.json` 和 `farm.json` 迁移成功后保留，但不再参与对应运行时写入。
- 农场 IPC 必须继续返回现有 `FarmActionResult`，避免改坏 `src/farmPage.ts`。
- 商品价格只能由主进程目录读取，渲染进程只传 `CropId`。
- 每个行为改动先写失败测试并确认按预期失败，再写最小实现。
- 不覆盖当前工作区已有的 `electron/cutout/*`、`public/farm/*`、`src/farmAssets*` 改动。
- 当前完整测试存在已知基线失败：`electron/cutout/cutout.test.ts` 读取已删除的 `public/farm/镰刀.png`；本功能不能把它误判为新回归。
- 未经用户明确要求不创建 Git commit；每个任务结束只保留可审阅变更。

## File Structure

- Create `electron/game/gameTypes.ts`: 统一存档、视图、错误与操作结果类型。
- Create `electron/game/gameCatalog.ts`: 初始金币与种子商品目录。
- Create `electron/game/gameCatalog.test.ts`: 商品目录约束。
- Create `electron/game/gameEngine.ts`: 默认状态、迁移、购买、农场兼容映射。
- Create `electron/game/gameEngine.test.ts`: 经济与农场协调纯函数测试。
- Create `electron/game/gameStore.ts`: `game.json` 校验、迁移、损坏恢复、原子写与串行队列。
- Create `electron/game/gameStore.test.ts`: 新旧用户、损坏文件、原子写及并发测试。
- Create `electron/game/gameIpc.ts`: 游戏查询、购买和状态广播。
- Modify `electron/farm/farmIpc.ts`: 从 `withFarm` 切换到 `withGame`。
- Retain `electron/farm/farmStore.ts`: 仅用于迁移读取旧 `farm.json`。
- Modify `electron/pet.ts`: `getPetStatus()` 从统一钱包注入金币，并暴露状态通知入口。
- Modify `electron/main.ts`: 注册游戏 IPC。
- Modify `electron/preload.ts`: 暴露游戏 API 和状态事件。
- Modify `src/vite-env.d.ts`: 同步渲染层 API 类型。
- Modify `src/appPages.ts`, `electron/appPages.ts`: 注册商店和背包页面。
- Create `src/appPages.test.ts`: 页面注册回归测试。
- Create `src/gamePageShared.ts`: 两个页面共享的 Tab、视图与转义工具。
- Create `src/shopPage.ts`, `src/shopPage.test.ts`: 商店纯渲染及挂载。
- Create `src/backpackPage.ts`, `src/backpackPage.test.ts`: 背包纯渲染及挂载。
- Modify `src/main.ts`: 侧栏入口、页面 Shell、挂载和点击导航。
- Modify `src/style.css`: 商店与背包样式。
- Modify `vitest.config.ts`: 纳入 `electron/game/**/*.test.ts`。

---

### Task 1: 统一类型与可信商品目录

**Files:**
- Create: `electron/game/gameTypes.ts`
- Create: `electron/game/gameCatalog.ts`
- Create: `electron/game/gameCatalog.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `CropId`, `FarmState` from `electron/farm/farmTypes.ts`
- Produces: `GameState`, `GameViewState`, `GameActionResult`, `GameMutationResult`, `GameErrorCode`, `SeedOffer`, `INITIAL_COINS`, `SEED_OFFERS`, `seedCounts()`

- [ ] **Step 1: 写商品目录失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { INITIAL_COINS, SEED_OFFERS, seedCounts } from './gameCatalog'

describe('game catalog', () => {
  it('defines the confirmed starter coins and seed prices', () => {
    expect(INITIAL_COINS).toBe(100)
    expect(SEED_OFFERS.map(({ cropId, price }) => [cropId, price])).toEqual([
      ['lettuce', 5],
      ['tomato', 10],
      ['pumpkin', 20],
    ])
  })

  it('normalizes missing seed counts to zero', () => {
    expect(seedCounts({ lettuce: 2 })).toEqual({
      lettuce: 2,
      tomato: 0,
      pumpkin: 0,
    })
  })
})
```

- [ ] **Step 2: 将游戏测试目录加入 Vitest 并确认失败**

在 `vitest.config.ts` 的 `include` 中加入：

```ts
'electron/game/**/*.test.ts',
```

Run: `npx vitest run electron/game/gameCatalog.test.ts`

Expected: FAIL，原因是 `gameCatalog` 模块尚不存在。

- [ ] **Step 3: 定义统一类型**

`electron/game/gameTypes.ts`：

```ts
import type { CropId, FarmState } from '../farm/farmTypes'

export type FoodId = string
export type FarmCoreState = Omit<FarmState, 'seeds' | 'inventory'>

export type WalletState = { coins: number }
export type InventoryState = {
  food: Record<FoodId, number>
  seeds: Record<CropId, number>
  produce: Record<string, number>
}
export type GameMigrationState = {
  starterCoinsGranted: boolean
  legacyPetImported: boolean
  legacyFarmImported: boolean
}
export type GameState = {
  version: 1
  wallet: WalletState
  inventory: InventoryState
  farm: FarmCoreState
  migrations: GameMigrationState
}
export type SeedOffer = { cropId: CropId; name: string; price: number }
export type GameViewState = {
  wallet: WalletState
  inventory: InventoryState
  seedOffers: SeedOffer[]
}
export type GameErrorCode =
  | 'UNKNOWN_ITEM'
  | 'INSUFFICIENT_COINS'
  | 'INVALID_STATE'
  | 'PERSISTENCE_FAILED'
export type GameActionResult =
  | { ok: true; state: GameViewState }
  | { ok: false; code: GameErrorCode; message: string; state: GameViewState }
export type GameMutationResult =
  | { ok: true; game: GameState; state: GameViewState }
  | {
      ok: false
      code: GameErrorCode
      message: string
      game: GameState
      state: GameViewState
    }
```

- [ ] **Step 4: 实现可信目录**

`electron/game/gameCatalog.ts`：

```ts
import type { CropId } from '../farm/farmTypes'
import type { SeedOffer } from './gameTypes'

export const INITIAL_COINS = 100
export const SEED_OFFERS: readonly SeedOffer[] = [
  { cropId: 'lettuce', name: '生菜种子', price: 5 },
  { cropId: 'tomato', name: '番茄种子', price: 10 },
  { cropId: 'pumpkin', name: '南瓜种子', price: 20 },
]

export function seedCounts(input: Partial<Record<CropId, number>> = {}): Record<CropId, number> {
  return {
    lettuce: Number.isInteger(input.lettuce) && input.lettuce! >= 0 ? input.lettuce! : 0,
    tomato: Number.isInteger(input.tomato) && input.tomato! >= 0 ? input.tomato! : 0,
    pumpkin: Number.isInteger(input.pumpkin) && input.pumpkin! >= 0 ? input.pumpkin! : 0,
  }
}
```

- [ ] **Step 5: 确认测试通过**

Run: `npx vitest run electron/game/gameCatalog.test.ts`

Expected: 2 tests PASS。

---

### Task 2: 经济引擎、迁移纯函数与农场兼容视图

**Files:**
- Create: `electron/game/gameEngine.ts`
- Create: `electron/game/gameEngine.test.ts`

**Interfaces:**
- Consumes: `createDefaultFarm(now)`, `FarmState`, `CropId`, `SEED_OFFERS`
- Produces:
  - `createDefaultGameState(now: number): GameState`
  - `migrateLegacyGameState(input: LegacyGameInput): GameState`
  - `toGameViewState(state: GameState): GameViewState`
  - `toCompatFarmState(state: GameState): FarmState`
  - `applyCompatFarmState(state: GameState, farm: FarmState): GameState`
  - `buySeed(state: GameState, cropId: string): GameMutationResult`
  - `toGameActionResult(result: GameMutationResult): GameActionResult`

- [ ] **Step 1: 写默认状态、迁移与购买失败测试**

测试必须覆盖：

```ts
it('creates a new game with 100 coins and existing default seeds', () => {
  const state = createDefaultGameState(1_000)
  expect(state.wallet.coins).toBe(100)
  expect(state.inventory.seeds).toEqual({ lettuce: 5, tomato: 3, pumpkin: 1 })
  expect(state.migrations.starterCoinsGranted).toBe(true)
})

it('keeps positive legacy coins and migrates farm inventory', () => {
  const state = migrateLegacyGameState({ now: 1_000, petCoins: 37, farm: legacyFarm })
  expect(state.wallet.coins).toBe(37)
  expect(state.inventory.seeds).toEqual(legacyFarm.seeds)
  expect(state.inventory.produce).toEqual(legacyFarm.inventory)
})

it('grants 100 coins when legacy coins are zero', () => {
  expect(migrateLegacyGameState({ now: 1_000, petCoins: 0, farm: legacyFarm }).wallet.coins).toBe(100)
})

it('buys one tomato seed without mutating the input', () => {
  const before = createDefaultGameState(1_000)
  const result = buySeed(before, 'tomato')
  expect(result.ok).toBe(true)
  expect(result.state.wallet.coins).toBe(90)
  expect(result.state.inventory.seeds.tomato).toBe(4)
  expect(result.game.wallet.coins).toBe(90)
  expect(before.wallet.coins).toBe(100)
  expect(before.inventory.seeds.tomato).toBe(3)
})

it('does not change state when coins are insufficient', () => {
  const before = { ...createDefaultGameState(1_000), wallet: { coins: 4 } }
  const result = buySeed(before, 'lettuce')
  expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT_COINS' })
  expect(result.state.wallet.coins).toBe(4)
  expect(result.state.inventory.seeds.lettuce).toBe(5)
})

it('rejects an unknown item', () => {
  expect(buySeed(createDefaultGameState(1_000), 'rice')).toMatchObject({
    ok: false,
    code: 'UNKNOWN_ITEM',
  })
})
```

另写兼容映射测试，断言 `toCompatFarmState()` 的 `seeds` 来自 `inventory.seeds`，`inventory` 来自 `inventory.produce`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run electron/game/gameEngine.test.ts`

Expected: FAIL，原因是导出函数尚不存在。

- [ ] **Step 3: 实现默认状态和迁移**

`LegacyGameInput` 精确类型：

```ts
export type LegacyGameInput = {
  now: number
  petCoins?: number
  farm: FarmState | null
}
```

实现时先调用 `createDefaultFarm(now)`，拆出 `seeds`、`inventory` 和农场核心字段。存在旧农场时复制旧字段；金币仅接受有限非负整数，正数保留，否则使用 `INITIAL_COINS`。

- [ ] **Step 4: 实现视图映射和购买**

`buySeed` 必须：

1. 用 `SEED_OFFERS.find()` 查可信价格。
2. 不识别的字符串返回 `UNKNOWN_ITEM`。
3. 余额不足返回 `INSUFFICIENT_COINS`。
4. 成功时复制 `wallet`、`inventory` 和 `seeds`，禁止原地修改。
5. 所有返回状态经过 `toGameViewState()`，包含商品目录副本。

- [ ] **Step 5: 确认引擎测试通过**

Run: `npx vitest run electron/game/gameEngine.test.ts`

Expected: 全部 PASS。

---

### Task 3: GameStore 迁移、校验、损坏恢复与原子写

**Files:**
- Create: `electron/game/gameStore.ts`
- Create: `electron/game/gameStore.test.ts`
- Read only: `electron/farm/farmStore.ts`

**Interfaces:**
- Consumes: `parseFarmPayload(raw, now)`, `migrateLegacyGameState()`, `GameState`, `GameMutationResult`
- Produces:
  - `parseGamePayload(raw: string): GameState`
  - `loadGame(userDataPath: string, now: number): GameState`
  - `saveGameAtomic(userDataPath: string, state: GameState): void`
  - `withGame<T extends PersistableMutation>(userDataPath: string, now: number, mutator: GameMutator<T>): Promise<T>`
  - `peekWalletCoins(userDataPath: string, now: number): number`

- [ ] **Step 1: 写新用户和旧存档迁移失败测试**

使用 `mkdtempSync(join(tmpdir(), 'mpt-game-'))` 创建隔离目录。测试：

- 无任何文件时 `loadGame(dir, now)` 创建 100 金币和默认种子。
- `pet.json` 含 `profile.coins: 42` 且 `farm.json` 含旧库存时完整迁移。
- 旧金币为 0 时第一次得到 100；再次把 `game.json` 余额改为 0 后加载仍为 0。
- 已存在有效 `game.json` 时，即使旧文件变化也不重复导入。

- [ ] **Step 2: 写损坏恢复、原子写和串行失败测试**

```ts
it('backs up a corrupt game file before rebuilding', () => {
  writeFileSync(join(dir, 'game.json'), '{broken')
  const state = loadGame(dir, 1_000)
  expect(state.wallet.coins).toBe(100)
  expect(readdirSync(dir).some((name) => name.startsWith('game.json.corrupt.'))).toBe(true)
})

it('serializes purchases so the wallet cannot overspend', async () => {
  saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 10 } })
  const results = await Promise.all([
    withGame(dir, 1_000, (state) => buySeed(state, 'tomato')),
    withGame(dir, 1_000, (state) => buySeed(state, 'tomato')),
  ])
  expect(results.filter((result) => result.ok)).toHaveLength(1)
  expect(loadGame(dir, 1_000).wallet.coins).toBe(0)
})
```

为原子写增加依赖注入的文件操作接口，模拟临时文件写失败并断言原 `game.json` 内容不变。

- [ ] **Step 3: 运行测试并确认失败**

Run: `npx vitest run electron/game/gameStore.test.ts`

Expected: FAIL，原因是 `gameStore` 尚不存在。

- [ ] **Step 4: 实现校验与旧文件读取**

`loadGame()` 规则：

1. 若 `game.json` 有效，修复非法数值后返回，绝不再次读取旧金币或旧种子。
2. 若损坏，先重命名为 `.corrupt.<timestamp>`。
3. 迁移时直接读取 `pet.json` JSON 的 `profile.coins`，不要 import `electron/pet.ts`，防止循环依赖。
4. 旧农场通过 `parseFarmPayload()` 校验，但不调用会写盘的 `loadFarm()`。
5. 迁移成功后只写 `game.json`，保留旧文件。

- [ ] **Step 5: 实现原子写和串行队列**

同目录临时文件名使用 `game.json.tmp-<pid>-<timestamp>`。先 `writeFileSync(temp)`，再使用兼容当前平台的替换函数提交；异常时删除临时文件并保留旧文件。

`withGame()` 通过模块级 Promise 链串行：

```ts
type PersistableMutation = { ok: boolean; game: GameState }
type GameMutator<T extends PersistableMutation> =
  (state: GameState) => T | Promise<T>

export function withGame<T extends PersistableMutation>(
  path: string,
  now: number,
  mutator: GameMutator<T>,
): Promise<T> {
  const run = queue.then(async () => {
    const state = loadGame(path, now)
    const result = await mutator(state)
    if (result.ok) saveGameAtomic(path, result.game)
    return result
  })
  queue = run.then(() => undefined, () => undefined)
  return run
}
```

公共 IPC 使用 `toGameActionResult()` 去掉内部 `game` 字段；持久化层始终写 `result.game`，不能仅凭视图重建农场核心字段。

- [ ] **Step 6: 确认 Store 测试通过**

Run: `npx vitest run electron/game/gameStore.test.ts`

Expected: 迁移、恢复、原子写和并发测试全部 PASS。

---

### Task 4: 在统一事务中适配所有农场操作

**Files:**
- Modify: `electron/game/gameTypes.ts`
- Modify: `electron/game/gameEngine.ts`
- Modify: `electron/game/gameEngine.test.ts`
- Modify: `electron/game/gameStore.ts`
- Modify: `electron/farm/farmIpc.ts`
- Retain: `electron/farm/farmStore.ts`

**Interfaces:**
- Consumes: 现有 `settle`, `rollOpenEvents`, `plant`, `water`, `waterAll`, `harvest`, `harvestAll`, `squashBug`, `clearWithered`, `claimDailySeeds`
- Produces:
  - `FarmGameMutationResult`
  - `runFarmAction(state: GameState, action: (farm: FarmState) => FarmActionResult): FarmGameMutationResult`
  - 兼容的全部 `farm:*` IPC 返回值

- [ ] **Step 1: 写协调层失败测试**

测试三个库存边界：

```ts
it('plants by consuming the unified seed inventory', () => {
  const game = createDefaultGameState(1_000)
  const result = runFarmAction(game, (farm) => plant(farm, 0, 'lettuce', 1_000))
  expect(result.ok).toBe(true)
  expect(result.game.inventory.seeds.lettuce).toBe(4)
  expect(result.farm.state.plots[0].status).toBe('growing')
})

it('adds daily seeds to unified inventory', () => {
  const game = createDefaultGameState(1_000)
  const result = runFarmAction(game, (farm) => claimDailySeeds(farm, 1_000))
  expect(result.game.inventory.seeds).toEqual({ lettuce: 8, tomato: 5, pumpkin: 2 })
})

it('moves harvest yield into unified produce inventory', () => {
  const game = gameWithReadyLettuce()
  const result = runFarmAction(game, (farm) => harvest(farm, 0, 1_000, () => 0))
  expect(result.game.inventory.produce.lettuce).toBe(1)
})
```

- [ ] **Step 2: 确认协调测试失败**

Run: `npx vitest run electron/game/gameEngine.test.ts`

Expected: FAIL，原因是 `runFarmAction` 尚不存在。

- [ ] **Step 3: 实现农场协调结果**

```ts
export type FarmGameMutationResult =
  | { ok: true; game: GameState; farm: FarmActionResult & { ok: true } }
  | { ok: false; game: GameState; farm: FarmActionResult & { ok: false } }
```

`runFarmAction()` 先生成 `FarmState` 兼容视图，调用现有农场引擎，再把返回的 `seeds`、`inventory` 和农场核心字段拆回 `GameState`。失败时保留引擎返回的兼容状态，但不得丢失统一钱包。

- [ ] **Step 4: 将 GameStore mutator 改为完整状态结果**

`withGame()` 仅在 `result.ok` 时写入 `result.game`。新增只读变体或允许成功的读取操作写入已结算状态，供 `farm:get-state` 的天气/虫害副作用使用。

- [ ] **Step 5: 一次性切换农场 IPC**

将 `electron/farm/farmIpc.ts` 的 `withFarm(...)` 全部替换为 `withGame(...) + runFarmAction(...)`。

具体映射保持现有 channel 和参数不变：

```ts
'farm:get-state' -> rollOpenEvents
'farm:plant' -> plant
'farm:water' -> water
'farm:water-all' -> waterAll
'farm:debug' -> squashBug
'farm:harvest' -> harvest
'farm:harvest-all' -> harvestAll
'farm:clear-withered' -> clearWithered
'farm:claim-daily-seeds' -> claimDailySeeds
```

IPC 边界把 `FarmGameMutationResult` 转回：

```ts
type FarmActionResult =
  | { ok: true; state: FarmState }
  | { ok: false; error: string; state: FarmState }
```

- [ ] **Step 6: 运行农场与游戏测试**

Run: `npx vitest run electron/farm electron/game`

Expected: 原有农场引擎测试与新增协调测试全部 PASS；旧 `farmStore` 测试仍可作为迁移解析回归运行。

---

### Task 5: 游戏 IPC、金币兼容和 preload 契约

**Files:**
- Create: `electron/game/gameIpc.ts`
- Create: `electron/game/gameIpc.test.ts`
- Modify: `electron/pet.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Produces:
  - `registerGameIpc(getMain: () => BrowserWindow | null): void`
  - `gameGetState(): Promise<GameViewState>`
  - `gameBuySeed(cropId: CropId): Promise<GameActionResult>`
  - `onGameStateChanged(callback): () => void`

- [ ] **Step 1: 写 IPC handler 可测试工厂的失败测试**

将 Electron 注册与业务处理拆开，先定义精确接口：

```ts
export type GameHandlers = {
  getState: () => Promise<GameViewState>
  buySeed: (cropId: CropId) => Promise<GameActionResult>
}

export type GameHandlerOptions = {
  userDataPath: string
  now: () => number
  publish: (state: GameViewState) => void
  publishPetStatus: () => void
}

export function createGameHandlers(options: GameHandlerOptions): GameHandlers
```

测试断言：

- `getState()` 返回 100 金币和三条商品。
- `buySeed('lettuce')` 返回 95 金币并发布一次 `game:state-changed`。
- 失败购买不发布变更事件。
- 购买成功触发一次宠物状态刷新。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run electron/game/gameIpc.test.ts`

Expected: FAIL，原因是 handler 工厂不存在。

- [ ] **Step 3: 实现 handler 与 Electron 注册**

注册：

```ts
ipcMain.handle('game:get-state', () => handlers.getState())
ipcMain.handle('game:buy-seed', (_event, cropId: CropId) => handlers.buySeed(cropId))
```

成功写入后：

```ts
getMain()?.webContents.send('game:state-changed', result.state)
notifyPetStatusChanged()
```

从 `electron/pet.ts` 导出一个只负责广播当前状态的 `notifyPetStatusChanged()`，不要把游戏模块反向 import 到宠物模块。

- [ ] **Step 4: 从统一钱包注入宠物状态金币**

在 `getPetStatus()` 构建返回值前调用：

```ts
const coins = peekWalletCoins(app.getPath('userData'), Date.now())
const profile = { ...getPetProfile(settings), coins }
```

保留 `PetProfileStored.coins` 类型和 `src/petSettingsPage.ts` 的读取方式。不要将新余额写回 `pet.json`。

- [ ] **Step 5: 注册主进程并暴露 preload**

`electron/main.ts` 在农场 IPC 附近调用：

```ts
registerGameIpc(() => win)
```

`electron/preload.ts` 增加：

```ts
gameGetState: () => ipcRenderer.invoke('game:get-state'),
gameBuySeed: (cropId: CropId) => ipcRenderer.invoke('game:buy-seed', cropId),
onGameStateChanged: (callback: (state: GameViewState) => void) => {
  const listener = (_event: unknown, state: GameViewState) => callback(state)
  ipcRenderer.on('game:state-changed', listener)
  return () => ipcRenderer.removeListener('game:state-changed', listener)
},
```

在 `src/vite-env.d.ts` 声明完全相同的三个方法。

- [ ] **Step 6: 运行测试与类型检查**

Run: `npx vitest run electron/game electron/farm`

Expected: PASS。

Run: `node scripts/run.mjs tsc --noEmit`

Expected: exit 0。

---

### Task 6: 注册商店与背包页面

**Files:**
- Modify: `src/appPages.ts`
- Modify: `electron/appPages.ts`
- Create: `src/appPages.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `AppPageId` 中的 `'shop-page'`, `'backpack-page'`
- Consumes later: `mountShopPage()`, `mountBackpackPage()`

- [ ] **Step 1: 写页面注册失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { APP_PAGE_TITLES, TOOL_PAGES } from './appPages'

describe('game pages', () => {
  it('registers shop and backpack outside the tools submenu', () => {
    expect(APP_PAGE_TITLES['shop-page']).toBe('商店')
    expect(APP_PAGE_TITLES['backpack-page']).toBe('背包')
    expect(TOOL_PAGES).not.toContain('shop-page')
    expect(TOOL_PAGES).not.toContain('backpack-page')
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/appPages.test.ts`

Expected: TypeScript 编译或断言失败，因为页面 ID 尚未注册。

- [ ] **Step 3: 双端注册页面 ID**

在 `src/appPages.ts` 与 `electron/appPages.ts` 的 `AppPageId` 同步增加：

```ts
| 'shop-page'
| 'backpack-page'
```

仅在渲染端 `APP_PAGE_TITLES` 增加：

```ts
'shop-page': '商店',
'backpack-page': '背包',
```

不要加入 `TOOL_PAGES` 或宠物右键 `PET_TOOL_MENU`。

- [ ] **Step 4: 增加页面 Shell 与侧栏入口**

`src/main.ts`：

- 侧栏顺序固定为“农场 → 商店 → 背包”。
- 添加 `#shop-page`、`#shop-root`。
- 添加 `#backpack-page`、`#backpack-root`。
- 页面文案分别为“用金币购买种子，供农场种植使用。”和“查看当前金币与库存。”。
- 添加两个点击监听，分别调用 `navigateToPage('shop-page')` 和 `navigateToPage('backpack-page')`。

此步骤先使用最小占位挂载函数或与 Task 7、8 同一批完成，不能让 `main.ts` import 不存在的模块。

- [ ] **Step 5: 确认页面注册测试通过**

Run: `npx vitest run src/appPages.test.ts`

Expected: PASS。

---

### Task 7: 共享页面逻辑与商店 UI

**Files:**
- Create: `src/gamePageShared.ts`
- Create: `src/shopPage.ts`
- Create: `src/shopPage.test.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Interfaces:**
- Produces:
  - `GameTab = 'food' | 'seeds'`
  - `switchGameTab(root: HTMLElement, tab: GameTab): void`
  - `canBuySeed(coins: number, price: number): boolean`
  - `gameErrorMessage(code: GameErrorCode): string`
  - `renderShopPage(state: GameViewState, options): string`
  - `mountShopPage(): void`

- [ ] **Step 1: 写商店纯渲染失败测试**

使用固定 `GameViewState` fixture，测试：

```ts
it('renders coins, three offers and owned seed counts', () => {
  const html = renderShopPage(state, { activeTab: 'seeds', busyCropId: null, error: null })
  expect(html).toContain('100 金币')
  expect(html).toContain('生菜种子')
  expect(html).toContain('5 金币')
  expect(html).toContain('拥有 5')
  expect(html).toContain('番茄种子')
  expect(html).toContain('南瓜种子')
})

it('disables an offer when coins are insufficient', () => {
  expect(renderShopPage(lowCoinState, defaultOptions)).toContain(
    'data-buy-seed="pumpkin" disabled',
  )
})

it('renders the confirmed food placeholder', () => {
  expect(renderShopPage(state, { ...defaultOptions, activeTab: 'food' }))
    .toContain('更多食物即将上架')
})
```

同时测试 `canBuySeed(10, 10) === true`、`canBuySeed(9, 10) === false` 和四个错误码的中文文案。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/shopPage.test.ts`

Expected: FAIL，原因是商店渲染函数不存在。

- [ ] **Step 3: 实现共享 Tab 与安全渲染**

`gamePageShared.ts` 提供：

```ts
export type GameTab = 'food' | 'seeds'
export const DEFAULT_GAME_TAB: GameTab = 'seeds'
export function escapeHtml(value: string): string
export function isGameTab(value: string | undefined): value is GameTab
export function switchGameTab(root: HTMLElement, tab: GameTab): void
```

`switchGameTab` 切换 `.game-tab.active` 和 `.game-pane.hidden`，不注册全局监听。

- [ ] **Step 4: 实现商店纯渲染**

商品名称来自 `state.seedOffers`，所有字符串先 `escapeHtml`。按钮条件：

```ts
const disabled = busyCropId !== null || !canBuySeed(state.wallet.coins, offer.price)
```

按钮必须携带 `data-buy-seed="<cropId>"`，购买中显示“购买中…”，余额不足时卡片显示“金币不足”。

- [ ] **Step 5: 实现商店挂载与刷新**

`mountShopPage()` 只挂载一次：

- `onPageChange('shop-page')` 时调用 `gameGetState()`。
- 初次显示 loading，失败显示“加载失败”与重试按钮。
- 点击 Tab 保留本地 `activeTab` 并重绘。
- 点击购买后设置 `busyCropId`，调用 `gameBuySeed(cropId)`。
- 成功直接使用 `result.state`；失败使用 `result.state` 并显示映射错误。
- 监听 `onGameStateChanged`，当前页可见时更新状态。

- [ ] **Step 6: 添加商店样式和主入口挂载**

在 `style.css` 添加 `.game-tabs`、`.game-tab`、`.game-pane`、`.game-wallet`、`.shop-offer-grid`、`.shop-offer-card`、`.game-empty`。移动端网格降为单列。

在 `main.ts` import 并调用 `mountShopPage()`。

- [ ] **Step 7: 确认商店测试与类型检查通过**

Run: `npx vitest run src/shopPage.test.ts src/appPages.test.ts`

Expected: PASS。

Run: `node scripts/run.mjs tsc --noEmit`

Expected: exit 0。

---

### Task 8: 背包 UI 与跨页实时同步

**Files:**
- Create: `src/backpackPage.ts`
- Create: `src/backpackPage.test.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `src/petSettingsPage.ts` only if existing pet status broadcast does not refresh coins

**Interfaces:**
- Consumes: `GameViewState`, `GameTab`, `switchGameTab()`, preload 游戏 API
- Produces:
  - `hasInventoryItems(record: Record<string, number>): boolean`
  - `renderBackpackPage(state: GameViewState, activeTab: GameTab, error: string | null): string`
  - `mountBackpackPage(): void`

- [ ] **Step 1: 写背包渲染失败测试**

```ts
it('renders all seed counts without purchase controls', () => {
  const html = renderBackpackPage(state, 'seeds', null)
  expect(html).toContain('生菜种子')
  expect(html).toContain('× 5')
  expect(html).not.toContain('data-buy-seed')
})

it('renders an empty food state', () => {
  expect(renderBackpackPage(state, 'food', null)).toContain('暂无食物')
})

it('ignores zero-count food when checking inventory', () => {
  expect(hasInventoryItems({ apple: 0 })).toBe(false)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/backpackPage.test.ts`

Expected: FAIL，原因是背包模块不存在。

- [ ] **Step 3: 实现背包渲染与挂载**

- 顶部显示 `state.wallet.coins`。
- 默认 `seeds` Tab。
- 种子顺序跟随 `state.seedOffers`，数量来自 `state.inventory.seeds`。
- 食物为空时显示“暂无食物”。
- `onPageChange('backpack-page')` 首次加载。
- `onGameStateChanged` 当前页可见时重绘。
- 只读页面不暴露购买或编辑按钮。

- [ ] **Step 4: 挂载页面并补充样式**

在 `main.ts` import 并调用 `mountBackpackPage()`。添加 `.backpack-item-grid` 和 `.backpack-item-card`，视觉尺寸与商店卡片一致。

- [ ] **Step 5: 验证宠物金币同步**

购买成功后由 `gameIpc` 调用 `notifyPetStatusChanged()`；确认 `petSettingsPage.ts` 现有 `onPetStatusChanged` 会重绘 `#pet-profile-coins`。只有此链路不成立时，才在宠物设置页监听 `onGameStateChanged`，避免重复刷新。

- [ ] **Step 6: 运行全部渲染测试**

Run: `npx vitest run src/shopPage.test.ts src/backpackPage.test.ts src/appPages.test.ts src/farmAssets.test.ts`

Expected: 全部 PASS。

---

### Task 9: 完整回归、迁移验收与工作区核对

**Files:**
- Verify all files changed in Tasks 1–8
- Do not modify unrelated cutout or asset files

**Interfaces:**
- Verifies the complete feature against the approved spec

- [ ] **Step 1: 运行游戏、农场和页面测试**

Run:

```bash
npx vitest run electron/game electron/farm src/shopPage.test.ts src/backpackPage.test.ts src/appPages.test.ts src/farmAssets.test.ts
```

Expected: 相关测试 0 failed。

- [ ] **Step 2: 运行完整测试并区分基线问题**

Run: `npm test`

Expected: 本功能相关测试全部通过。若仍只有 `electron/cutout/cutout.test.ts` 因 `public/farm/镰刀.png` 缺失失败，记录为既有工作区问题；出现任何其他失败必须修复后重跑。

- [ ] **Step 3: 运行应用构建**

Run: `npm run build:app`

Expected: TypeScript 与三个 Vite 构建阶段 exit 0；现有大 chunk 警告可记录但不属于失败。

- [ ] **Step 4: 检查 lint**

对所有新增与修改的 `.ts`、`.test.ts`、`style.css` 文件运行 IDE lint。Expected: 无本次引入的错误。

- [ ] **Step 5: 手动验收新用户**

使用空的测试 userData：

1. 打开商店，显示 100 金币。
2. 默认种子 Tab 显示 5/10/20 三种价格。
3. 买一颗番茄后显示 90 金币，番茄种子加 1。
4. 打开背包，余额和数量一致。
5. 打开农场种下一颗番茄，统一库存减 1。
6. 返回商店或背包，数量实时一致。

- [ ] **Step 6: 手动验收旧存档**

准备带正金币、种子、农产品和已种地块的 `pet.json`、`farm.json`：

1. 首次启动生成 `game.json`。
2. 正金币原样保留。
3. 种子、农产品、地块、天气和时间字段完整保留。
4. 第二次启动不重复迁移。
5. 将统一钱包正常消费至 0 后重启，不再次补发 100。
6. 旧 `pet.json` 与 `farm.json` 文件仍存在。

- [ ] **Step 7: 核对 Git 差异**

Run: `git status --short` and `git diff --stat`

Expected: 新功能文件与之前已有的 cutout/farmAssets 变更边界清晰，没有覆盖或回退用户改动。

- [ ] **Step 8: 提交检查点**

仅当用户明确要求提交时，按 Task 1–9 的逻辑边界拆分 commit；否则不执行 `git add` 或 `git commit`。
