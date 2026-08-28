# 商店、背包与统一经济系统设计

> 日期：2026-08-28  
> 状态：设计已确认，待实施  
> 产品：MPT · MY PET

## 1. 目标

在控制面板中增加独立的“商店”和“背包”页面，并建立可供农场、后续出售系统和小游戏共同使用的统一游戏经济存档。

第一版提供以下能力：

- 新用户拥有 100 初始金币。
- 旧用户首次升级时完成金币、种子和农场数据迁移。
- 商店包含“食物”和“种子”两个 Tab。
- 玩家可以用金币单颗购买生菜、番茄和南瓜种子。
- 背包含“食物”和“种子”两个 Tab，并展示统一库存。
- 农场种植和领取种子直接读写统一库存。

## 2. 已确认的产品规则

- 商店和背包是控制面板中的两个独立页面入口。
- 商店与背包默认打开“种子”Tab。
- 食物商品本期不开放；商店显示“更多食物即将上架”，背包显示空状态。
- 每次点击购买 1 颗种子。
- 生菜种子售价 5 金币。
- 番茄种子售价 10 金币。
- 南瓜种子售价 20 金币。
- 初始金币为 100。
- 已有存档金币为 0 时，首次迁移补发 100 金币；正余额原样保留。
- 初始金币只发放一次，余额后续归零不会再次补发。

## 3. 非目标

本期不实现：

- 食物商品、购买食物或使用食物喂宠物。
- 出售农产品或其他物品。
- 小游戏金币奖励。
- 批量购买、折扣、限时商品和支付确认弹窗。
- 云同步、多设备合并或多进程同时写存档。
- 单独的农产品背包 Tab；数据模型可预留后续扩展。

## 4. 总体架构

游戏经济数据由 Electron 主进程管理，渲染进程只负责展示状态和发起命令。

新增统一存档：

```text
userData/game.json
```

`game.json` 成为以下数据的唯一真实来源：

- 钱包金币。
- 食物库存。
- 种子库存。
- 农场地块、天气、农产品和每日领取状态。
- 存档版本及迁移标记。

原有 `pet.json` 继续保存宠物配置、档案和状态，但 `profile.coins` 不再作为金币真实来源。对现有渲染接口保持兼容：返回宠物状态时，从统一钱包注入最新金币。

原有 `farm.json` 在迁移成功后不再参与运行时读写。迁移过程不会提前删除旧文件，避免失败时丢失数据。

建议新增模块：

```text
electron/game/
  gameTypes.ts       统一存档与结果类型
  gameCatalog.ts     商品目录、售价和初始金币
  gameEngine.ts      购买、库存和农场协调纯函数
  gameStore.ts       game.json 迁移、校验、串行与原子写入
  gameIpc.ts         商店、背包及统一状态 IPC
```

现有 `electron/farm/farmEngine.ts` 继续负责作物生长、浇水、虫害和天气等农场规则。涉及种子或农产品库存的操作由 `gameEngine` 协调，保证一次操作只提交一个完整的 `GameState`。

## 5. 数据模型

```ts
type FoodId = string

type WalletState = {
  coins: number
}

type InventoryState = {
  food: Record<FoodId, number>
  seeds: Record<CropId, number>
  produce: Record<string, number>
}

type GameMigrationState = {
  starterCoinsGranted: boolean
  legacyPetImported: boolean
  legacyFarmImported: boolean
}

type GameState = {
  version: 1
  wallet: WalletState
  inventory: InventoryState
  farm: FarmStateWithoutInventory
  migrations: GameMigrationState
}
```

约束：

- 金币和所有库存数量必须是有限的非负整数。
- 三种种子键始终存在，缺失值按 0 修复。
- `farm` 中不再重复保存 `seeds` 和 `inventory`。
- 收获产物写入 `inventory.produce`，为后续出售系统保留。
- 渲染农场页面时可以生成兼容视图，将 `inventory.seeds` 和 `inventory.produce` 映射回现有农场状态结构，降低 UI 改动。

商品目录使用静态可信配置，不接受渲染进程传入价格：

```ts
const SEED_OFFERS = {
  lettuce: { itemId: 'lettuce', name: '生菜种子', price: 5 },
  tomato: { itemId: 'tomato', name: '番茄种子', price: 10 },
  pumpkin: { itemId: 'pumpkin', name: '南瓜种子', price: 20 },
} as const
```

## 6. 存档初始化与迁移

### 6.1 新用户

不存在 `game.json`、`farm.json` 和有效旧游戏数据时：

- 创建默认农场。
- 使用现有默认种子数量。
- 钱包写入 100 金币。
- `starterCoinsGranted` 设为 `true`。
- 食物与农产品库存为空。

### 6.2 旧用户

首次创建 `game.json` 时：

1. 读取并校验 `pet.json` 中的 `profile.coins`。
2. 读取并校验 `farm.json`。
3. 将旧农场的 `seeds` 迁移到 `inventory.seeds`。
4. 将旧农场的 `inventory` 迁移到 `inventory.produce`。
5. 将旧农场剩余状态迁移到 `game.farm`。
6. 若旧金币是正整数则保留；否则设置为 100。
7. 将三个迁移标记全部写为 `true`。
8. 原子写入完整的 `game.json`。

只有完整写入成功后，运行时才切换到新存档。旧文件保留，后续不再读取；不自动删除，方便人工恢复。

若 `game.json` 已存在，无论余额是否为 0，都不得再次发放初始金币或重复导入旧库存。

### 6.3 损坏数据

- 无法解析的 `game.json` 重命名为 `game.json.corrupt.<timestamp>`。
- 优先尝试从有效旧存档重新迁移。
- 没有有效旧存档时创建默认状态。
- 非法负数、非整数或非有限数修复为安全默认值。

## 7. 事务与持久化

`GameStore` 提供单一串行队列：

```ts
withGame(userDataPath, now, mutator): Promise<GameActionResult>
```

每次操作按以下顺序执行：

1. 等待前一个操作结束。
2. 加载并校验最新 `game.json`。
3. 必要时结算农场离线进度。
4. 使用纯函数生成下一状态。
5. 将完整 JSON 写入同目录临时文件。
6. 将临时文件原子替换为 `game.json`。
7. 返回提交后的状态。

购买、种植、收获和每日领种均经过同一队列，因此不会出现并发超扣、重复购买或跨文件部分提交。

## 8. 购买流程

渲染进程仅提交商品 ID：

```ts
gameBuySeed(cropId: CropId)
```

主进程购买流程：

1. 校验 `cropId` 存在于 `SEED_OFFERS`。
2. 从可信商品目录取得价格。
3. 校验余额不少于价格。
4. 扣除金币。
5. 对应种子数量加 1。
6. 原子写入完整状态。
7. 返回最新钱包与库存。

统一结果：

```ts
type GameActionResult =
  | { ok: true; state: GameViewState }
  | { ok: false; code: GameErrorCode; message: string; state: GameViewState }
```

错误码至少包含：

- `UNKNOWN_ITEM`
- `INSUFFICIENT_COINS`
- `INVALID_STATE`
- `PERSISTENCE_FAILED`

失败结果不得修改金币或库存。

## 9. 农场适配

现有农场页面行为保持不变：

- 播种仍消耗 1 颗对应种子。
- 每日领种仍增加统一种子库存。
- 收获写入统一农产品库存。
- 打开农场时仍进行天气、虫害与离线生长结算。

农场 IPC 改为使用 `GameStore`。为减少渲染层改动，农场 IPC 可继续返回现有 `FarmState` 兼容视图，其中：

- `seeds` 来自 `game.inventory.seeds`。
- `inventory` 来自 `game.inventory.produce`。

所有库存修改必须在协调层回写到 `GameState`，不能只修改临时兼容视图。

## 10. 控制面板界面

### 10.1 页面与导航

新增页面 ID：

- `shop-page`，标题“商店”。
- `backpack-page`，标题“背包”。

两者在控制面板侧栏中与“农场”相邻。第一版不要求加入宠物右键菜单。

### 10.2 商店页面

顶部展示当前金币余额，主体包含“食物 / 种子”Tab，默认进入“种子”。

种子 Tab 显示三张商品卡，每张包含：

- 种子图标。
- 商品名称。
- 单颗价格。
- 当前拥有数量。
- “购买 1 颗”按钮。

余额不足时禁用对应购买按钮，并显示“金币不足”提示。购买请求进行中时禁用商品按钮，防止重复点击；操作完成后使用主进程返回的最新状态重绘。

食物 Tab 显示“更多食物即将上架”。

### 10.3 背包页面

顶部展示金币余额，主体包含“食物 / 种子”Tab，默认进入“种子”。

种子 Tab 展示三种种子的图标、名称和数量，不提供修改按钮。

食物 Tab 在没有物品时显示统一空状态。数据结构允许后续直接渲染食物商品。

### 10.4 状态同步

商店、背包、农场和宠物设置可能同时展示金币或库存。任何游戏写操作成功后，主进程广播 `game:state-changed`。已挂载页面监听事件，并在当前可见时重绘。

页面首次进入时调用 `gameGetState()`，不能依赖上一个页面保留的缓存。

## 11. IPC 与类型边界

新增接口：

```ts
gameGetState(): Promise<GameViewState>
gameBuySeed(cropId: CropId): Promise<GameActionResult>
onGameStateChanged(callback: (state: GameViewState) => void): () => void
```

涉及文件：

- `electron/game/gameIpc.ts`
- `electron/preload.ts`
- `src/vite-env.d.ts`

页面注册需要同步修改：

- `src/appPages.ts`
- `electron/appPages.ts`
- `src/main.ts`
- `src/appNavigation.ts` 的现有机制无需重构。

新增渲染模块：

- `src/shopPage.ts`
- `src/backpackPage.ts`
- `src/style.css` 中的商店和背包样式。

## 12. 错误处理

- 未知商品：拒绝请求，显示“商品不存在”。
- 金币不足：不修改状态，显示“金币不足”。
- 写盘失败：保留旧 `game.json`，返回持久化错误。
- 页面加载失败：保留页面结构并显示重试按钮。
- 连续点击：客户端按钮锁定，主进程队列作为最终并发保护。
- 事件监听：页面挂载只注册一次，避免重复广播导致重复渲染。
- 迁移失败：不修改旧文件，并返回可恢复的默认或上次有效状态。

## 13. 测试策略

实施遵循测试先行。

### 13.1 商品目录

- 三种种子价格分别为 5、10、20。
- 所有商品 ID 与现有 `CropId` 一致。

### 13.2 经济引擎

- 购买成功扣除正确金币并增加 1 颗种子。
- 余额恰好等于价格时允许购买并归零。
- 余额不足时状态完全不变。
- 非法商品不能影响状态。
- 输入状态不会被原地修改。

### 13.3 存档与迁移

- 新用户得到默认农场、默认种子和 100 金币。
- 旧用户的正金币、种子、农产品和地块完整迁移。
- 旧用户金币为 0 时只补发一次。
- 已有 `game.json` 时不重复迁移。
- 损坏存档被备份并恢复。
- 临时文件写入失败不会破坏现有存档。
- 并发购买通过队列串行，不能超扣。

### 13.4 农场回归

- 种植从统一库存扣除种子。
- 每日领取增加统一库存。
- 收获增加统一农产品库存。
- 原有生长、浇水、虫害、天气和离线结算测试保持通过。

### 13.5 渲染与导航

- `shop-page` 和 `backpack-page` 能被导航系统识别。
- Tab 切换只显示对应面板。
- 购买后金币和种子数量重绘。
- 余额不足时购买按钮不可用。

### 13.6 完整验证

- 运行相关单元测试。
- 运行完整 `npm test`。
- 运行 `npm run build:app`。
- 检查新增和修改文件的 IDE lint。
- 手动验收控制面板导航、迁移、购买、刷新和农场种植。

## 14. 实施边界

本次只修改商店、背包、统一经济存档及农场适配所必需的代码，不顺带重构宠物喂食、等级成长或其他工具页。

当前工作区已有抠图模块及农场素材的未提交改动。实施时必须保留这些改动，不覆盖、不回退，也不将其错误归入本功能。
