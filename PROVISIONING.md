# Provisioning — Church Analytics
Version: 1.2 | 2026-05-29 | Owner: NOVA

---

## Method
Self-serve signup form (V1) — new churches create their own account via the SIGNUP screen.

Provisioning runs automatically on form submit as a server-side atomic transaction.
Manual provisioning (Supabase dashboard) available as a fallback for operator-assisted onboarding.

---

## Trigger
SIGNUP screen submit → server-side provisioning endpoint → redirect to ONBOARDING_CHURCH.
Manual fallback: operator runs Supabase steps below when needed.

---

## Compensation Sequence (D-051)

Supabase Auth createUser operates outside Postgres transactions — true atomicity
is not possible across Auth + database. Instead, each step has explicit cleanup
on failure (compensation pattern). Steps 2–6 use the Supabase service role key
server-side — the new user has no church_memberships row yet, so RLS would block.

```
Step 1: supabase.auth.admin.createUser(email, password, name)
  → fails: return error to user (nothing to clean up)
  → success: user_id captured

Step 2: INSERT churches (name) → church_id
  → fails: auth.admin.deleteUser(user_id) → return error

Step 3: INSERT church_locations (church_id, name = 'Main Campus')
  → fails: DELETE churches WHERE id = church_id
           auth.admin.deleteUser(user_id) → return error

Step 4: seed_system_reporting_tags(church_id)
        → inserts the 4 system reporting tags (ATTENDANCE, VOLUNTEERS,
          GIVING, RESPONSE_STAT). Ministry tags are NOT seeded here —
          they are created later during service setup / import.
  → fails: DELETE churches WHERE id = church_id (cascades locations + seeds)
           auth.admin.deleteUser(user_id) → return error

Step 5: INSERT church_memberships (user_id, church_id, role = 'owner')
  → fails: DELETE churches WHERE id = church_id (cascades)
           auth.admin.deleteUser(user_id) → return error

Step 6: Send welcome email (non-critical — log failure, do not rollback)

→ Set session → redirect to /onboarding/church
```

**Service role key** (steps 1–5): Supabase Admin client, server-side only.
Never expose service role key to the client. Route all provisioning through
a Next.js API route or Supabase Edge Function.

---

## Rollback Behaviour (Compensation)
Each step failure triggers cleanup of all prior steps in reverse order.
A church with missing seed data is broken — the onboarding assumes defaults exist.
Partial state is never acceptable. Clean up completely before returning any error to the user.

---

## Seed Functions
All defined in migrations. All idempotent — safe to run twice (ON CONFLICT DO NOTHING).

| Function | Migration | Creates |
|---|---|---|
| `seed_system_reporting_tags(church_id)` | 0024 | 4 system reporting tags: ATTENDANCE · VOLUNTEERS · GIVING · RESPONSE_STAT |

Ministry tags (`service_tags`: `code`, `name`, `parent_tag_id`, `tag_role`)
are NOT seeded at signup — they are created later during service setup / import.
The former `response_categories`, `giving_sources`, and `volunteer_categories`
tables (and their `seed_default_*` functions) have been dropped in the schema
redesign and are no longer provisioned.

---

## Manual Steps (V1 operator procedure)

**Before running the sequence — create the Supabase Auth user:**

1. Go to Supabase dashboard → Authentication → Users
2. Click "Invite user" — enter the Owner's email address
3. Supabase sends a magic link to the Owner's email
4. Copy the new user's UUID — this is `$owner_user_id`

**Run the provisioning sequence:**

5. Go to Supabase dashboard → SQL Editor
6. Run the atomic sequence above with:
   - `$church_name` = the church's name
   - `$owner_user_id` = the UUID from Step 4
7. Verify the transaction committed — check the `churches` table for the new row

**Verify provisioning:**

8. Check `church_locations` — one row with `church_id` matching the new church
9. Check `service_tags` — four system reporting tags (ATTENDANCE, VOLUNTEERS, GIVING, RESPONSE_STAT) for this church; no ministry tags yet
10. Check `church_memberships` — one row with role = 'owner' for this church

---

## Post-Provisioning State

What a newly provisioned church looks like on first login:

**Exists:**
- One church record
- One location ("Main Campus")
- Four system reporting tags (ATTENDANCE · VOLUNTEERS · GIVING · RESPONSE_STAT)
- One Owner membership

**Empty (owner sets up during onboarding):**
- No ministry tags — created during service setup / import
- No service templates — owner creates in T6
- No schedules — owner creates in T-sched
- No occurrences — generated when Sunday loop runs

**Owner's first screen:**
Gate 1 fires immediately — no location with primary-tagged service exists yet.
Owner is routed to onboarding Step 1 (church info) → T-loc → T6 → T-sched → T9 → T1.

---

## V2 Payment Gate
When revenue model requires a payment gate before provisioning:
- Add Stripe checkout between SIGNUP and provisioning endpoint
- Stripe webhook triggers provisioning on payment success
- SIGNUP_CONFIRM screen added if email verification required
