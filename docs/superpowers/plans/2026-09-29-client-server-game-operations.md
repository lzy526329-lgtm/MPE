# 客户端服务端游戏操作实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将农场、商店、背包、钓鱼和桌宠背包消耗从本地写入改为服务端命令，并让页面使用服务端返回的提交状态。

**Architecture:** 保留现有渲染层 IPC 方法签名，新增账号游戏 API/服务层承载命令、缓存写入和错误映射。每次操作使用随机 `requestId`，成功后原子更新当前账号缓存并发布统一游戏状态；网络失败不伪造成功状态。

**Tech Stack:** TypeScript, Electron IPC, existing preload bridge, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-server-authoritative-game-design.md`

## Global Constraints

- 所有账号游戏写操作必须先经过服务端并使用 `requestId`。
- 渲染层继续使用现有页面接口，不直接接触账号 token。
- 服务端返回的状态是唯一可发布的新游戏状态。
- 未登录或会话失效时页面返回账号入口，桌宠普通功能继续工作。

### Task 1: Add typed account game API and cache writer

**Files:**
- Modify: `electron/gameAccount/api.ts`
- Modify: `electron/gameAccount/types.ts`
- Create: `electron/gameAccount/gameService.ts`
- Test: `electron/gameAccount/api.test.ts`, `electron/gameAccount/gameService.test.ts`

- [ ] **Step 1: Write failing tests for `getGameState`, `migrateGame`, and `sendGameCommand` request shape, authorization header, and response validation.**
- [ ] **Step 2: Run focused tests and verify the new methods are absent.**
- [ ] **Step 3: Add typed API methods and a service that resolves the active session, generates request IDs, writes the account cache atomically, and maps server business errors to `GameActionResult` codes.**
- [ ] **Step 4: Run focused API/service tests and commit `feat: add client account game service`.**

### Task 2: Route game IPC through the account service

**Files:**
- Modify: `electron/game/gameIpc.ts`
- Modify: `electron/farm/farmIpc.ts`
- Modify: `electron/fishing/fishingIpc.ts`
- Modify: `electron/pet.ts`
- Test: `electron/game/gameIpc.test.ts`, `electron/farm/farmIpc.test.ts`, `electron/fishing/fishingIpc.test.ts`

- [ ] **Step 1: Write failing tests proving purchases, harvests, fishing completion, and food/supply use call the account game service instead of `withGame` when logged in.**
- [ ] **Step 2: Run focused tests and verify current handlers still write local files directly.**
- [ ] **Step 3: Inject the account game service into the handlers while preserving existing renderer method signatures and state publication.**
- [ ] **Step 4: Keep local-only pet interactions working; gate food and supply consumption through the account service.**
- [ ] **Step 5: Run focused IPC tests and commit `feat: route game mutations through account service`.**

### Task 3: Update page loading and error states

**Files:**
- Modify: `src/farmPage.ts`
- Modify: `src/shopPage.ts`
- Modify: `src/backpackPage.ts`
- Modify: `src/fishingPage.ts`
- Modify: `src/accountPage.ts`
- Test: `src/__tests__/farmPage.test.ts`, `src/__tests__/shopPage.test.ts`, `src/__tests__/backpackPage.test.ts`, `src/__tests__/fishingPage.test.ts`

- [ ] **Step 1: Add failing tests for loading the account cache, displaying server business errors, and keeping the old state visible while a command is in flight.**
- [ ] **Step 2: Run focused UI tests and verify the current local-only assumptions fail.**
- [ ] **Step 3: Render the state returned by the account service, disable duplicate actions, and show retry/login prompts for network and session errors.**
- [ ] **Step 4: Ensure the farm log and backpack redraw after a server-side steal or command response.**
- [ ] **Step 5: Run all client UI tests and commit `feat: update game pages for server commands`.**

### Task 4: Remove normal full-save uploads and verify end-to-end behavior

**Files:**
- Modify: `electron/gameAccount/syncCoordinator.ts`
- Modify: `electron/gameAccount/ipc.ts`
- Modify: `src/accountPage.ts`
- Test: `electron/gameAccount/syncCoordinator.test.ts`, `electron/gameAccount/ipc.test.ts`, `electron/gameAccount/e2e.test.ts`

- [ ] **Step 1: Write failing tests proving ordinary game actions do not call `putSave`, while migration and explicit conflict recovery still do.**
- [ ] **Step 2: Remove debounce uploads for account game mutations and retain cloud refresh for server-side farm events.**
- [ ] **Step 3: Update account page copy from “同步本地存档” to account state/connection status and preserve explicit migration conflict actions.**
- [ ] **Step 4: Run the full client test suite and `GAME_API_BASE_URL=https://example.invalid npm run build:app`.**
- [ ] **Step 5: Commit `refactor: retire normal full-save game synchronization`.**

