# 游戏账号门槛与缓存迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 要求农场、商店、背包、钓鱼和好友玩法登录后使用，并把游戏缓存按账号隔离、完成首次登录迁移。

**Architecture:** 桌宠页面继续读取本地 `pet.json`；账号游戏页由统一访问门禁控制。登录后为每个用户解析独立的 `game-cache/<userId>/game.json`，同步协调器和游戏 IPC 使用当前账号路径；首次登录沿用现有云存档摘要/冲突流程，退出时清空当前游戏视图。

**Tech Stack:** TypeScript, Electron IPC, Vite, Vitest, Node filesystem APIs.

**Spec:** `docs/superpowers/specs/2026-09-29-server-authoritative-game-design.md`

## Global Constraints

- 应用启动不要求登录，桌宠和工具箱页面保持可用。
- 农场、商店、背包、钓鱼、好友农场和好友对战入口点击时要求登录。
- 首次登录云端为空时自动迁移本地 `game.json`；云端已有数据继续使用冲突选择。
- 账号缓存必须按用户 ID 隔离，退出后不可显示旧账号游戏数据。

### Task 1: 定义账号游戏缓存路径

**Files:**
- Create: `electron/gameAccount/gameCache.ts`
- Test: `electron/gameAccount/gameCache.test.ts`

**Interfaces:**
- `getGameCachePath(userDataPath: string, userId: number | string): string`
- `ensureGameCacheDir(userDataPath: string, userId: number | string): string`
- `isGameCachePath(path: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
it('uses a separate directory for each account', () => {
  expect(getGameCachePath('/tmp/mpt', 42)).toBe('/tmp/mpt/game-cache/42/game.json')
  expect(getGameCachePath('/tmp/mpt', '7')).toBe('/tmp/mpt/game-cache/7/game.json')
})
```

- [ ] **Step 2: Run `npm test -- --run electron/gameAccount/gameCache.test.ts` and verify the missing-module failure.**
- [ ] **Step 3: Implement path validation, directory creation, and safe user ID normalization.** Reject empty IDs, path separators, and `..` segments.
- [ ] **Step 4: Run the focused test and verify it passes.**
- [ ] **Step 5: Commit with `feat: isolate game caches per account`.**

### Task 2: Make sync coordination use the active account cache

**Files:**
- Modify: `electron/gameAccount/syncCoordinator.ts`
- Modify: `electron/gameAccount/ipc.ts`
- Modify: `electron/gameAccount/sessionStore.ts`
- Test: `electron/gameAccount/syncCoordinator.test.ts`, `electron/gameAccount/ipc.test.ts`

**Interfaces:**
- `createSyncCoordinator({ cachePath, ...options })` accepts a cache path resolver or current account cache path.
- `sync.getState()` remains backward compatible.
- `sync.sessionChanged()` switches to the logged-in account cache before the first cloud request.

- [ ] **Step 1: Add failing tests for two sessions using different `game.json` files and for logout not reading the previous cache.**
- [ ] **Step 2: Run the focused sync and IPC tests and verify they fail because the coordinator still reads the shared root `game.json`.**
- [ ] **Step 3: Move `localSnapshot`, `upload`, cloud application, and backup creation to the active account cache path.** Keep `pet.json` at the root user data path.
- [ ] **Step 4: On login, select the account cache before `syncNow`; on logout, stop timers, clear in-memory game state, and publish an account-only state change.**
- [ ] **Step 5: Run the focused tests and then the existing `electron/gameAccount` test set.**
- [ ] **Step 6: Commit with `feat: bind cloud sync to account cache`.**

### Task 3: Add page-level login gating

**Files:**
- Create: `src/gameAccess.ts`
- Modify: `src/appNavigation.ts`
- Modify: `src/appPages.ts`
- Modify: `src/accountPage.ts`
- Test: `src/__tests__/gameAccess.test.ts`, `src/__tests__/appNavigation.test.ts`

**Interfaces:**
- `requiresGameAccount(pageId: AppPageId): boolean`
- `setPendingGamePage(pageId: AppPageId): void`
- `consumePendingGamePage(): AppPageId | null`
- `installGameAccessGate(): () => void`

- [ ] **Step 1: Write failing tests proving unauthenticated navigation to `farm-page`, `shop-page`, `backpack-page`, `fishing-page`, `friend-page`, and `animal-flip-page` redirects to `account-page`, while pet/tool pages remain accessible.**
- [ ] **Step 2: Run the focused navigation tests and verify the redirect assertions fail.**
- [ ] **Step 3: Add a single account-game page set and intercept navigation before changing the visible page.** Store the attempted page and render a short login-required notice in the account page.
- [ ] **Step 4: After successful login, consume the pending page and navigate there once; after logout, route away from account pages.**
- [ ] **Step 5: Run navigation, account-page, and main rendering tests.**
- [ ] **Step 6: Commit with `feat: require login for account game pages`.**

### Task 4: Verify migration and account switching behavior

**Files:**
- Modify: `electron/gameAccount/syncCoordinator.test.ts`
- Modify: `electron/gameAccount/sessionStore.test.ts`
- Modify: `src/__tests__/gameAccess.test.ts`

- [ ] **Step 1: Add tests for empty cloud auto-migration, existing cloud conflict, account A/B cache separation, and returning to the attempted page after login.**
- [ ] **Step 2: Run the full client test suite and verify all new and existing tests pass.**
- [ ] **Step 3: Run `GAME_API_BASE_URL=https://example.invalid npm run build:app`.**
- [ ] **Step 4: Review `git diff --check` and commit with `test: cover account game migration and gating`.**

