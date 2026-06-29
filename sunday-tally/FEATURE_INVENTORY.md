# Sunday Tally — Core Feature, Pricing & Guardrail Inventory

## System Overview
* **What it is:** Multi-tenant SaaS for churches to log weekly ministry data (attendance, giving, volunteers, custom metrics, spiritual milestones) and view standardized dashboards with week/month/year comparisons.
* **Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + Auth) · Vercel · Stripe · Resend · Anthropic Claude.

---

## 1. Core Platform Architecture & Pricing (Base)
* **Pricing Model:** $22 / month per active location (quantity = server-validated location counts).
* **Multi-Location Hierarchy:** A single main church tenant controls the core metric tree configurations (`What We Track`) and service schedules. Physical locations simply act as UI data-entry split filters and `WHERE` clause database dimensions.
* **Data Aggregation:** Centralized structure ensures automated global rollups and side-by-side campus metric comparisons out of the box without requiring complex custom multi-tenant formula parsing.
* **Core Validation Rules:**
  * **NULL ≠ 0 Rule:** Explicit zero entries and unentered data are treated as distinct database states. Mathematical averages automatically skip blank/null values.
  * **Volunteers:** Category counts are programmatically derived and calculated—totals are never typed manually.
  * **Soft-Delete:** System-wide enforcement; structural elements (campuses, metrics, templates) are never hard-deleted on initial user action.

---

## 2. AI Studio Add-On Matrix (Flat Org-Wide Fee)
The AI Suite combines the natural-language **Widget Builder** (asset generation) and **AI Chat ("Ask")** (ad-hoc querying) into a flat organizational add-on. Rather than multiplying linearly per location, users self-select their needed asset capacity, driving highly predictable, automated upgrade paths.

| AI Add-On Tier | Flat Monthly Price | Dashboard Library Capacity | Core Interactivity Included |
| :--- | :--- | :--- | :--- |
| **Starter AI** | **$29 / mo** | Max **15 Saved Widgets** | Full "Ask" Analytics Chat + Widget Builder |
| **Plus AI** | **$59 / mo** | Max **40 Saved Widgets** | Full "Ask" Analytics Chat + Widget Builder |
| **Pro AI** | **$99 / mo** | Max **120 Saved Widgets** | Full "Ask" Analytics Chat + Widget Builder |

### The "Asset Model" Cost Logic
* **Deterministic Replay:** The Widget Builder translates natural language into a database-stored `WidgetSpec` JSON configuration object. Once saved, these elements render and replay via native database queries with **zero ongoing token or serverless costs**.
* **High-Margin Value Compounding:** AI token usage occurs almost exclusively during creation phases or active chat queries. Ongoing daily dashboard loads operate at a near-100% margin profile, ensuring high-metric multi-site accounts remain deeply profitable.

---

## 3. Tally AI Core Suite & Capabilities
All intelligent features leverage Anthropic Claude integrations, strictly monitored via systemic accounting layers:

| AI Feature | Operational Mechanics | Model Allocation | Budget Bucket |
| :--- | :--- | :--- | :--- |
| **Import — Pattern Reader** | Reads raw CSV/Sheets layouts, infers underlying matrix structure. | Sonnet 4.6 *(Env-overridable)* | `setup` |
| **Import — Decision Maker** | Stage A: Maps source columns to tracking metrics; flags structural conflicts. | Sonnet 4.6 → *Haiku fallback* | `setup` |
| **Onboarding Chat** | Interactive walkthrough clarifying data-mapping refinements. | Haiku 4.5 | `setup` |
| **Analytics Chat ("Ask")** | Natural language ad-hoc querying across core dataset tables; outputs charts. | Sonnet 4.6 → *Haiku fallback* | `analytics` |
| **Widget Builder ("Build")** | Programmatically outputs dashboard UI `WidgetSpec` asset configurations. | Sonnet 4.6 → *Haiku fallback* | `analytics` |

---

## 4. Systemic Guardrails & "Zero-Touch" Support Automation
To protect the solo developer/operator from support debt at scale, the codebase uses automated programmatic boundaries to eliminate human intervention:

### Administrative & Financial Circuit Breakers
* **The Token Overage Brake:** Every single AI transaction logs detailed token usage and real-time financial tracking to `ai_usage_events`.
* **Tenant Lifetime Budgets:** Trial tenants are restricted to a hard-capped allocation ($1.00 setup + $0.50 analytics). Paid tiers feature a background wholesale limit (e.g., $10 raw value allocation for Pro).
* **Runaway Guard:** System handles automated degradation logic, forcing a soft fallback to Haiku before ceiling exhaustion. A hard, un-overrideable system stop triggers instantly at `-$20.00` cumulative overage to kill loops.
* **Tenancy Isolation:** The `churchId` parameter is server-injected strictly via session context headers. Client states or open AI contexts are never trusted to define tenant data boundaries.

### Hard Capacity Enforcement (UI Guardrails)
* **Widget Cap Ceilings (15 / 40 / 120):** When a user attempts to save a widget that crosses their tier limit, the write event is blocked, displaying a clean in-app prompt:
  > *"You've reached your saved widget limit for this tier. To save this new visualization, please remove an unused widget from your library or upgrade your workspace capacity."*
* **The "Factory Pause" UI:** If a tenant exhausts their monthly generative token allowance mid-billing cycle via aggressive chat behavior, dashboards remain fully active. The Widget Builder displays a clean notification:
  > *"Your active dashboards continue to load for free. Your monthly AI generation allowance resets on [Date]. Need to build new models today? Click here to add a booster pack."*

### The "Clean Data" Import Gate — *(Future Add)*
* **Complex Data Mitigation:** High-metric multi-site CSV files represent a primary support risk due to unstructured user formatting.
* **The Validation Shield:** If a tenant attempts a bulk import containing more than 15 columns, and the Stage A mapping engine fails to resolve cleanly, the system bypasses the normal error reporting screen and delivers a structured self-serve prompt:
  > *"You are processing a complex data landscape. To ensure complete dashboard stability, please download our Standard Unified Data Template, match your columns to this format, and re-upload."*

---

## 5. Secondary Utility Costs & Life Cycles
* **Stripe Processing:** Transaction friction modeled at baseline merchant rates of `2.9% + $0.30` per billing event.
* **Resend Transactional Volume:** Governed by 6 explicit, non-customized functional templates (2 Trial Warnings, 3 Structural Archival Alerts, 1 Tokenized User Invitation).
* **Automated System Crons:**
  * `2:00 PM UTC` — Evaluates lifecycle variables and dispatches impending trial-expiration metrics.
  * `8:00 AM UTC` — Processes system tenant states (Trial Expiry → 30-day Blur/Read-Only Grace Period → Soft-Delete State → 60-day Recovery Window → 90-day Hard DB Purge) and dispatches archival alerts.

---

## Note — AI Spend Ratio
Allowed AI wholesale spend will be up to but not exceeding **15% of their monthly AI plan** (Starter ~$4.35, Plus ~$8.85, Pro ~$14.85). Past that ceiling the system soft-falls-back to Haiku rather than cutting the church off; a hard stop only fires at the −$20 cumulative-overage runaway backstop. Trial churches remain bounded by the separate trial buckets ($1.00 setup + $0.50 analytics).
