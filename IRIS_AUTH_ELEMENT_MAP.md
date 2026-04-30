## Status: Complete
## Version: 1.0
## Pending revisions: none
## Last updated: 2026-04-10

# IRIS Element Map — AUTH: Login Screen
## Version 1.0 | 2026-04-10

### Screen Purpose
Entry point for all returning users.
Password path: Owner/Admin/Editor.
Magic link path: Viewer (default) + optional for others.
Re-auth path for Viewers whose session lapsed (D-048).
Decisions: D-015 · D-047 · D-048

### Elements

**E1** — Product name + value prop
- "Church Analytics"
- "Track what matters. See what's growing."

**E2** — Email field: "Your email address"

**E3** — Password field [Owner/Admin/Editor default]
- "Your password"
- "Sign in with a link instead" toggle → E4 path

**E4** — Magic link path [Viewer default]
- "Send me a link" → signInWithOtp (D-015)
- Confirmation: "Check your email — we sent a link to [email]"
- Resend after 60 seconds

**E5** — Sign In button [password path]
- → signInWithPassword → role check → route

**E6** — Post-login routing
- Owner/Admin: Gate 1 → onboarding or T1
- Editor: Gate 2 → T1 or empty state
- Viewer: → D2 (Gate 3)

**E7** — Error states
- Wrong password: "That email and password don't match. Try again."
- No account: "We don't recognise that email. Check with your church admin."
- Network failure: "Something went wrong. Check your connection and try again."

**E8** — Viewer re-auth note [bottom, low prominence]
- "Looking for your dashboard link? Enter your email above and we'll send you a new one."
- Implements D-048 — self-serve, no admin action needed

### Role Rules
All roles — unauthenticated entry point

### NOVA Items
| # | Requirement |
|---|---|
| N80 | Password: signInWithPassword. Magic link: signInWithOtp (D-015) |
| N81 | Post-login: read church_memberships.role → route accordingly |
| N82 | Viewer re-auth: signInWithOtp — membership exists, restores session (D-048) |
| N83 | Magic link confirmation: inline state, not new page |
| N84 | Resend throttle: disable for 60 seconds after send |
