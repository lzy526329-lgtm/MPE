# 农场等级系统设计

> 日期：2026-09-01  
> 状态：待实现  
> 依赖：[农场系统](./2026-08-26-farm-system-design.md)、[商店与背包经济](./2026-08-28-shop-backpack-economy-design.md)

## 1. 目标

- **农场等级与宠物等级完全分离**：存档、展示、解锁逻辑均不读取 `pet.profile.level`。
- **超慢成长节奏**：让玩家长期有「再升一级 / 再开一块地」的目标，避免几天内升满无事可做。
- **升级有实用奖励**：每升一级发放 **小麦种子 ×3** + **宠物食物 ×1**，串联农场与桌宠喂养。
- **顶栏可见进度**：显示 `农 Lv.X` 与经验进度条。

## 2. 非目标（v1）

- 浇水 / 除虫给经验（防刷）
- 商店购买种子给经验
- 农场等级影响宠物属性
- 按等级解锁新作物（预留 v2）
- 等级称号 / 成就系统

## 3. 数据模型

在 `GameState.farm`（`FarmCoreState`）新增：

```ts
type FarmProgress = {
  /** 累计获得的总经验（权威字段，等级由此反算） */
  totalXp: number
}
```

- 老存档迁移：`totalXp: 0` → 农场等级 0。
- **不再**在 `FarmPageContext` 中使用 `getPetPlayerLevel()`。
- `FarmPageContext` 扩展为：

```ts
type FarmPageContext = {
  walletCoins: number
  farmLevel: number
  farmXpProgress: {
    current: number   // 当前等级内已获得经验
    required: number  // 升到下一级所需经验（满级时为 0）
  }
}
```

## 4. 等级与经验公式

### 4.1 升级所需经验（超级慢）

```ts
/** 从 level 升到 level+1 所需经验 */
function xpToNextLevel(level: number): number {
  return 500 + level * 150
}
```

| 农场等级 | 本级所需 | 累计 totalXp | 说明 |
|----------|----------|--------------|------|
| 0 | — | 0 | 初始 |
| 1 | 500 | 500 | 约 1–2 周 casual |
| 2 | 650 | 1,150 | 解锁第 15–19 块地 |
| 3 | 800 | 1,950 | 解锁第 20–24 块地 |
| 4 | 950 | 2,900 | 长期目标 |
| 5 | 1,100 | 4,000 | |
| 10 | 1,850 | 11,750 | 等级上限 v1 |

**等级上限：10**（满级后进度条满格，不再获得等级内进度；经验仍可累计用于未来扩展）。

### 4.2 节奏估算（参考）

假设玩家以 **小麦** 为主（种+收 ≈ 4 XP/轮，20 分钟/轮），4 块地轮换，日均活跃 **30 分钟**（约 6 XP/小时 × 0.5h = 3 XP/天… 不对，30min = 约 1.5 轮 × 4 plots）

更 realistic 估算：
- 4 块地全种小麦，每 20 分钟收割 4 次 × 3 harvestXp + 4 plantXp ≈ 16 XP/20min ≈ **48 XP/小时**（高度活跃）
- Casual 日均 30 分钟高度活跃 ≈ **24 XP/天**
- 升到 Lv.1（500 XP）≈ **21 天**
- 升到 Lv.3（1,950 XP）≈ **81 天**

若穿插香蕉/苹果或解锁更多地块，会略快，但整体仍为**超级慢**节奏，符合产品目标。

## 5. 经验来源

### 5.1 配置（`electron/farm/farmLevelCatalog.ts`）

**种植**

```
plantXp(crop) = 1   // 所有作物统一 1，避免刷快生作物
```

**收割**（按生长时间，鼓励种慢作物但差距不大）

```
harvestXp(crop) = max(2, floor(growMinutes / 6))
```

| 作物 | growMinutes | plant | harvest | 一轮合计 |
|------|-------------|-------|---------|----------|
| 香蕉 | 15 | 1 | 2 | 3 |
| 小麦 | 20 | 1 | 3 | 4 |
| 苹果 | 25 | 1 | 4 | 5 |
| 玉米 | 40 | 1 | 6 | 7 |
| 榴莲 | 60 | 1 | 10 | 11 |

**其他**

| 行为 | 经验 | 备注 |
|------|------|------|
| 解锁地块 | +10 | 每块地仅一次 |
| 领取每日种子 | +3 | 每天一次 |
| 浇水 | 0 | |
| 除虫 | 0 | |

### 5.2 发放时机

- `plant()` 成功 → +plantXp
- `harvest()` / `harvestAll()` 每格 → +harvestXp
- `unlockPlot()` 成功 → +10
- `claimDailySeeds()` 成功 → +3
- 一次操作可连升多级；升级奖励按 **实际升到的每一级** 各发放一次

## 6. 升级奖励（随机、随等级变丰富）

每升 **1** 级随机发放，等级越高奖池越好、数量越多：

| 农场等级 | 小麦种子 | 宠物食物池 | 额外规则 |
|----------|----------|------------|----------|
| Lv.1–2 | `3 + floor(L/2)` | 仅饼干 | — |
| Lv.3–4 | 同上 | 饼干 / 巧克力 | 35% 双份主食物 |
| Lv.5–6 | 同上 | + 奶油面包 | 30% 再 roll 一份食物 |
| Lv.7–8 | 同上 | + 草莓牛奶 | 25% 额外 1–2 粒香蕉/苹果/玉米种子 |
| Lv.9+ | 同上 | 全池 | 20% 额外草莓牛奶 |

Toast：`🎉 农场升到 Lv.2！获得 小麦种子×4、巧克力×1`

## 7. 地块解锁（改用农场等级）

沿用 `plotUnlockRequirement(plotIndex)` 规则不变，仅把校验从 `getPetPlayerLevel()` 改为 `farmLevelFromTotalXp(farm.totalXp)`：

| 地块 | 所需农场等级 |
|------|--------------|
| 1–4 | 0（默认） |
| 5–9 | 0（仅金币） |
| 10–14 | 1 |
| 15–19 | 2 |
| 20–24 | 3 |

前端提示改为：

```
需要农场 Lv.2 才能解锁（当前 Lv.1，还差 320 经验）
```

## 8. UI

### 8.1 顶栏 HUD（`src/farmPage.ts`）

```
┌─────────────────────────────────────────────┐
│ 🌾 农 Lv.1  [██████░░░░░░] 180/650  🪙 119  ☀️ 晴天 │
└─────────────────────────────────────────────┘
```

- **标签**：`🌾 农 Lv.{level}`，与宠物设置页「等级」区分。
- **进度条**：`farmXpProgress.current / farmXpProgress.required`；满级显示「MAX」或满条灰色。
- 收割/种获得经验时 **v1 不逐条飘字**（避免刷屏）；升级时 Toast 即可。

### 8.2 CSS

- 在现有 `.farm-hud-pill` 旁增加 `.farm-hud-level` 容器：等级文字 + 窄进度条（高度约 4–6px，圆角，与 MPT 工具页风格一致）。

## 9. 架构与文件

```
electron/farm/
  farmLevelCatalog.ts   — 经验表、升级阈值、升级奖励常量
  farmLevel.ts          — addFarmXp, farmLevelFromTotalXp, farmXpProgress, applyLevelUpRewards
  farmEngine.ts         — plant/harvest 等返回 xpGained（或由上层 gameEngine 统一加）
  farmTypes.ts          — FarmProgress, FarmPageContext 扩展
  farmIpc.ts            — 移除 getPetPlayerLevel；context 带 farmLevel + progress

electron/game/
  gameEngine.ts         — unlockPlotWithPayment 读 farm.totalXp；升级时写 inventory
  gameStore.ts          — 解析/迁移 farm.totalXp

src/
  farmPage.ts           — HUD 等级 + 进度条
  style.css             — .farm-hud-level, .farm-xp-bar
```

### 9.1 纯函数边界

- `farmLevel.ts` 无 IO，可单测：升级阈值、连升、满级、奖励数量。
- `gameEngine` 负责把 `totalXp` 持久化到 `GameState` 并在升级时改 `inventory`。

## 10. 测试

- `farmLevel.test.ts`：阈值表、progress 计算、连升 2 级、满级 progress
- `gameEngine.test.ts`：unlock 使用 farmLevel 而非 petLevel
- `farmIpc.test.ts`：context 含 `farmLevel` / `farmXpProgress`
- 迁移：缺 `totalXp` 的旧 farm 存档 → 0

## 11. 实现顺序建议

1. `farmLevelCatalog.ts` + `farmLevel.ts` + 单测
2. `FarmCoreState` / store 迁移 + `gameEngine` 接入经验与奖励
3. `farmIpc` 去掉宠物等级，`FarmPageContext` 扩展
4. `farmPage` HUD + CSS
5. 更新 `farmIpc.test.ts` / `gameEngine.test.ts`

## 12. 已确认产品决策

| 项 | 决策 |
|----|------|
| 升级奖励 | 小麦种子 ×3 + 饼干 ×1 |
| 顶栏 | 要经验进度条 |
| 经验节奏 | 超级慢（Lv.1 ≈ 500 XP 起，每级递增 150） |
| 宠物等级 | 与农场完全脱钩 |
