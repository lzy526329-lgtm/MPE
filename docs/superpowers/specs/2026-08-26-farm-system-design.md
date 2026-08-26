# 桌宠种菜系统（Farm）设计文档

> 日期：2026-08-26  
> 状态：已确认（方案一 · 事件驱动农场）  
> 产品：MPT · MY PET

## 1. 目标与范围

### 1.1 目标

为桌宠增加**互动向**种菜玩法：独立农场页中播种、浇水、赶虫、收割；生长可离线结算；收获进入简易背包。娱乐手感优先，数值奖励次要。

### 1.2 已确认决策

| 决策点 | 选择 |
|--------|------|
| 定位 | 互动小游戏（非纯挂机经济、非完整喂食替代） |
| 入口 UI | 第一版独立农场页；宠物下场动画后续再做 |
| 互动深度 | 轻度经营 + 小事件（缺水、生虫、天气） |
| 时间节奏 | 速生菜 + 慢菜并存 |
| 收获反馈 | 简易背包；喂食/换金币后接 |
| 离线 | 关闭 App 后仍按时间推进生长与缺水 |

### 1.3 非目标（v1 不做）

- 宠物走到田边的 Spine 表演
- 消耗背包菜喂食 / 改现有一键喂食
- 金币商店、肥料、工具耐久
- 多季、多农场、系统推送通知
- 强制挂钩 `pet.coins` / `growth`（可预留扩展点）

## 2. 架构

权威逻辑在 Electron 主进程；渲染进程只展示与发操作。

```
主窗口 farm-page / 右键「农场」
        ↓ IPC
electron/farm/
  farmCatalog.ts   — 作物与常量配置
  farmTypes.ts     — 类型
  farmEngine.ts    — 纯函数：settle / plant / water / debug / harvest
  farmStore.ts     — userData/farm.json 读写
  farmIpc.ts       — ipcMain handlers
        ↓
src/farmPage.ts    — UI
src/appPages.ts    — 页面 id
electron/appPages.ts / electron/pet.ts — 菜单入口
```

与宠物系统关系：

- 存档分离：`userData/farm.json` ↔ `userData/pet.json`
- App 启动与打开农场页时调用 `settle(now)`
- 不修改现有 `pet:feed` 行为；预留 `inventory → feed` 扩展注释即可

## 3. 数据模型

### 3.1 作物配置（静态）

```ts
type CropId = 'lettuce' | 'tomato' | 'pumpkin'

type CropDef = {
  id: CropId
  name: string
  growMs: number
  waterIntervalMs: number
  yieldItemId: string
  yieldMin: number
  yieldMax: number
}
```

建议初始数值（可调，逻辑不变）：

| id | 名称 | growMs | waterIntervalMs | 产量 |
|----|------|--------|-----------------|------|
| lettuce | 生菜 | 2 min | 45 s | 菜×1–2 |
| tomato | 番茄 | 20 min | 5 min | 菜×1–3 |
| pumpkin | 南瓜 | 45 min | 10 min | 菜×2–4 |

### 3.2 地块与存档

```ts
type PlotEmpty = { status: 'empty' }

type PlotPlanted = {
  status: 'growing' | 'ready' | 'withered'
  cropId: CropId
  plantedAt: number
  lastWateredAt: number
  progressMs: number
  hasBug?: boolean
}

type PlotState = PlotEmpty | PlotPlanted

type Weather = 'clear' | 'rain'

type FarmState = {
  version: 1
  plotCount: 6
  plots: PlotState[]
  inventory: Record<string, number>
  seeds: Record<string, number>
  weather: Weather
  lastSettledAt: number
  lastDailySeedClaimAt?: string // 本地日期 YYYY-MM-DD，防刷每日种子
}
```

首次初始化：6 空地；种子起步包例如 `lettuce:5, tomato:3, pumpkin:1`；`weather: 'clear'`；`lastSettledAt: Date.now()`。

枯萎不返还种子。

## 4. 规则

### 4.1 生长

- 有效生长写入 `progressMs`；缺水或有虫时增长变慢/暂停
- `progressMs >= growMs` → `status = 'ready'`
- 缺水：自 `lastWateredAt` 起超过 `waterIntervalMs`（雨天间隔 ×1.5）则缺水，`progressMs` 不增加
- 有虫：有效生长速度 ×0.5（仍可因缺水完全暂停）
- 缺水持续超过 `2 * waterIntervalMs`（按当前天气间隔）→ `withered`

### 4.2 离线 settle(now)

1. 若 `now < lastSettledAt`（时钟回拨）：不推进生长，只把 `lastSettledAt = now` 并保存
2. 否则对每个非 empty 地块按时间推进有效生长、缺水、枯萎、成熟
3. 更新 `lastSettledAt = now` 并持久化

触发时机：主进程农场模块注册后首次加载、每次写操作前、打开农场页拉取状态时。

### 4.3 打开页事件

- **生虫**：每个 `growing` 地块独立小概率（建议 ~15%，且该格尚无虫）设 `hasBug: true`
- **天气**：距上次天气刷新超过冷却（建议 30 min）时，以约 30% 概率切到 `rain`，否则 `clear`（可把上次刷新时间存在内存或存档字段 `lastWeatherRollAt`）
- 成熟地块由 UI 高亮提示，不做 OS 通知

### 4.4 玩家操作

| 操作 | 条件 | 效果 |
|------|------|------|
| plant(i, cropId) | empty + seeds[cropId]≥1 | 扣种子；growing；progressMs=0；lastWateredAt=now |
| water(i) | growing 或 ready | lastWateredAt=now |
| debug(i) | hasBug | 清除 hasBug |
| harvest(i) | ready | inventory 增加 yield；地块 empty |
| clearWithered(i) | withered | empty |
| claimDailySeeds() | 当日未领 | 发放少量种子（如 lettuce+2, tomato+1） |

## 5. UI 与入口

- 页面 id：`farm-page`，标题「农场」
- 右键菜单增加「农场」→ `openMainPage('farm-page')`
- 页结构：顶栏（天气、种子、背包）+ 6 格田 + 操作（选种子/浇水/赶虫/收割或点格弹操作）+ 「领取今日种子」
- 视觉保持现有 MPT 工具页风格（`tool-page` + `panel`），不做独立设计体系

## 6. 错误处理

- 非法操作：返回 `{ ok: false, error: string }`，UI 轻提示
- `farm.json` 损坏：改名为 `farm.json.corrupt.<ts>`，重建默认农场
- 写盘串行：模块内单队列或同步读写，避免并发覆盖

## 7. 测试

- `farmEngine` 为纯函数，用 Node 内置 test runner（`node --test`）覆盖：正常成熟、缺水暂停、枯萎、雨天放宽、有虫减速、时钟回拨、收割入包
- 无 E2E 强制要求；手动验收入口与 UI

## 8. 后续扩展（文档预留）

- 背包菜 → 喂食加成
- 收割少量 coins / growth
- 桌宠浇水/收割动画
- 图鉴与成就
