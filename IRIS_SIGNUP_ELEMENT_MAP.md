## Status: Complete
## Version: 1.0
## Pending revisions: none
## Last updated: 2026-04-10

# IRIS Element Map — SIGNUP: New Church Registration
## Version 1.0 | 2026-04-10

### Screen Purpose
Brand new church creates their account.
Minimum fields: church name, owner name, email, password.
Runs atomic provisioning sequence on submit.
Routes to ONBOARDING_CHURCH on success.
Sits before AUTH (existing churches) and ONBOARDING_CHURCH (Step 1).

### Data Written
churches · church_locations · service_tags · response_categories ·
giving_sources · church_memberships · Supabase Auth user

### Elements

**E1** — Header
- "Set up your church"
- "Get your team tracking in minutes."

**E2** — Church name: "What's your church called?"
- Placeholder: "Grace Community Church"
- Required → churches.name

**E3** — Owner name: "Your name"
- Placeholder: "Sarah Johnson"
- Required → Supabase user profile

**E4** — Email: "Your email address"
- Required → Supabase Auth email
- Inline validation: valid format

**E5** — Password: "Choose a password"
- Minimum 8 characters
- Show/hide toggle

**E6** — Submit: "Create my church →"
- Active when E2+E3+E4+E5 valid
- → provisioning sequence → ONBOARDING_CHURCH

**E7** — Loading state
- "Setting up your church..." + spinner
- Blocks double-submit

**E8** — Error states
- Email taken: "That email already has an account. Sign in instead." → AUTH
- Weak password: "Password must be at least 8 characters."
- Network failure: "Something went wrong. Try again."

**E9** — Already have account [low prominence, bottom]
- "Already set up? Sign in →" → AUTH

### Provisioning Sequence (atomic — full rollback on failure)
1. createUser(email, password, name) → user_id
2. INSERT churches (name) → church_id
3. INSERT church_locations (church_id, name = "Main Campus")
4. seed_default_service_tags(church_id)
5. seed_default_stat_categories(church_id)
6. seed_default_giving_sources(church_id)
7. INSERT church_memberships (user_id, church_id, role = 'owner')
→ Set session → redirect to /onboarding/church

### Role Rules
Unauthenticated — creates Owner account

### NOVA Items
| # | Requirement |
|---|---|
| N90 | Supabase createUser → returns user_id for membership insert |
| N91 | Atomic provisioning: all inserts + seed functions in one transaction. Full rollback on failure. |
| N92 | Email duplicate: catch Supabase auth error → show E8 inline |
| N93 | E7 loading: disable submit during provisioning, prevent double-submit |
| N94 | On success: set session + redirect to /onboarding/church |
| N95 | ONBOARDING_CHURCH receives church_id from session — no URL param needed |
