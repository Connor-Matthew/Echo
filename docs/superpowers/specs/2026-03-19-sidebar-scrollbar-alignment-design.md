# Sidebar Scrollbar Alignment Design

**Goal:** Make the left sidebar session lists show their vertical scrollbar closer to the panel's right edge, matching the chat conversation viewport more closely.

**Scope:**
- Chat sidebar session list
- Agent sidebar session list
- No global scrollbar skin changes
- No list item restyling beyond spacing needed to move the scrollbar track

**Design:**
- Keep the shared `echo-scrollbar-minimal` scrollbar styling unchanged.
- Adjust the sidebar list section layout so the scrollable container no longer inherits the extra right padding that pushes the scrollbar inward.
- Preserve the existing breathing room for the section header row by keeping header-specific horizontal padding.

**Implementation Notes:**
- Modify the shared list-section wrapper in both chat and agent sidebar branches.
- Update sidebar tests to assert the new asymmetric padding layout and cover both chat and agent modes.

**Risks:**
- Session cards will sit slightly closer to the scrollbar track.
- Any test that snapshots the previous symmetric padding will need to be updated.
