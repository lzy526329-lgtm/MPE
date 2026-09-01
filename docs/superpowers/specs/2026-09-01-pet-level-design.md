# 宠物等级系统（亲密度）设计

## 目标

为桌面虚拟宠物增加亲密度成长：日常照顾、小游戏、对话积累 `growth`，自动换算 `level` 并更新称号。与农场等级完全独立，等级无上限。

## 核心规则

| 项 | 规则 |
|----|------|
| `growth` | 累计亲密度经验，只增不减 |
| `level` | 由 `growth` 换算，无上限 |
| 升级公式 | Lv.N → Lv.N+1 需要 `80 + N × 40` 经验 |
| 称号 | 升级时 `title = titleForLevel(level)` |
| 与农场 | 完全独立 |

## 经验来源

| 行为 | 经验 | 触发点 |
|------|------|--------|
| 喂食 | +8 | `feedPetWithSatiety()` |
| 清洁 | +6 | `cleanPetAction()` |
| 休息 | +5 | `restPetAction()` |
| 完成小游戏 | +15 | `pet:minigame-ended` |
| 对话 | +3/条 | `pet:ai-send`，每日上限 30 |

## 升级反馈（最简）

升级时仅更新 `level`、`growth`、`title`，广播 `pet:status-changed`。无 Toast、动画、金币、解锁。

## 存档

`PetSettings.growthDaily?: { date: string; chatXp: number }` — 对话日上限追踪。

## UI

宠物设置 · 基础信息：等级 + 当前级进度（current/required）+ 累计 growth 次要展示。

## 模块

- `electron/petLevel.ts` — 曲线、进度、grant
- `electron/petLevel.test.ts` — 单元测试
- 挂钩：`pet.ts`（照顾/小游戏）、`petAi.ts`（对话）

## 称号表（沿用 `titleForLevel`）

| 等级 | 称号 |
|------|------|
| 0 | 初来乍到 |
| 1 | 小伙伴 |
| 2 | 熟悉的朋友 |
| 3–4 | 可靠的伙伴 |
| 5–9 | 亲密搭档 |
| 10+ | 灵魂搭档 |
