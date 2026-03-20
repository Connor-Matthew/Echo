# Echo Chat Home High Fidelity Atelier Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Echo's chat home screen into a high-fidelity Atelier-style workspace that closely matches the approved reference while preserving existing chat behavior.

**Architecture:** Keep the current `Sidebar + AppView + ChatView + Composer` product wiring intact and move the redesign through presentational layers. The implementation starts with shell-level layout contracts and then updates the sidebar, conversation stage, message shells, and hero composer so the empty state and real chat state stay visually coherent.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, CSS design tokens, Bun test, `node:test`

---

## File Map

- `docs/superpowers/specs/2026-03-20-echo-chat-home-high-fidelity-atelier-design.md`
  Approved design spec that defines the visual target and non-goals.
- `src/features/app/AppView.tsx`
  Own the chat-page shell helpers, landing copy, top navigation scaffold, and composer placement.
- `src/features/app/AppView.test.ts`
  Lock top-level layout helper classes, landing copy, and high-fidelity shell hooks.
- `src/styles/design-tokens.css`
  Own shell spacing, surface alpha, stage width, and radius tokens used across the redesign.
- `src/styles/design-tokens.test.ts`
  Lock the token contract for the new shell.
- `src/index.css`
  Paint the new warm shell background, top navigation chrome, sidebar surface, and stage textures.
- `src/components/Sidebar.tsx`
  Rebuild the chat sidebar into the lighter work-index layout from the approved design.
- `src/components/Sidebar.test.tsx`
  Lock the new branded header, primary nav items, and quieter session index shell.
- `src/components/chat/conversation-viewport.tsx`
  Define the wider reading stage and extra bottom breathing room for the hero composer.
- `src/components/chat/conversation-viewport.test.ts`
  Lock the new reading-stage spacing contract.
- `src/components/chat/message-frame.tsx`
  Update user and assistant message shells to match the editorial stage.
- `src/components/chat/message-frame.test.tsx`
  Lock the message surface classes and confirm the streamlined shell behavior.
- `src/components/Composer.tsx`
  Turn minimal mode into the long pill-shaped hero composer that anchors the chat page.
- `src/components/Composer.test.ts`
  Lock the new hero shell, utility controls, and menu chrome.
- `src/components/AttachmentTray.tsx`
  Dock attachment chips to the hero composer.
- `src/components/AttachmentTray.test.ts`
  Lock the new attachment dock classes.
- `src/features/app/ChatComposerPanel.tsx`
  Keep current chat wiring while placing the hero composer in the new layout.
- `src/features/app/ChatComposerPanel.test.tsx`
  Lock the integration contract for the revised hero composer shell.

## Guardrails

- Do not change chat session state, streaming behavior, permission handling, attachments, Skills, MCP logic, or provider settings behavior.
- Do not revert or overwrite existing unrelated worktree changes in `src/components/Sidebar.tsx`, `src/components/Sidebar.test.tsx`, `src/index.css`, `src/components/chat/message-markdown-content.tsx`, `src/components/chat/message-markdown-content.test.tsx`, or `src/index.test.ts`.
- Keep new top navigation behavior light in the first slice: it should establish the high-fidelity layout without inventing new product flows.

### Task 1: Lock the top-level Atelier shell contract

**Files:**
- Modify: `src/features/app/AppView.test.ts`
- Modify: `src/styles/design-tokens.test.ts`

- [ ] **Step 1: Write failing tests for the new shell helpers**

Add assertions for the higher-fidelity landing copy, wider shell class hooks, and any new top-navigation helper classes exposed from `AppView.tsx`. Extend the token test with the shell radius and stage-width values needed by the redesign.

- [ ] **Step 2: Run the focused shell tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts`
Expected: FAIL because the current helper outputs still reflect the older atelier-lite shell.

- [ ] **Step 3: Implement the minimal shell helper updates**

Update `src/features/app/AppView.tsx` and `src/styles/design-tokens.css` only enough to satisfy the new helper contracts, without touching unrelated layout code yet.

- [ ] **Step 4: Re-run the focused shell tests**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts`
Expected: PASS

### Task 2: Rebuild the app frame and top navigation

**Files:**
- Modify: `src/features/app/AppView.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add a failing assertion for the top-nav shell if needed**

If helper extraction is needed to test the top navigation structure safely, add it first in `src/features/app/AppView.test.ts`.

- [ ] **Step 2: Implement the shell layout rewrite**

Update `AppView.tsx` so the chat page gains the new top navigation, search shell, centered reading stage, and bottom-anchored hero-composer layout while preserving current view switching and existing callbacks.

- [ ] **Step 3: Repaint the global shell chrome**

Update `src/index.css` with the warm paper background, calmer panel surfaces, and new top-nav/sidebar shell styles required by the approved design.

- [ ] **Step 4: Re-run the shell tests**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts`
Expected: PASS

### Task 3: Rewrite the sidebar into the approved work index

**Files:**
- Modify: `src/components/Sidebar.test.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write failing sidebar assertions**

Update the sidebar tests to assert the refined brand block, the `History / Prompts / Library / Settings` rhythm, the quieter session section, and the continued presence of active session hooks.

- [ ] **Step 2: Run the sidebar test and confirm it fails**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: FAIL because the current sidebar still uses the denser utility layout.

- [ ] **Step 3: Implement the sidebar presentation rewrite**

Update `Sidebar.tsx` so the chat sidebar looks like the approved high-fidelity reference while preserving current callbacks, session editing, and context menus.

- [ ] **Step 4: Re-run the sidebar test**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: PASS

### Task 4: Rebuild the conversation stage and message shells

**Files:**
- Modify: `src/components/chat/conversation-viewport.test.ts`
- Modify: `src/components/chat/conversation-viewport.tsx`
- Modify: `src/components/chat/message-frame.test.tsx`
- Modify: `src/components/chat/message-frame.tsx`

- [ ] **Step 1: Write failing tests for the reading stage and message surfaces**

Update the conversation viewport test with the wider stage spacing and deeper bottom padding needed by the new hero composer. Update the message-frame test to assert the warmer user bubble shell and softer assistant editorial card shell.

- [ ] **Step 2: Run the conversation-focused tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx`
Expected: FAIL because the current classes still target the previous layout.

- [ ] **Step 3: Implement the visual conversation rewrite**

Update the viewport spacing and message surface classes only. Keep markdown rendering, action bar behavior, permission handling, and stream behavior untouched.

- [ ] **Step 4: Re-run the conversation-focused tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx`
Expected: PASS

### Task 5: Upgrade minimal composer mode into the hero input bar

**Files:**
- Modify: `src/components/Composer.test.ts`
- Modify: `src/components/Composer.tsx`
- Modify: `src/components/AttachmentTray.test.ts`
- Modify: `src/components/AttachmentTray.tsx`
- Modify: `src/features/app/ChatComposerPanel.test.tsx`
- Modify: `src/features/app/ChatComposerPanel.tsx`

- [ ] **Step 1: Write failing tests for the hero composer shell**

Update composer tests to assert the longer pill shell, refined minimal control styling, and higher-fidelity tool menu chrome. Update the attachment tray and panel integration tests to lock the docked attachment treatment and minimal composer placement.

- [ ] **Step 2: Run the composer-focused tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/components/AttachmentTray.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`
Expected: FAIL because the current minimal composer still uses the flatter atelier-lite shell.

- [ ] **Step 3: Implement the hero composer presentation**

Update `Composer.tsx`, `AttachmentTray.tsx`, and `ChatComposerPanel.tsx` so the minimal chat composer becomes the approved bottom anchor without changing submit, attachment, model, MCP, or skill behavior.

- [ ] **Step 4: Re-run the composer-focused tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/components/AttachmentTray.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`
Expected: PASS

### Task 6: Regression sweep for the first high-fidelity slice

**Files:**
- Verify: `src/features/app/AppView.test.ts`
- Verify: `src/styles/design-tokens.test.ts`
- Verify: `src/components/Sidebar.test.tsx`
- Verify: `src/components/chat/conversation-viewport.test.ts`
- Verify: `src/components/chat/message-frame.test.tsx`
- Verify: `src/components/Composer.test.ts`
- Verify: `src/components/AttachmentTray.test.ts`
- Verify: `src/features/app/ChatComposerPanel.test.tsx`

- [ ] **Step 1: Run the full focused suite**

Run: `bun test /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/components/AttachmentTray.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Manually inspect the three key product states**

Check:

- Empty chat home with top navigation
- Active conversation with user and assistant messages
- Chat with attachments and the hero composer

Expected: The chat page reads as a high-fidelity Atelier workspace while existing chat behavior remains intact.
