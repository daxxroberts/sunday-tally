# IRIS Element Map — T9: Invite + Onboard
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Invite team members to the church.
Two contexts: onboarding Step 5, and Settings → Your Team.
D-015: Viewers get magic links. Editors/Admins get password setup invite.
D-023: Admin invites Editor/Viewer only. Owner invites any role.
D-047: Viewer sessions long-lived — no expiry.
D-048: Viewer self-serves re-auth via email — no admin action.
F8: Atomic acceptance — membership created only on invite acceptance.

### Data Sources
| Data | Source |
|---|---|
| Pending invites | church_invites WHERE church_id = ? AND accepted_at IS NULL |
| Current members | church_memberships JOIN user_profiles |

### Screen States
1. Onboarding — Step 5 of 5, skip option available
2. Settings — full member management (members + pending + invite form)

### Elements

**E1** — Header
- Onboarding: "Step 5 of 5 — Your team"
- Settings: "Team"

**E2** — Current Members [Settings only]
- Name · Role badge · Remove action
- Remove confirmation: "Remove [name] from your church? They'll lose access immediately."
- Last Owner protection: blocked if only one Owner (N65)

**E3** — Pending Invites [Settings only]
- Email · Role · Resend · Cancel
- Resend: DELETE old row, INSERT new with fresh token (N66)
- Cancel: DELETE invite row

**E4** — Invite Form
- **E4a** — Email: "Who do you want to invite?"
- **E4b** — Role picker (scoped by inviter role — D-023)
  - Owner sees: Admin · Editor · Viewer
  - Admin sees: Editor · Viewer only
  - Helper text:
    - Admin: "Can enter data and view reports. Can invite Editors and Viewers."
    - Editor: "Can enter Sunday data only — no reports."
    - Viewer: "Can view reports only. Gets a magic link — no password needed."
- **E4c** — Send: "Send invite — they'll get an email with instructions."
  - INSERT church_invites → send email
  - Viewer: magic link via signInWithOtp (D-015)
  - Editor/Admin: inviteUserByEmail (password setup)

**E5** — Sent Confirmation [inline, form resets]
- "Invite sent to [email]. They'll get an email shortly."
- Allows rapid multi-invite

**E6** — Skip [Onboarding]
- "Skip for now — you can invite your team from Settings anytime."
- → T1

**E7** — Done [Onboarding, after ≥1 invite sent]
- "Done — let's see your services." → T1

**E8** — Viewer Re-auth Note [on pending Viewer invite in E3]
- "Viewers can request a new link anytime by entering their email on the login screen."

### Invite Flow — F8 Atomic Acceptance
```
Send: INSERT church_invites (token, email, role, church_id) → email sent
Accept: validate token → INSERT church_memberships → UPDATE accepted_at
        → redirect: T1 (Editor/Admin) or D2 (Viewer)
```
Membership created ONLY on acceptance. Pending invite = no membership row.

### Viewer Session Model
- Long-lived sessions (D-047) — no expiry until removed
- Re-auth (D-048): Viewer enters email on login screen → new magic link → session restored
- No admin action needed for re-auth

### Role Rules
| Action | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| Remove member | ✅ any role | ✅ Editor/Viewer only | ❌ | ❌ |
| Send invite | ✅ any role | ✅ Editor/Viewer only | ❌ | ❌ |

### NOVA Items
| # | Requirement |
|---|---|
| N60 | Token: crypto.randomBytes(32).toString('hex') — D-009 |
| N61 | Viewer: signInWithOtp. Editor/Admin: inviteUserByEmail |
| N62 | Atomic acceptance: INSERT memberships only on token validation |
| N63 | Session config: maximum Supabase refresh token duration for Viewer |
| N64 | Remove: DELETE memberships + revoke active sessions for this church |
| N65 | Last Owner protection: block removal if only one Owner |
| N66 | Resend: DELETE old invite, INSERT new with fresh token |
