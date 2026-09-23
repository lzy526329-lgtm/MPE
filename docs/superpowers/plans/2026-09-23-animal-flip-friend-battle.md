# Animal Flip Friend Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ] syntax) for tracking.

**Goal:** Add a logged-in, private two-player friend battle mode for 象狮虎豹 with six-digit room codes, ready-state escrow of 10 coins per player, server-authoritative turns, and idempotent settlement, while preserving the existing computer mode.

**Architecture:** Keep the existing local engine for 人机对战. Add a server-owned room/game service behind the existing Express game router and authenticated WebSocket endpoint. Electron exposes typed HTTP and realtime bridge methods to the renderer; the renderer adds a mode selector, friend invitation/room-code flow, ready room, and a server-snapshot-driven board.

**Tech Stack:** TypeScript/Vite/Electron renderer and preload bridge; Node.js CommonJS/Express/ws; MySQL migrations and repository/service/controller tests; Vitest and Node's built-in test runner.

**Spec:** docs/superpowers/specs/2026-09-23-animal-flip-friend-battle-design.md

## Global Constraints

- Friend battles require an authenticated game session and an existing mutual friendship.
- Each participant escrows exactly 10 coins at ready time; winner receives 20, a draw refunds 10 each, and pre-game cancellation/refund is idempotent.
- After play starts, a quit or expired disconnect forfeits the quitter and awards the opponent; server state is authoritative.
- Opponent unrevealed cards must never be present in the opponent-visible snapshot.
- Existing human-vs-computer mode and local wallet/shop behavior remain compatible.
- Every request carries an idempotency key; duplicate requests return the original result.

---

### Task 1: Add the server domain model, repositories, and schema migration

**Files:**
- Create: gognju-server/server/game/animalFlipDomain.js
- Create: gognju-server/server/game/animalFlipRepository.js
- Create: gognju-server/server/DB/migrations/2026-09-23-animal-flip-friend-battle.sql
- Modify: gognju-server/backenddb.sql
- Test: gognju-server/server/test/game-animal-flip-schema.test.js

**Interfaces:**
- createAnimalFlipState(random?) -> { board, turn, result, actionSeq, lastRequestId }
- applyAnimalFlipAction(state, side, action) -> { state, event } and throws ILLEGAL_ACTION for invalid moves.
- createAnimalFlipRepository(sqlPool) -> { withTransaction, findUser, areFriends, createRoom, findRoomByCode, findRoomForUser, lockRoom, listMembers, addMember, setReady, lockWallet, getWallet, insertLedger, finishRoom, saveGame, loadGame, findIdempotency }.
- Add tables for game_wallet, game_wallet_ledger, animal_flip_room, animal_flip_room_member, animal_flip_game, and animal_flip_request, with unique room codes, member/room pairs, ledger idempotency keys, and indexed states/expiry.

- [ ] Step 1: Write schema/domain tests covering room-code format/uniqueness constraints, wallet ledger uniqueness, initial board shape, hidden-card projection, and same-rank/rat-eats-elephant rules.
- [ ] Step 2: Run the focused tests and verify they fail with missing modules/tables.
- [ ] Step 3: Implement animalFlipDomain.js by adapting the tested rules from gognju/src/animalFlipEngine.ts; keep complete cards in server state and expose projectAnimalFlipState(state, viewerSide) that replaces opponent unrevealed cards with { revealed:false }.
- [ ] Step 4: Implement the repository methods with parameterized SQL and transaction-friendly connection arguments. Wallet initialization must use the current legal save coin total only when no wallet row exists.
- [ ] Step 5: Add the migration and mirror all CREATE/ALTER statements into backenddb.sql without changing existing tables.
- [ ] Step 6: Run node --test server/test/game-animal-flip-schema.test.js and commit feat: add animal flip friend battle persistence.

### Task 2: Implement room lifecycle, escrow, action validation, and settlement services

**Files:**
- Create: gognju-server/server/game/animalFlipService.js
- Create: gognju-server/server/game/animalFlipController.js
- Modify: gognju-server/server/game/errors.js
- Modify: gognju-server/server/game/router.js
- Test: gognju-server/server/test/game-animal-flip-service.test.js
- Test: gognju-server/server/test/game-animal-flip-api.test.js

**Interfaces:**
- createAnimalFlipService({ repository, clock, random }) returns:
  - createRoom(userId, friendId, requestId)
  - joinRoom(userId, code, requestId)
  - getRoom(userId, roomId)
  - setReady(userId, roomId, ready, requestId)
  - leaveRoom(userId, roomId, requestId)
  - recover(userId, roomId, requestId)
  - submitAction(userId, roomId, input)
  - expireRooms()
- createAnimalFlipController({ animalFlipService }) exposes Express handlers returning the existing successResponse/errorResponse envelope.

- [ ] Step 1: Write failing service/API tests for friend-only room creation, six-digit join, room-full/expired errors, insufficient balance, duplicate ready, both-ready game start, hidden snapshots, turn/action-sequence validation, draw/win settlement, pre-game refund, post-game quit loss, and duplicate request replay.
- [ ] Step 2: Run the focused Node tests and verify the expected failures.
- [ ] Step 3: Add stable errors NOT_LOGGED_IN, NOT_FRIENDS, ROOM_NOT_FOUND, ROOM_FULL, ROOM_EXPIRED, INSUFFICIENT_COINS, STATE_CONFLICT, NOT_YOUR_TURN, ILLEGAL_ACTION, ACTION_SEQ_EXPIRED, GAME_FINISHED, and SETTLEMENT_COMPLETED.
- [ ] Step 4: Implement room transitions (waiting -> ready -> playing -> finished, or cancelled) and friend checks. Generate a six-digit code with collision retry.
- [ ] Step 5: Implement transactional escrow: lock wallet, subtract 10, insert a ledger row keyed by roomId:userId:deposit; refund/calculate winner in one transaction with unique settlement key.
- [ ] Step 6: Implement authoritative actions: load complete game, reject wrong user/turn/sequence, call domain action, persist state, and return viewer-specific projection.
- [ ] Step 7: Implement disconnect/expiry and recovery according to the spec, including pre-game refund and post-game forfeit.
- [ ] Step 8: Register authenticated routes under /api/game/animal-flip/rooms and add controller tests through createApp.
- [ ] Step 9: Run the focused tests and commit feat: add authoritative animal flip rooms.

### Task 3: Extend authenticated WebSocket realtime for room events

**Files:**
- Modify: gognju-server/server/game/realtime.js
- Modify: gognju-server/server/app.js or server bootstrap where attachGameWebSocket is called
- Modify: gognju-server/server/game/router.js if dependency injection is required
- Test: gognju-server/server/test/game-animal-flip-realtime.test.js

**Interfaces:**
- attachGameWebSocket({ ..., roomService }) accepts the service and routes messages:
  - animal_flip.subscribe
  - animal_flip.action
  - animal_flip.recover
- Outbound messages are animal_flip.room_snapshot, animal_flip.member_changed, animal_flip.game_started, animal_flip.state_changed, animal_flip.finished, animal_flip.cancelled, and animal_flip.error.

- [ ] Step 1: Write failing realtime tests for member-only broadcasts, per-user hidden-card views, action request replay, and recovery after reconnect.
- [ ] Step 2: Run the focused test and verify failure.
- [ ] Step 3: Add room subscription tracking to the existing presence hub without removing presence snapshots.
- [ ] Step 4: Parse and validate JSON messages, call the service, send the requesting user's projection, and broadcast the other member's projection.
- [ ] Step 5: Clean subscriptions on close and call room expiry/forfeit hooks.
- [ ] Step 6: Run node --test server/test/game-animal-flip-realtime.test.js server/test/game-realtime.test.js and commit feat: stream animal flip room events.

### Task 4: Add Electron account API, realtime, IPC, and preload contracts

**Files:**
- Modify: gognju/electron/gameAccount/types.ts
- Modify: gognju/electron/gameAccount/api.ts
- Modify: gognju/electron/gameAccount/realtime.ts
- Modify: gognju/electron/gameAccount/ipc.ts
- Modify: gognju/electron/preload.ts
- Modify: gognju/electron/main.ts only if close/disconnect cleanup is needed
- Test: gognju/electron/gameAccount/api.test.ts
- Test: gognju/electron/gameAccount/realtime.test.ts
- Test: gognju/electron/gameAccount/ipc.test.ts

**Interfaces:**
- Add AnimalFlipRoom, AnimalFlipSnapshot, AnimalFlipAction, AnimalFlipRealtimeEvent.
- Add bridge methods:
  - gameAccountCreateAnimalFlipRoom(friendId)
  - gameAccountJoinAnimalFlipRoom(code)
  - gameAccountGetAnimalFlipRoom(roomId)
  - gameAccountSetAnimalFlipReady(roomId, ready)
  - gameAccountLeaveAnimalFlipRoom(roomId)
  - gameAccountRecoverAnimalFlipRoom(roomId)
  - gameAccountSubmitAnimalFlipAction(roomId, action, actionSeq, requestId)
  - onAnimalFlipRoomEvent(callback)
- [ ] Step 1: Write failing API/bridge tests asserting request paths, bearer token, validation, and event forwarding.
- [ ] Step 2: Run focused tests and verify failure.
- [ ] Step 3: Add typed API methods and request validation; preserve the existing GameApiError mapping.
- [ ] Step 4: Extend realtime event union and route room events to a dedicated IPC channel while preserving presence events.
- [ ] Step 5: Add trusted IPC handlers and preload functions; stop/refresh realtime on auth changes exactly as existing friend methods do.
- [ ] Step 6: Run Electron focused tests and commit feat: expose animal flip friend battle bridge.

### Task 5: Build renderer mode selection and friend room UI

**Files:**
- Create: gognju/src/animalFlipFriendPage.ts
- Modify: gognju/src/animalFlipPage.ts
- Modify: gognju/src/animalFlip.css
- Modify: gognju/src/appPages.ts
- Modify: gognju/src/main.ts
- Modify: gognju/src/style.css only for shared modal/button tokens
- Test: gognju/src/__tests__/animalFlipFriendPage.test.ts
- Modify: gognju/src/__tests__/animalFlipPage.test.ts

**Interfaces:**
- renderAnimalFlipModeSelector(account) -> string
- renderAnimalFlipFriendRoom(model) -> string
- mountAnimalFlipFriendPage(root?) -> cleanup
- projectServerBoard(snapshot) -> renderable board
- animalFlipPage switches to local mount for 人机 or friend mount for 好友.

- [ ] Step 1: Write failing renderer tests for mode buttons, login prompt, online-friend invitation, six-digit code join, ready/escrow copy, hidden opponent card, disabled input while reconnecting, settlement copy, and return-to-mode button.
- [ ] Step 2: Run focused Vitest tests and verify failure.
- [ ] Step 3: Implement pure render functions and escape all server-provided names/codes/messages.
- [ ] Step 4: Add mode state to animalFlipPage.ts; preserve local engine and restart behavior behind 人机.
- [ ] Step 5: Implement the friend room state machine: load account/friends, create/join room, toggle ready, subscribe to room events, submit only legal server snapshot actions, recover after reconnect, and show errors without mutating the board.
- [ ] Step 6: Add responsive board sizing so cards remain readable in the existing enlarged layout.
- [ ] Step 7: Run focused Vitest tests and commit feat: add friend battle mode UI.

### Task 6: Add wallet synchronization and account-facing balance updates

**Files:**
- Modify: gognju/electron/gameAccount/types.ts
- Modify: gognju/electron/gameAccount/api.ts
- Modify: gognju/electron/gameAccount/ipc.ts
- Modify: gognju/electron/game/gameStore.ts
- Modify: gognju/src/accountPage.ts
- Modify: gognju/src/friendPage.ts
- Test: gognju/electron/game/gameStore.test.ts
- Test: gognju/src/__tests__/accountPage.test.ts

- [ ] Step 1: Write failing tests for applying a server wallet balance after settlement, preserving local inventory, and displaying escrow/result deltas.
- [ ] Step 2: Implement a narrow applyServerWalletCoins(userDataPath, coins) mutation that serializes through the existing game queue and emits the normal game-state event.
- [ ] Step 3: Forward wallet balances in room snapshots/finish events and call the mutation only after a server-confirmed settlement.
- [ ] Step 4: Render current balance, locked 10-coin deposit, and final +20/0/refund result in account/friend views.
- [ ] Step 5: Run focused tests and commit feat: sync friend battle wallet balances.

### Task 7: Complete verification and end-to-end smoke flow

**Files:**
- Create: gognju/src/__tests__/animalFlipFriendFlow.test.ts
- Modify: gognju/docs/superpowers/specs/2026-09-23-animal-flip-friend-battle-design.md only if implementation clarifies a contract

- [ ] Step 1: Run the renderer suite: npm test -- --run.
- [ ] Step 2: Run TypeScript/build checks: npm run build:app.
- [ ] Step 3: Run server tests: node --test server/test/*.test.js from gognju-server/server.
- [ ] Step 4: Start the API and Vite/Electron development environments with test credentials/fixtures, create a private room, join with a friend, ready both clients, execute flip/move/attack, verify hidden cards, then verify winner settlement and returned balance.
- [ ] Step 5: Fix failures found by the smoke flow, rerun affected focused tests, then rerun complete suites.
- [ ] Step 6: Commit test: verify animal flip friend battle flow and report exact commands/results.
