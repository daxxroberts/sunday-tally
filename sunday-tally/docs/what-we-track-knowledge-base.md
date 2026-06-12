# What We Track — Setup Knowledge Base

> This document is the source of truth for end-user onboarding, in-app tooltips, and help content on the **What we track** screen. Every rule here should eventually have a home in the UI (tooltip, onboarding step, or inline hint).

---

## 1. The Tree — Ministries, Groups, and Why It Matters

### What is a top-level node?

A top-level node is anything that sits at the root of the tree (not nested inside anything else). It gets its **own card on the dashboard**, its **own color**, and its **own trend line**. It reports independently.

You can set the role of a top-level node to Ministry, Adults, Kids, Youth, or Other — the role is metadata about the audience, not what determines whether it shows up as its own dashboard card. Tree position determines that.

> **90% rule:** Most top-level nodes are set to "Ministry." Giving and similar church-wide trackers are often set to "Other." Both get their own dashboard card.

### What is a group?

A group is a node nested inside another node. Groups can hold their own sub-groups and their own counts. Their numbers flow up to the parent when the dashboard totals things.

You enter group counts separately in Entries — you can see the breakdown week to week — but the dashboard rolls everything up to the top-level ministry card.

### When do you make a top-level node vs a group?

**Make it top-level if:**
- It should have its own dashboard card with its own color and trend line
- It belongs to a different service than the ministry you might put it under
- It is measured at a different cadence (weekly church-wide vs per-service)
- Two or more ministries share the same count — it belongs to neither of them, so give it its own node

**Make it a group (nested) if:**
- It is a breakdown *within* a ministry — same audience, same services, you just want separate tracking rows in Entries
- You want to see the split in Entries but one combined total on the dashboard
- It would never make sense as a standalone dashboard card

> **Example:** Life Groups → Tabors, Roberts. Both campuses of the same ministry. You enter Tabors attendance and Roberts attendance separately each week, but the dashboard shows one "Life Groups" card with the combined total. Neither Tabors nor Roberts needs its own dashboard card.

> **Counter-example:** Experience and LifeKids are separate top-level ministries even though they're both weekend services — they have different audiences, different counts, and a pastor wants to see each one independently on the dashboard.

---

## 2. The Four Reporting Types

Every count you add belongs to one of four reporting types. The type tells the dashboard how to handle the number. You cannot change a count's type after you create it — choose carefully.

### Attendance

**What it is:** A headcount of people present at a service or gathering.

**Dashboard behavior:**
- Shows as a people count on the ministry card
- Week-over-week and year-over-year comparisons are available
- Averages are calculated correctly: weeks where the service did not meet are excluded (see the NULL rule below)
- Multiple attendance counts under the same ministry add together for the ministry total

**Setup guidance:**
- One attendance count per service occurrence is standard (e.g., "Experience Adult Attendance")
- If you track multiple rooms or venues that combine into one total, use Entry counts on each and a Roll-up on the parent

### Volunteers

**What it is:** A headcount of people serving at a service.

**Dashboard behavior:**
- Shows as a people count, separate from attendance
- The dashboard always calculates the volunteer total — it is never stored as a single number
- Multiple volunteer counts under the same ministry add together automatically

**Setup guidance:**
- Add one count per volunteer role (Band, Ushers, Greeters, etc.)
- **Never create a "Total Volunteers" entry count.** If you enter individual roles AND a manual total, the dashboard double-counts. The system adds the roles for you.

### Stats

**What it is:** Any number that is not a headcount — baptisms, salvations, hands raised, first-time guests, parking cars, connection cards, anything numeric that doesn't fit Attendance or Volunteers.

**Dashboard behavior:**
- Reported as raw numbers
- Summed across all stat counts for the ministry
- Compared week-over-week and year-over-year

**Setup guidance:**
- Use Stats for anything you count but that is not "how many people were there" or "how many people served"
- Stats counts can be zero in a given week without the same implications as a zero attendance count (see NULL rule below)

### Giving

**What it is:** Dollar amounts collected at or attributed to a service or week.

**Dashboard behavior:**
- All giving metrics — regardless of which ministry or group they sit under — sum together for the total Giving KPI on the dashboard
- Giving from multiple collection sources (app, bucket, online, cash) all add up automatically
- Giving is most commonly tracked church-wide (one total per week) rather than per-service

**Setup guidance:**
- Add one count per collection method (Giving App, Giving Bucket, Online, etc.)
- **Never create a "Total Giving" entry count.** If you enter individual sources AND a manual total, the dashboard double-counts. The system adds the sources for you.
- If giving is one church-wide number (not split by service), the Giving node needs to be its own top-level node — see the Scope Rule below.

---

## 3. Entry vs Roll-up

Every count is either an **Entry** or a **Roll-up**. This is the most important individual count setting.

### Entry

A number you type each week. It belongs to the group it is attached to and stays there unless you explicitly point it to a roll-up above.

Use Entry for every real count you collect — attendance at each service, each volunteer role, each giving source, each stat.

### Roll-up

A count that calculates automatically by combining (adding, averaging, or taking the max of) entries that point up to it. You never type a roll-up directly — the system fills it in.

Use Roll-up when you want a calculated total across entries that already exist. For example: a "Total Weekend Attendance" count on a top-level ministry that sums Experience 1 + Experience 2 attendance.

> **Rule:** Never create a Roll-up for something you are also entering manually. Never create a manual Entry for something the system can calculate. Pick one.

### When would you use a Roll-up?

- You run two services (9am and 11am) and want the dashboard to show a combined total automatically
- You track multiple volunteer roles and want a "Total Volunteers" roll-up for reporting (though the dashboard handles this automatically for the Volunteers type — roll-ups are more useful for Stats)
- You have a parent ministry that should show the sum of its groups' attendance

---

## 4. The Scope Rule — When a Count Needs Its Own Top-Level Node

This is one of the most important rules for getting your setup right.

> **Rule:** If a count is measured at a different scope or cadence than the services under a ministry, it needs its own top-level node.

### Service-bound counts

A count is service-bound when it belongs to a specific service occurrence — you enter it once per service, every time that service runs. Attendance at the 9am service, volunteers serving that morning, hands raised during that service. These counts go under the ministry whose services they belong to.

### Church-wide / weekly counts

A count is church-wide when it is one number per week, not tied to which service ran — total weekend giving, total first-time guests across all services, baptisms for the month. These counts belong to their own top-level node.

### Why it matters

If you put a giving count under Experience, the system expects a giving entry on every Experience service occurrence. If Experience runs two services per week, the system asks you to enter giving twice — once for each service. That is not how giving works. One weekly total split across service occurrences would either under-report or require manual division.

> **Example:** Giving is one weekly total for the whole church. It does not belong under Experience (which runs per-service) or under LifeKids. It belongs to its own top-level Giving node with weekly church-wide scope.

> **Test question:** "Would I enter this number separately for each service that runs, or once for the whole week?" If once for the whole week — it needs its own top-level node.

### A shared count belongs to neither ministry

If a number spans two ministries — giving collected across the whole morning, total parking regardless of which service — it does not belong under either ministry. Give it its own top-level node so the ownership is clear and the entry is not duplicated.

---

## 5. The NULL Rule — Blank Is Not Zero

> **Rule:** If a service did not meet that week, leave the count blank. Do not enter zero.

### Why it matters

Blank (NULL) means "this service did not run." Zero means "this service ran and nobody came."

The dashboard calculates averages, year-over-year comparisons, and trend lines. When it averages attendance over 52 weeks:
- A blank week is excluded from the average — it does not count as a data point
- A zero week is included — it pulls the average down as if the service ran with zero people

A church that takes two weeks off for Christmas and enters zero instead of leaving it blank will show a permanently lower attendance average for the year.

### The practical rule

- Service did not meet → leave blank
- Service met, nobody came (rare, but possible) → enter 0
- You forgot to enter last week → go back and enter the real number, or leave it blank if you genuinely do not know

---

## 6. Colors and Display Order

> **Rule:** The order ministries appear in the tree determines their color. First ministry gets color 1, second gets color 2, and so on. That color follows the ministry to the dashboard, Entries, and History.

### What this means

If you reorder the tree, ministry colors shift. The dashboard, Entries page, and History grid all use the same positional color palette. Moving a ministry up or down in the tree changes which color it gets everywhere.

Ties in display order (two ministries with the same position number) are broken by creation date — the older ministry gets the earlier color.

### Practical guidance

- Set your display order intentionally before you start entering data
- If you want Experience to always be blue, make sure it stays in the first position
- Custom color overrides (the color picker on each ministry) lock a ministry to a specific color regardless of position

---

## 7. Quick Reference — Common Setup Questions

| Question | Answer |
|---|---|
| Ministry or group? | Top-level = own dashboard card. Nested = rolls up to parent. |
| When to subgroup? | Same audience, same services, want separate Entries rows but one combined dashboard card. |
| Two collection methods for giving? | Two Entry counts under the same Giving node. No manual total. |
| Giving under Experience? | No — giving is weekly church-wide, Experience is per-service. Scope mismatch → own top-level node. |
| Forgot to enter a week? | Go back and enter the real number. If unknown, leave blank. Never enter 0 for a week you simply forgot. |
| Total Volunteers count? | Don't create one. The system totals the roles you enter. |
| Total Giving count? | Don't create one. The system totals the sources you enter. |
| Two services, want combined attendance? | Entry counts on each service, Roll-up on the parent ministry. |
| Service didn't meet this week? | Leave blank, not 0. |
| Changed display order and colors shifted? | Expected behavior — order drives color. Reorder intentionally or use the color override. |

---

## 8. Tooltip Source Text

*These are the one-sentence versions for use in `title` attributes and inline help chips throughout the UI.*

**Ministry / top-level node:**
A top-level node gets its own card on the dashboard. Set the role to Ministry, Kids, Youth, or Other based on the audience — role is just metadata; tree position is what determines the dashboard card.

**Group:**
A group lives inside a ministry or another group. It can hold its own sub-groups and counts. Its numbers roll up to the parent on the dashboard, but you enter and track them separately in Entries.

**Attendance reporting type:**
Headcount of people present. Averages exclude weeks the service did not meet — leave it blank, not 0, for services that did not run.

**Volunteers reporting type:**
Headcount of people serving. Add individual role counts; the system totals them. Never add a manual "Total Volunteers" entry — it double-counts.

**Stats reporting type:**
Any numeric count that is not a headcount — baptisms, salvations, hands raised, parking, connection cards. Reported as raw numbers.

**Giving reporting type:**
Dollar amounts. All giving counts sum together automatically. Never add a manual "Total Giving" entry — it double-counts.

**Entry:**
A number you type each week. It belongs to this group and stays here unless you point it to a roll-up above.

**Roll up sub-entries:**
This count calculates automatically by adding up (or averaging) entries that point to it from below. You never type it directly.

**Weekly · church-wide badge:**
This count is one total per week for the whole church — not entered per service. How often it is collected is set in Services and Occurrences.

**NULL / blank attendance:**
Leave blank if the service did not meet. Blank weeks are excluded from averages. A zero is counted as a week where the service ran with nobody present.
