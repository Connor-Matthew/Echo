# Sidebar Scrollbar Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the chat and agent sidebar scrollbars closer to the right edge without changing the global scrollbar appearance.

**Architecture:** Keep `echo-scrollbar-minimal` untouched and instead change the sidebar list layout so only the header keeps right padding. This localizes the visual adjustment to the two left-side session lists.

**Tech Stack:** React, TypeScript, Tailwind utility classes, Bun test

---

### Task 1: Lock the intended layout in tests

**Files:**
- Modify: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write a failing test**
Add assertions for asymmetric sidebar list padding in chat mode and add an agent-mode coverage test for the same layout.

- [ ] **Step 2: Run test to verify it fails**
Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: FAIL because the sidebar still uses symmetric `px-3` spacing around the scroll area.

### Task 2: Apply the minimal sidebar spacing change

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write minimal implementation**
Change the chat and agent sidebar content wrappers from symmetric horizontal padding to left-only padding, and give the header row its own right padding.

- [ ] **Step 2: Run tests to verify it passes**
Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: PASS

### Task 3: Verify no nearby regressions

**Files:**
- Verify: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Run related tests**
Run: `bun test /Users/mac/Desktop/Echo/src/components/Sidebar.test.tsx`
Expected: PASS with all sidebar assertions green.
