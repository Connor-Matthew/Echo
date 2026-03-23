# Echo Dark Glass Chat Workspace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Echo's current warm Atelier chat shell into the approved dark-glass desktop workspace while preserving existing chat, session, and composer behavior.

**Architecture:** Treat the redesign as a presentational rewrite layered on top of the current `AppView + Sidebar + ChatView + Composer` wiring. Start by locking helper and token contracts in tests, then repaint the shared shell, rebuild the sidebar and toolbar rhythm, and finally move the conversation surfaces and composer tray into the new dark-glass system without changing business logic.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, CSS design tokens, Bun test, `node:test`

---

## File Map

- `docs/superpowers/specs/2026-03-23-echo-dark-glass-chat-workspace-design.md`
  Approved design spec that defines the visual target, constraints, and non-goals.
- `src/features/app/AppView.tsx`
  Own the top-level shell layout, compact-sidebar offsets, light toolbar, chat landing copy, and composer placement.
- `src/features/app/AppView.test.ts`
  Lock the top-level helper outputs and any shell copy/class contracts exposed for the redesign.
- `src/styles/design-tokens.css`
  Own shell-level variables for dark surfaces, blur alpha, spacing, radii, and stage widths.
- `src/styles/design-tokens.test.ts`
  Lock the new token contract so the shell rewrite stays intentional.
- `src/index.css`
  Paint the dark-glass background, frame chrome, sidebar material, toolbar treatment, message surfaces, and focus states.
- `src/components/Sidebar.tsx`
  Rebuild the chat sidebar into the approved fixed-nav + recent-sessions desktop index while preserving current callbacks and context menus.
- `src/components/Sidebar.test.tsx`
  Lock the brand block, search affordance, fixed navigation entries, and recent session presentation hooks.
- `src/components/chat/conversation-viewport.tsx`
  Adjust the reading stage width and bottom spacing for the deeper composer tray in the dark shell.
- `src/components/chat/conversation-viewport.test.ts`
  Lock the viewport spacing contract.
- `src/components/chat/message-frame.tsx`
  Move user and assistant message shells into the dark-glass message hierarchy.
- `src/components/chat/message-frame.test.tsx`
  Lock the updated message surface classes.
- `src/components/Composer.tsx`
  Repaint minimal composer mode into the fixed dark-glass input tray.
- `src/components/Composer.test.ts`
  Lock the revised composer shell, menu chrome, and control styling contract.
- `src/features/app/ChatComposerPanel.tsx`
  Preserve existing chat wiring while placing the revised composer in the new bottom anchor.
- `src/features/app/ChatComposerPanel.test.tsx`
  Lock the integration contract for the updated composer shell.

## Guardrails

- Do not change chat session state, streaming behavior, permission handling, attachments, Skills, MCP logic, or provider settings behavior.
- Build on top of the current dirty-worktree changes in `src/features/app/AppView.tsx`, `src/components/Sidebar.tsx`, `src/components/Composer.tsx`, `src/components/chat/conversation-viewport.tsx`, `src/components/chat/message-frame.tsx`, and `src/index.css`; do not revert the user's existing presentational edits.
- Keep `chat`, `agent`, and `settings` views on the same shell system even if the first polish pass only fully refines the chat view.
- Preserve Electron desktop constraints: window drag layer, macOS traffic-light spacing, compact sidebar toggle, file-drag overlay, toast placement, and error banners must remain usable.

### Task 1: Lock the dark-glass shell contract

**Files:**
- Modify: `src/features/app/AppView.test.ts`
- Modify: `src/styles/design-tokens.test.ts`

- [ ] **Step 1: Write the failing tests**

Update `src/features/app/AppView.test.ts` to assert the approved toolbar/landing helper outputs that define the dark-glass chat shell. Extend `src/styles/design-tokens.test.ts` with any new shell token names or values needed by the redesign.

- [ ] **Step 2: Run the shell-focused tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts`
Expected: FAIL because the current helpers and token contract still target the warm Atelier shell.

- [ ] **Step 3: Implement the minimal shell helper and token changes**

Update `src/features/app/AppView.tsx` and `src/styles/design-tokens.css` only enough to satisfy the new helper outputs and token contract.

- [ ] **Step 4: Re-run the shell-focused tests**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts`
Expected: PASS

### Task 2: Repaint the app frame and light toolbar

**Files:**
- Modify: `src/features/app/AppView.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add any missing failing assertions for shell class hooks**

If `AppView.tsx` needs new exported helpers to keep tests stable, add those expectations in `src/features/app/AppView.test.ts` first.

- [ ] **Step 2: Implement the top-level shell rewrite**

Update `src/features/app/AppView.tsx` so the chat landing and active-chat states use the approved dark-glass frame, lighter toolbar rhythm, and preserved floating-sidebar offsets.

- [ ] **Step 3: Repaint the global shell chrome**

Update `src/index.css` with the graphite background, frosted sidebar surface, lighter toolbar glass, and top-level state styling for drag/drop, toast, and error banners.

- [ ] **Step 4: Re-run the shell tests**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts`
Expected: PASS

### Task 3: Rebuild the sidebar into a fixed-nav desktop index

**Files:**
- Modify: `src/components/Sidebar.test.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write failing sidebar tests**

Update `src/components/Sidebar.test.tsx` to assert the minimal brand header, search affordance, fixed primary navigation block, quieter recent-session section, and continued active-session hooks.

- [ ] **Step 2: Run the sidebar test and confirm it fails**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: FAIL because the current sidebar still reflects the warm Atelier presentation.

- [ ] **Step 3: Implement the sidebar presentation rewrite**

Update `src/components/Sidebar.tsx` so the chat sidebar matches the approved frosted desktop layout while preserving current callbacks, editing flows, and context-menu behavior.

- [ ] **Step 4: Re-run the sidebar test**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: PASS

### Task 4: Move the conversation stage and message shells into the dark hierarchy

**Files:**
- Modify: `src/components/chat/conversation-viewport.test.ts`
- Modify: `src/components/chat/conversation-viewport.tsx`
- Modify: `src/components/chat/message-frame.test.tsx`
- Modify: `src/components/chat/message-frame.tsx`

- [ ] **Step 1: Write failing tests for the viewport and message surfaces**

Update the conversation viewport test with the approved stage width and bottom breathing room. Update the message-frame test to assert the darker user bubble shell and steadier assistant response card treatment.

- [ ] **Step 2: Run the conversation-focused tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx`
Expected: FAIL because the current classes still reflect the lighter shell.

- [ ] **Step 3: Implement the conversation surface rewrite**

Update the viewport spacing and message-surface classes only. Keep markdown rendering, action bars, permission handling, and stream behavior untouched.

- [ ] **Step 4: Re-run the conversation-focused tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx`
Expected: PASS

### Task 5: Repaint the minimal composer into the dark-glass tray

**Files:**
- Modify: `src/components/Composer.test.ts`
- Modify: `src/components/Composer.tsx`
- Modify: `src/features/app/ChatComposerPanel.test.tsx`
- Modify: `src/features/app/ChatComposerPanel.tsx`

- [ ] **Step 1: Write failing tests for the dark-glass composer shell**

Update `src/components/Composer.test.ts` and `src/features/app/ChatComposerPanel.test.tsx` to assert the new tray shell, revised control chrome, and bottom-anchor integration.

- [ ] **Step 2: Run the composer-focused tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`
Expected: FAIL because the current minimal composer still reflects the lighter visual treatment.

- [ ] **Step 3: Implement the composer repaint**

Update `src/components/Composer.tsx` and `src/features/app/ChatComposerPanel.tsx` so the minimal composer reads as a dark-glass tray while preserving submit, stop, attachment, model, MCP, and skill behavior.

- [ ] **Step 4: Re-run the composer-focused tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`
Expected: PASS

### Task 6: Regression sweep for the first dark-glass slice

**Files:**
- Verify: `src/features/app/AppView.test.ts`
- Verify: `src/styles/design-tokens.test.ts`
- Verify: `src/components/Sidebar.test.tsx`
- Verify: `src/components/chat/conversation-viewport.test.ts`
- Verify: `src/components/chat/message-frame.test.tsx`
- Verify: `src/components/Composer.test.ts`
- Verify: `src/features/app/ChatComposerPanel.test.tsx`

- [ ] **Step 1: Run the focused regression suite**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Manually inspect the three key product states**

Check:

- Empty chat landing with toolbar and frosted sidebar
- Active conversation with user and assistant messages
- Chat with attachments or generation state and the bottom composer tray

Expected: The app reads as a dark-glass desktop workspace while existing chat functionality remains intact.
