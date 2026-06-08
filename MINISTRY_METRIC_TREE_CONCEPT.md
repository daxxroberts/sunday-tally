# SundayTally — Ministry / Metric Tree Model (Concept Spec)

Status: **CONCEPT — agreed in BOT review 2026-06-07. No code written.** Handoff doc for whichever chat builds it.
Owner voices: PRODUCT (UX) · STRUCTURE/SCHEMA (data) · VERA (simplicity) · SAGE (gate). Pressure-tested by AXIOM + STEEL.

> Goal: make service/ministry/metric setup an **easy UI for non-technical church admins**. One tree. Plain words. No migration — it sits on the tables we already have.

---

## 1. The big idea — one tree
Everything a church tracks is **one tree**. Branches are groupings; **leaves are the numbers you count.**

```
🏛 Church
└─ Ministry / Group            ← a node you can nest (drag under another)
     └─ Kind (1 of 4 fixed)    ← Attendance · Volunteers · Giving · Stats
          └─ Count (leaf)      ← the actual number: "Band", "Adult Attendance", "Baptisms"
```

- **Upper zone (Ministries/Groups):** free hierarchy. Nest by dragging (Tabors under Life Groups).
- **Lower zone (per node):** pick a **Kind** (you don't invent it — pick from the 4), then add **Counts** under it.

---

## 2. Vocabulary (plain word ↔ what it really is)

| Plain word (UI) | Means | Stored as |
|---|---|---|
| **Ministry** / **Group** (same thing) | who you track, nestable | `service_tags` row (nest via `parent_tag_id`) |
| **Kind** | the *type* of number (carries the math) | `reporting_tags` — the 4 system ones |
| **Count** | a single number you write down | `metrics` row (leaf) |
| **Service** | a gathering that meets at a time | `service_templates` (+ `service_schedule_versions` = when) |
| **Occurrence** | one dated instance of a service | `service_instances` |

**Only two tables make the tree:** `service_tags` (branches) + `metrics` (leaves). "Add a ministry/group/sub-tag" all run the **same** `service_tags` insert — the word on the button is the only difference. The word **"sub-tag" is retired** (it was overloaded for two different jobs and caused the confusion).

**The 4 Kinds are fixed on purpose:** Attendance / Volunteers / Giving / Stats. The Kind is *where the dashboard math lives* (count people vs. format dollars vs. compute ratios), so a Count must belong to one of the 4 — you don't free-type the Kind. "Band" is a Count **of Kind Volunteers.**

**Decision rule for the Builder:** *if you want to track it separately, give it its own node (ministry/group). If it's just another number of the same kind, it's a Count under that Kind.*

---

## 3. Two ways to log (this is the Life Groups + Giving answer)

| Mode | When you log | Stored as | Examples |
|---|---|---|---|
| **Per-service** | against a dated occurrence | `metrics.scope = 'instance'` | Sunday attendance, Wednesday Switch |
| **Weekly** | once for the week, no service time | `metrics.scope = 'period'` | **Giving**, **Life Groups** |

**Giving and Life Groups are the same shape** — weekly, no service occurrence. They live in a **"Weekly" section** of entry, separate from the timed services. (This is the missing bucket today.)

---

## 4. Worked example — the demo church in this model

```
🏛 Demo Church
│
├─ 🗓 SERVICES  (log against the date they meet)
│   ├─ First Experience  · Sun 9:00  ─┐ both count:
│   ├─ Second Experience · Sun 10:30 ─┘   👤 Experience (Adults) · 🧒 LifeKids (Kids)
│   └─ Switch · (its day)              →   🎓 Switch (Youth)
│
└─ 📅 WEEKLY  (log once per week, no service)
    ├─ 💵 Giving                       → one number
    └─ 🏠 Life Groups (ministry/category)
         ├─ Tabors      → Attendance · Volunteers · Decisions
         ├─ (＋ add group)
         └─ …

   Each ministry expands into Kinds → Counts, e.g.:
   👤 Experience
     ├─ Attendance → Adult Attendance
     ├─ Volunteers → Band ★ · Host · Operations · Other
     └─ Stats      → Baptisms ★ · Hands Raised · Parking      (★ = auto-picked headline)
```

---

## 5. Decisions locked (this review)
- **D-A. Ministry = Group = one `service_tags` node.** Same table; UI word is flexible. Retire "sub-tag."
- **D-B. Tree = branches (`service_tags`) + leaves (`metrics`). Two tables, drawn as one tree.** Not a re-architecture.
- **D-C. The 4 Kinds are fixed** (Attendance/Volunteers/Giving/Stats) — they carry the math. Counts are free-named leaves under a Kind.
- **D-D. Two log modes: per-service (instance) vs weekly (period).** Giving + Life Groups = weekly.
- **D-E. Life Groups = a *weekly* ministry** with child groups (Tabors…), each with weekly counts. **Its counts must be `scope='period'`** — today they were seeded `instance` with no service, which is why there's nowhere to enter them (the actual snag).
- **D-F. "Add a group/ministry" is lightweight** (type a name → it auto-gets Attendance, ready to log). Scales to many groups; each is still a child node. (Covers both "few fixed" and "many/rotating" life groups.)
- **D-G. Hide the engineer concepts:** `canonical` (auto-pick the headline), `scope` (inferred from service vs weekly), and the word "tag/sub-tag." 
- **D-H. No migration.** This is relabel + a tree UI on existing tables. The only data touches are column *values* (`metrics.scope`) and the small "weekly container" choice in §7.

---

## 6. What changes in the app (build implications — for later)
- **New "What we track" tree screen** = the editor for the whole tree (ministries → kinds → counts), with drag-to-nest and "＋ add count" / "＋ add group." **This replaces the three broken screens** `/settings/stats`, `/settings/volunteer-roles`, `/settings/giving-sources` (they write dropped tables — `response_categories` / `volunteer_categories` / `giving_sources` — and collapse into this one tree).
- **Add-service flow gets a "what do you count here?" step** (defaults shown + editable) so create → track → entry is one path.
- **Entry gets a "Weekly" section** for period things (Giving + Life Groups), beside the per-service entry.
- **Auto-seed becomes scope-aware:** a ministry with no service seeds `period` counts, not `instance`.

---

## 7. Open decisions (for whoever builds)
1. **Weekly container shape:** is a no-service ministry (Life Groups) a `service_templates` row *without a schedule*, or just a top-level `service_tags` node logged weekly? (Small structural choice; no new table either way.)
2. **Life Group child counts:** attendance-only, or also Volunteers/Decisions weekly? (Builder undecided — lean: configurable per group, default Attendance.)
3. **Hierarchy depth:** is 2 levels enough (Ministry → group), or arbitrary nesting? (Lean: arbitrary via `parent_tag_id`, but UI defaults to 2.)

---

## 8. Scope / coordination
- This is **metric + ministry + tree UI** — **disjoint** from the parallel workstream on the occurrence route + service-graph RLS (`0032`). Safe to build in parallel.
- **SAGE gate:** new UX + navigation with no IRIS map → it goes through a short **Blueprint** (PRODUCT/SCREEN element map + GROVE copy) before any code. Nothing ships without SAGE.
