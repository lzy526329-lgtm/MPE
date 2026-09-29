# 服务端游戏命令接口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让服务端成为金币、库存、农场、商店和钓鱼操作的唯一写入方，并为命令提供幂等和事务保护。

**Architecture:** 保留现有 `game_save` payload 作为版本化存储，新增读取状态、迁移和命令服务。命令只接收动作参数和 `requestId`，服务端在事务中锁定存档、重新读取当前状态、执行规则并返回新状态与 revision。

**Tech Stack:** Node.js CommonJS, existing game server repositories, MySQL transaction abstractions, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-29-server-authoritative-game-design.md`

## Global Constraints

- 客户端不能通过日常接口提交完整库存、金币或随机结果。
- 每个命令按 `(user_id, request_id)` 幂等，重复请求不得重复扣款或发奖。
- 所有状态变更必须锁定当前存档并写入新 revision。
- 现有好友农场偷取和对战接口保持兼容。

### Task 1: Add command validation and idempotency repository

**Files:**
- Create: `server/game/gameCommandRepository.js`
- Modify: `server/DB/migrations/` with a dated additive migration for command results
- Test: `server/test/game-command-repository.test.js`

- [ ] **Step 1: Write failing tests for request ID length/format, duplicate lookup, and transactional insert.**
- [ ] **Step 2: Run `node --test server/test/game-command-repository.test.js` and verify the missing repository/migration failure.**
- [ ] **Step 3: Add a table keyed by `(user_id, request_id)` containing command name, response payload, and created timestamp; parameterize every query.**
- [ ] **Step 4: Implement repository methods `findResult(userId, requestId, connection)` and `insertResult(input, connection)`.**
- [ ] **Step 5: Run the focused repository tests and commit `feat: add idempotent game command storage`.**

### Task 2: Add state read and migration endpoints

**Files:**
- Create: `server/game/gameStateService.js`
- Modify: `server/game/router.js`
- Modify: `server/game/saveController.js` or create `server/game/gameStateController.js`
- Test: `server/test/game-state-service.test.js`, `server/test/game-router.test.js`

- [ ] **Step 1: Write failing tests for empty state, current state with revision, and migration against base revision zero.**
- [ ] **Step 2: Run the focused tests and verify they fail because the routes are absent.**
- [ ] **Step 3: Implement `getState(userId)` and `migrate(userId, input)` by reusing save validation and repository locks.** Return `{ status, save, state, revision }` with the same normalized schema as current saves.
- [ ] **Step 4: Register authenticated `GET /api/game/state` and `POST /api/game/migrate` routes.** Reject unexpected fields and malformed payloads before database writes.
- [ ] **Step 5: Run the focused server tests and commit `feat: expose authenticated game state and migration`.**

### Task 3: Implement transactional farm and economy commands

**Files:**
- Create: `server/game/gameCommandService.js`
- Modify: `server/game/router.js`
- Create: `server/game/gameCommandController.js`
- Test: `server/test/game-command-service.test.js`, `server/test/game-command-controller.test.js`

- [ ] **Step 1: Write failing tests for buy seed, harvest, sell produce, and duplicate `requestId`.** Assert server-side balances and inventory after each command.
- [ ] **Step 2: Run the focused tests and verify they fail before command dispatch exists.**
- [ ] **Step 3: Implement command dispatch with explicit action schemas, server catalog prices, farm readiness checks, and atomic save writes.**
- [ ] **Step 4: Check the idempotency table before mutation and store the serialized successful response in the same transaction.**
- [ ] **Step 5: Register authenticated `POST /api/game/command`; return business errors without echoing payload secrets.**
- [ ] **Step 6: Run farm, save, friend-farm, and command tests; commit `feat: add authoritative farm and economy commands`.**

### Task 4: Implement authoritative fishing commands

**Files:**
- Modify: `server/game/gameCommandService.js`
- Modify: `server/game/gameCommandController.js`
- Test: `server/test/game-fishing-command.test.js`

- [ ] **Step 1: Write failing tests for bait deduction, server-generated fish result, bag capacity, and duplicate completion request.**
- [ ] **Step 2: Run the focused fishing tests and verify the command is not implemented.**
- [ ] **Step 3: Generate and validate fish quality, weight, sell price, and discovery server-side; update the account save in one transaction.**
- [ ] **Step 4: Return the committed state and result summary; never accept client-supplied price or quality.**
- [ ] **Step 5: Run the focused fishing tests and commit `feat: make fishing rewards server authoritative`.**

### Task 5: Verify server security and compatibility

**Files:**
- Modify: `server/test/game-api.integration.test.js`
- Modify: `server/test/game-farm-stealing.test.js`
- Modify: `server/test/game-save.test.js`

- [ ] **Step 1: Add tests proving ordinary clients cannot mutate balances through `PUT /save` after migration and that existing friend-farm stealing still updates both saves.**
- [ ] **Step 2: Run the non-listening server test files and the integration suite where the environment permits local sockets.**
- [ ] **Step 3: Run SQL/migration checks and inspect all new queries for parameter binding.**
- [ ] **Step 4: Commit `test: verify authoritative game command security`.**

