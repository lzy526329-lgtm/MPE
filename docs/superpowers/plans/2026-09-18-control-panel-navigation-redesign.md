# Control Panel Navigation and UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Keep every global menu entry available while replacing the mixed sidebar and shared page styling with a stable grouped navigation shell and responsive control panel UI.

**Architecture:** Define all page metadata in one registry, make `appNavigation.ts` the single owner of page visibility and active navigation state, and let `main.ts` render grouped buttons from that registry. Keep pet settings tabs inside the settings page and preserve all existing field IDs and business event handlers. Add scoped shared shell styles in `style.css` so existing tool pages inherit the new visual system without changing their feature logic.

**Tech Stack:** TypeScript, Vite, Electron renderer DOM, CSS custom properties, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-control-panel-navigation-redesign.md`

## Global Constraints

- Preserve all existing page IDs, Electron APIs, resource paths, and page behavior.
- The global sidebar must remain visible after every valid page transition.
- Pet settings tabs remain internal to `pet-settings-root` and keep their existing `data-pet-panel` and field IDs.
- Do not add a UI framework or external runtime dependency.
- Production verification uses `GAME_API_BASE_URL=https://game.example.invalid npm run build:app`.

---

### Task 1: Add a typed page registry and navigation regression tests

**Files:**
- Modify: `src/appPages.ts`
- Modify: `src/__tests__/appPages.test.ts`
- Modify: `src/__tests__/appNavigation.test.ts`

**Interfaces:**
- Produce `AppPageDefinition`, `APP_PAGE_DEFINITIONS`, and `getAppPageDefinition(pageId)`.
- Keep `APP_PAGE_TITLES`, `TOOL_PAGES`, and `APP_HOME_PAGE` exports available.

- [ ] **Step 1: Write failing registry assertions**

Add tests that assert every `APP_PAGE_TITLES` key has a registry entry, the registry has the expected groups (`pet`, `play`, `tool`, `account`), and tool pages remain excluded from the play group.

- [ ] **Step 2: Run the focused page tests**

Run: `npm test -- --run src/__tests__/appPages.test.ts`

Expected: FAIL because `APP_PAGE_DEFINITIONS` and `getAppPageDefinition` do not exist.

- [ ] **Step 3: Implement the minimal registry**

Define the type and a frozen record for all current page IDs. Derive `APP_PAGE_TITLES` and `TOOL_PAGES` from the registry while preserving their current values and types. Mark only the intended global entries with `showInGlobalNav: true`.

- [ ] **Step 4: Run the focused page tests**

Run: `npm test -- --run src/__tests__/appPages.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing navigation state assertions**

Extend `appNavigation.test.ts` with a document stub containing grouped `[data-page]` buttons. Assert that after switching between `pet-settings-page`, `farm-page`, `image-page`, and `account-page`, all buttons remain `hidden === false`, only the current button has `classList` active and `aria-current === 'page'`, and the toolbar/back state follows the current page.

- [ ] **Step 6: Commit the registry and test contract**

Run: `git add src/appPages.ts src/__tests__/appPages.test.ts src/__tests__/appNavigation.test.ts && git commit -m "test: define stable page navigation contract"`

Expected: commit succeeds with only the registry and tests staged.

### Task 2: Centralize navigation state and delegated menu events

**Files:**
- Modify: `src/appNavigation.ts`
- Modify: `src/__tests__/appNavigation.test.ts`

**Interfaces:**
- Consume `getAppPageDefinition` and `APP_HOME_PAGE` from `appPages.ts`.
- Preserve `navigateToPage`, `getCurrentPage`, `onPageChange`, and `setupAppNavigation` signatures.

- [ ] **Step 1: Add failing edge-case tests**

Test that an invalid page ID leaves the current page and active button unchanged, that an Electron navigation event with an invalid ID falls back to `APP_HOME_PAGE`, and that the delegated `[data-page]` click calls `navigateToPage` for a valid button.

- [ ] **Step 2: Run the focused navigation tests**

Run: `npm test -- --run src/__tests__/appNavigation.test.ts`

Expected: FAIL because the current implementation hides the settings nav and has no delegated menu synchronization.

- [ ] **Step 3: Implement centralized synchronization**

Replace `syncToolbar` with a state synchronizer that:

1. Updates `#workspace-title`, `#workspace-eyebrow`, and `#workspace-toolbar` when those nodes exist.
2. Shows every `[data-page]` button and updates its `active` class and `aria-current` value.
3. Shows the back button only for non-home pages.
4. Does not hide `#pet-settings-nav` or any global menu entry.
5. Uses the registry to resolve titles and groups.

Bind one click listener on the sidebar root using `closest('[data-page]')`; keep the existing Electron callback but validate and fall back safely.

- [ ] **Step 4: Run focused navigation tests**

Run: `npm test -- --run src/__tests__/appNavigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit navigation behavior**

Run: `git add src/appNavigation.ts src/__tests__/appNavigation.test.ts && git commit -m "fix: keep global navigation visible across pages"`

Expected: commit succeeds.

### Task 3: Render the new grouped global shell

**Files:**
- Modify: `src/main.ts`
- Modify: `src/appNavigation.ts`

**Interfaces:**
- Consume `APP_PAGE_DEFINITIONS` to render global buttons.
- Keep all existing page section IDs and mount calls unchanged.

- [ ] **Step 1: Replace hard-coded sidebar markup**

Render `桌宠`, `玩法`, and `工具箱` groups from the registry. Each button must use `data-page="<page id>"`, a stable `aria-label`, and the existing page ID as its target. Keep `open-pet-chat`, `open-pet-home`, `open-farm`, `open-fishing`, `open-shop`, `open-backpack`, and `open-account` IDs as compatibility hooks for existing code and tests, or add an explicit compatibility map if the generated markup needs those IDs.

- [ ] **Step 2: Add workspace header targets**

Add `#workspace-eyebrow`, keep `#workspace-title`, and keep `#workspace-back`. The header should display the active page metadata while the page's own content remains unchanged.

- [ ] **Step 3: Remove duplicated bottom button listeners**

Delete the individual `#open-*` navigation listeners in `main.ts`. The delegated listener from `setupAppNavigation()` must handle every global button.

- [ ] **Step 4: Run TypeScript and navigation tests**

Run: `npm test -- --run src/__tests__/appNavigation.test.ts src/__tests__/appPages.test.ts`

Expected: PASS with no missing compatibility hooks.

- [ ] **Step 5: Commit the shell markup**

Run: `git add src/main.ts src/appNavigation.ts && git commit -m "refactor: render grouped control panel navigation"`

Expected: commit succeeds.

### Task 4: Move pet settings navigation into its own page shell

**Files:**
- Modify: `src/petSettingsPage.ts`
- Modify: `src/__tests__/petSettingsPage.test.ts` if present, otherwise add `src/__tests__/petSettingsPage.test.ts`

**Interfaces:**
- Preserve all existing field IDs, panel IDs, and `switchPetSettingsTab` behavior.
- Produce stable `pet-settings-layout` and `pet-settings-tabs` hooks for styling and tests.

- [ ] **Step 1: Add failing markup assertions**

Mount the settings page with the existing DOM fixture and assert that the generated root contains `pet-settings-layout`, `pet-settings-tabs`, exactly six `data-pet-tab` buttons, and all six `data-pet-panel` values.

- [ ] **Step 2: Run the focused settings test**

Run: `npm test -- --run src/__tests__/petSettingsPage.test.ts`

Expected: FAIL because the settings root currently has no dedicated layout or tab wrapper.

- [ ] **Step 3: Wrap the existing settings markup**

Add the layout and secondary tab wrapper around the current panels. Keep the overview card and all existing panel internals. Make `switchPetSettingsTab` update `aria-selected` along with the existing active class.

- [ ] **Step 4: Run the focused settings test**

Run: `npm test -- --run src/__tests__/petSettingsPage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the settings shell**

Run: `git add src/petSettingsPage.ts src/__tests__/petSettingsPage.test.ts && git commit -m "refactor: isolate pet settings secondary navigation"`

Expected: commit succeeds.

### Task 5: Replace shared shell and page styles

**Files:**
- Modify: `src/style.css`

**Interfaces:**
- Preserve feature-specific selectors used by tool pages and game pages.
- Add styles for `.nav-group`, `.nav-group-title`, `.workspace-eyebrow`, `.workspace-header`, `.pet-settings-layout`, and `.pet-settings-tabs`.

- [ ] **Step 1: Add the new theme and shell rules**

Define the new CSS variables, grouped sidebar layout, active states, workspace header, shared cards, and focus-visible treatments. Scope compatibility rules so old feature selectors continue to work.

- [ ] **Step 2: Add responsive rules**

At `max-width: 900px`, switch the sidebar to a horizontal scrollable navigation rail and reduce workspace padding. At `max-width: 640px`, allow action rows and grouped menus to wrap while keeping every button visible.

- [ ] **Step 3: Add reduced-motion rules**

Under `prefers-reduced-motion: reduce`, set transition and animation durations to near-zero for the new shell and existing hover transforms.

- [ ] **Step 4: Run CSS-sensitive tests and type checks**

Run: `npm test -- --run src/__tests__/fishingPage.test.ts src/__tests__/appNavigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the shared UI system**

Run: `git add src/style.css && git commit -m "style: rebuild control panel visual system"`

Expected: commit succeeds.

### Task 6: Full verification and manual navigation review

**Files:**
- Modify: none unless verification finds a defect.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`

Expected: all test files and tests pass.

- [ ] **Step 2: Run the production app build**

Run: `GAME_API_BASE_URL=https://game.example.invalid npm run build:app`

Expected: Vite renderer and Electron bundles build successfully.

- [ ] **Step 3: Run whitespace and diff checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended source files and the pre-existing untracked `website.zip` remain.

- [ ] **Step 4: Manually verify the running app**

Open the development app and click settings, chat, farm, fishing, shop, backpack, account, and at least two tool pages in sequence. Confirm sidebar groups remain visible, the selected button stays highlighted, and back returns to pet settings.

- [ ] **Step 5: Commit any final fixes**

Run: `git add src && git commit -m "fix: finalize control panel navigation polish"`

Expected: commit only if verification required a source fix.
