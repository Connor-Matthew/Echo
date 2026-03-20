# Echo Main Screen Atelier Lite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the chat home screen into the approved `Atelier Lite` direction without changing Echo's existing chat, streaming, attachment, MCP, or skills behavior.

**Architecture:** Keep the current `Sidebar + ChatView + Composer` structure and move the redesign through presentational layers first. The first slice updates shared tokens, shell spacing, message surfaces, and composer chrome, while intentionally deferring any data-heavy right-side context dock until there is a real state source for it.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, CSS design tokens, Bun test, `node:test`

---

## File Map

- `src/styles/design-tokens.css`
  Own the new `Atelier Lite` shell, spacing, surface, and radius variables.
- `src/styles/design-tokens.test.ts`
  Lock the token values that define the new shell proportions and reading density.
- `src/index.css`
  Apply the new shell, conversation stage, sidebar, and composer surface styling.
- `src/features/app/AppView.tsx`
  Keep the top-level layout wiring, landing state, and composer positioning aligned with the new stage.
- `src/features/app/AppView.test.ts`
  Lock helper classes used by the landing state and top-level chat shell.
- `src/components/Sidebar.tsx`
  Convert the left rail into a quieter work index with lighter grouping and less card weight.
- `src/components/Sidebar.test.tsx`
  Keep the sidebar shell and active-item hooks stable during the visual rewrite.
- `src/components/chat/conversation-viewport.tsx`
  Define the central reading stage spacing and bottom breathing room.
- `src/components/chat/conversation-viewport.test.ts`
  Lock the conversation viewport spacing contract.
- `src/components/chat/message-frame.tsx`
  Redraw user and assistant message shells without touching markdown AST or streaming logic.
- `src/components/chat/message-frame.test.tsx`
  Keep the message surface classes and rendering hooks stable.
- `src/components/Composer.tsx`
  Turn the minimal chat composer into the `Composer Hero` shell for the new home screen.
- `src/components/Composer.test.ts`
  Lock the hero shell classes and minimal mode behavior.
- `src/components/AttachmentTray.tsx`
  Align attachment chips with the new composer surface.
- `src/components/AttachmentTray.test.ts`
  Keep the tray spacing and chip styling stable.
- `src/features/app/ChatComposerPanel.tsx`
  Preserve the existing chat integration while adopting the new composer presentation.
- `src/features/app/ChatComposerPanel.test.tsx`
  Lock the integration contract between the chat panel and the updated composer.

## Guardrails

- Do not change chat session state, streaming behavior, attachments, MCP wiring, skill application, or SOUL mode logic in this slice.
- Do not touch `src/components/chat/message-block-renderer.tsx` unless a strictly presentational wrapper is impossible; that file is already dirty in the current worktree.
- Do not introduce a permanent right-side context dock yet. The first implementation slice should leave room for it in layout decisions, but not ship a fake panel without real product state.

### Task 1: Lock the Atelier Lite shell contract in tests

**Files:**
- Modify: `src/styles/design-tokens.test.ts`
- Modify: `src/features/app/AppView.test.ts`
- Modify: `src/components/chat/conversation-viewport.test.ts`

- [ ] **Step 1: Add failing assertions for the new shell proportions**

Update the token test to assert the new shell radius and wider conversation stage. Update the `AppView` helper tests to lock the landing composer and heading classes expected by `Atelier Lite`. Update the conversation viewport test to assert a wider, calmer reading stage with larger bottom breathing room.

- [ ] **Step 2: Run the focused tests and confirm they fail first**

Run: `bun test /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts`

Expected: FAIL because the current helpers and token values still reflect the older paper-console spacing.

### Task 2: Update global tokens and the app shell

**Files:**
- Modify: `src/styles/design-tokens.css`
- Modify: `src/index.css`
- Modify: `src/features/app/AppView.tsx`

- [ ] **Step 1: Update the design tokens for the new shell**

Adjust the shell radius, conversation width, assistant reading width, and surface alpha values to support a warmer, softer `Atelier Lite` stage. Keep the existing token naming style so the rest of the app can adopt the new values incrementally.

- [ ] **Step 2: Repaint the shell chrome without changing layout ownership**

Update the shell-level CSS in `src/index.css` so the app frame, sidebar panel, conversation stage, and landing title move from the older paper-console look toward the warmer editorial look approved in the design doc. Keep the same top-level layout wiring in `AppView.tsx`, but tighten the landing state and composer placement around the new reading stage widths.

- [ ] **Step 3: Re-run the shell tests**

Run: `bun test /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts`

Expected: PASS

### Task 3: Quiet the sidebar into a work index

**Files:**
- Modify: `src/components/Sidebar.test.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add failing sidebar assertions**

Extend the existing sidebar tests to assert the lighter header rhythm, quieter section spacing, and lower-weight recent-project/session surfaces expected by `Atelier Lite`. Keep the existing active-item hooks (`session-list-item-button-active`, etc.) in the test coverage.

- [ ] **Step 2: Run the sidebar tests and confirm the visual contract is not implemented yet**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`

Expected: FAIL because the sidebar still uses the current denser shell and section treatment.

- [ ] **Step 3: Implement the minimal sidebar rewrite**

Update `Sidebar.tsx` so the brand block, `New Chat`, section labels, and recent/session items feel quieter and more editorial. Preserve all existing callbacks, context menus, and mode switching behavior.

- [ ] **Step 4: Re-run the sidebar tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`

Expected: PASS

### Task 4: Rebuild the central conversation stage and message shells

**Files:**
- Modify: `src/components/chat/conversation-viewport.test.ts`
- Modify: `src/components/chat/conversation-viewport.tsx`
- Modify: `src/components/chat/message-frame.test.tsx`
- Modify: `src/components/chat/message-frame.tsx`

- [ ] **Step 1: Add failing tests for the new reading stage and message surfaces**

Extend `conversation-viewport.test.ts` to lock the wider stage padding and deeper bottom breathing room needed for the fixed hero composer. Extend `message-frame.test.tsx` to assert the larger assistant card shell, the more editorial user bubble spacing, and the continued absence of a user avatar badge.

- [ ] **Step 2: Run the conversation tests and confirm the current classes fail**

Run: `bun test /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx`

Expected: FAIL because the message shell classes still reflect the current compact paper-console treatment.

- [ ] **Step 3: Implement the visual shell rewrite only**

In `conversation-viewport.tsx`, update the stage spacing and bottom padding to leave room for the fixed composer hero. In `message-frame.tsx`, change only the surface and spacing classes for user and assistant messages so the assistant response reads like the new editorial card while the existing AST, action bar, tool panels, and stream rendering remain intact.

- [ ] **Step 4: Re-run the conversation tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx`

Expected: PASS

### Task 5: Upgrade the composer into the home-screen hero

**Files:**
- Modify: `src/components/Composer.test.ts`
- Modify: `src/components/Composer.tsx`
- Modify: `src/components/AttachmentTray.test.ts`
- Modify: `src/components/AttachmentTray.tsx`
- Modify: `src/features/app/ChatComposerPanel.test.tsx`
- Modify: `src/features/app/ChatComposerPanel.tsx`

- [ ] **Step 1: Add failing tests for the composer hero shell**

Update the composer tests to assert a softer hero radius, warmer shell classes, and a footer rhythm that still works in minimal mode. Update the attachment tray test to assert that attachment chips visually merge with the hero composer instead of reading like separate utility pills. Update `ChatComposerPanel.test.tsx` to keep `minimalControls` on while locking the new shell integration.

- [ ] **Step 2: Run the composer-focused tests and confirm they fail**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/components/AttachmentTray.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`

Expected: FAIL because the current composer still uses the flatter compact shell.

- [ ] **Step 3: Implement the composer hero presentation**

Update `Composer.tsx` so minimal mode becomes the `Atelier Lite` hero shell: larger radius, softer highlight ring, warmer surface contrast, and tighter grouping of controls around the textarea. Update `AttachmentTray.tsx` and `ChatComposerPanel.tsx` only as needed to visually dock attachments above the hero shell while preserving all current behavior.

- [ ] **Step 4: Re-run the composer-focused tests**

Run: `bun test /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/components/AttachmentTray.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`

Expected: PASS

### Task 6: Final regression sweep for the first Atelier Lite slice

**Files:**
- Verify: `src/styles/design-tokens.test.ts`
- Verify: `src/features/app/AppView.test.ts`
- Verify: `src/components/Sidebar.test.tsx`
- Verify: `src/components/chat/conversation-viewport.test.ts`
- Verify: `src/components/chat/message-frame.test.tsx`
- Verify: `src/components/Composer.test.ts`
- Verify: `src/components/AttachmentTray.test.ts`
- Verify: `src/features/app/ChatComposerPanel.test.tsx`

- [ ] **Step 1: Run the full focused suite**

Run: `bun test /Users/mac/Desktop/Echo/src/styles/design-tokens.test.ts /Users/mac/Desktop/Echo/src/features/app/AppView.test.ts /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx /Users/mac/Desktop/Echo/src/components/chat/conversation-viewport.test.ts /Users/mac/Desktop/Echo/src/components/chat/message-frame.test.tsx /Users/mac/Desktop/Echo/src/components/Composer.test.ts /Users/mac/Desktop/Echo/src/components/AttachmentTray.test.ts /Users/mac/Desktop/Echo/src/features/app/ChatComposerPanel.test.tsx`

Expected: PASS

- [ ] **Step 2: Run typecheck before handing off**

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 3: Manually verify the three critical product states**

Check in the app:

- Empty chat landing state
- Active conversation with long assistant content
- Chat with attachments plus minimal-mode composer controls

Expected: The shell feels warmer and more editorial, while all existing chat behaviors still work as before.
