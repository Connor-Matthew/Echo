# Agent Permission Policy

## Scope
- Project root: `/Users/mac/Desktop/Echo`

## Required Approval Before Out-of-Project Access
- For any action that touches paths outside the project root, request user approval first.
- This includes read-only actions (for example: `ls`, `cat`, `find`, `rg` on external paths), not only write actions.
- Use escalated execution with a clear `justification` so the user gets an approval prompt.
- Do not access out-of-project paths directly without this prompt.

## Preferred Workflow
1. Confirm whether the target path is inside `/Users/mac/Desktop/Echo`.
2. If outside, trigger an approval request first.
3. Run only the approved command scope after approval.
