## Status: Complete
## Version: 1.0
## Pending revisions: none
## Last updated: 2026-04-10

# IRIS Element Map — INVITE_ACCEPT: Invite Acceptance Screen
## Version 1.0 | 2026-04-10

### Screen Purpose
Landing screen when a new team member clicks their invite link.
Password setup for Owner/Admin/Editor.
Automatic session for Viewer (magic link — no password).
Atomic membership creation on acceptance (F8).
Decisions: D-015 · D-047 · D-048 · F8

### Elements

**E1** — Welcome message
- "You've been invited to [Church Name] on Church Analytics."
- Admin/Editor: "Set a password to get started."
- Viewer: "You're all set — no password needed."

**E2** — Password setup [Admin/Editor/Owner only]
- "Choose a password" + confirm field
- Minimum 8 characters

**E3** — Accept button
- Admin/Editor: "Set password and join" → updateUser + INSERT church_memberships
- Viewer: "View dashboard" → INSERT church_memberships → D2

**E4** — Token expired state
- "This invite link has expired."
- "Ask your church admin to send a new invite."
- No self-serve — admin resends from T9

**E5** — Already accepted state
- "You've already joined. Sign in instead." → AUTH

**E6** — Post-acceptance routing
- Owner/Admin/Editor → T1 (Gate 1 runs)
- Viewer → D2

### Role Rules
Unauthenticated — invite token determines role on acceptance

### NOVA Items
| # | Requirement |
|---|---|
| N85 | Token validation: church_invites WHERE token = ? AND accepted_at IS NULL |
| N86 | Atomic (F8): INSERT memberships + UPDATE accepted_at in one transaction |
| N87 | Viewer: magic link already authenticated — just write membership |
| N88 | Token expired: E4 state, no action |
| N89 | Routing: Owner/Admin/Editor → T1, Viewer → D2 |
