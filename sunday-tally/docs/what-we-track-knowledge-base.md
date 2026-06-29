# What We Track — Setup Guide

> Source of truth for onboarding, tooltips, and help content on the What we track screen.

---

## Ministries, Groups, and Where Things Live

### Top-level vs. nested — what's the difference?

Anything at the top of the tree gets its own card on the dashboard. Its own color. Its own numbers. It stands alone.

Anything nested inside something else is a group. Groups roll their numbers up to the parent — you count them separately in Entries, but the dashboard shows one combined total for the parent.

The role label (Ministry, Adults, Kids, Youth, Other) is just there to describe the audience. It doesn't change how the dashboard treats it. What matters is where it sits in the tree.

### So when do you make something top-level?

Make it top-level when it deserves its own dashboard card. Some good signs:
- It's a whole service — Experience, LifeKids, Switch
- It's something church-wide that doesn't belong to any one service — like Giving
- You want to see it on the dashboard as its own thing, tracked over time, with its own color
- Two or more ministries share the same number — if nobody owns it, give it its own home

### When do you nest it as a group instead?

Nest it when it's a breakdown of something that already exists. A few good signs:
- Same services, same audience, you just want to count it separately
- You want to see the detail in Entries but one combined total on the dashboard
- It would feel weird as its own standalone dashboard card

**Example:** Life Groups has two campuses — Tabors and Roberts. You want to see each one's attendance separately when you're entering numbers. But on the dashboard, you just want one "Life Groups" card. So Tabors and Roberts are groups inside Life Groups, not separate top-level ministries.

**The flip side:** Experience and LifeKids are both weekend services. Same morning, different audiences. Each one gets its own dashboard card because a pastor needs to see them separately. They're both top-level.

---

## The Four Types — Attendance, Volunteers, Stats, Giving

Every count you add belongs to one of these four. The type tells the dashboard what kind of number it is and how to handle it. You can't change the type after you create the count, so pick the right one up front.

### Attendance

People in the room. Headcount.

The dashboard shows it as a people count and tracks it week over week, month over month, year over year. Averages automatically exclude weeks where the service didn't run — as long as you leave those weeks blank instead of entering zero. (More on that below.)

If you track multiple rooms or two service times, add an Entry for each one. The dashboard adds them up.

### Volunteers

People serving. Headcount, but separate from attendance.

Add one count per role — Band, Ushers, Greeters, whatever you track. The dashboard totals them automatically.

Don't create a "Total Volunteers" count. If you enter individual roles and also a manual total, the dashboard counts everyone twice. You don't need the total — the system does the math.

### Stats

Everything that's a number but not a headcount. Baptisms, salvations, hands raised, first-time guests, parking cars, connection cards — anything you count that doesn't fit neatly into "people attending" or "people serving."

Stats are reported as raw numbers and compared week over week and year over year.

### Giving

Dollar amounts. Everything tagged as Giving adds up automatically — no matter which ministry or group it's under.

Add one count per collection method: Giving App, Giving Bucket, Online, Cash, whatever you use. The dashboard totals them.

Don't create a "Total Giving" count. Same reason as volunteers — if you enter the pieces and a manual total, you've doubled the number.

Giving is almost always a church-wide, once-per-week number. That means it needs its own top-level node — see the next section for why.

---

## The Scope Rule — One of the Most Important Things to Get Right

> If something is counted once for the whole week, it doesn't belong under a service-specific ministry.

Here's the problem: Experience runs two services — 9am and 11am. Every count under Experience gets entered once per service, every time a service runs. Attendance, volunteers, stats — all per service.

If you put Giving under Experience, the system expects you to enter giving for the 9am service and again for the 11am service. That's not how giving works. You have one total for the weekend.

The test: *"Would I enter this separately for each service, or once for the whole week?"*

- Once per service → put it under the ministry that runs those services
- Once per week for the whole church → it needs its own top-level node

If a number belongs to nobody in particular — total weekend giving, total parking across all services — give it its own home. Don't force it under a ministry it doesn't belong to.

---

## Entry vs. Roll-up

Every count is one or the other.

**Entry** means you type it. Every week, you open Entries and put a number in. That's it.

**Roll-up** means the math is done for you. You set it up to combine other entries — adding them, averaging them, or taking the highest — and you never type it directly.

Use Entry for every real number you count. Attendance, each volunteer role, each giving source, each stat.

Use Roll-up when you want a calculated total across entries that already exist. Like a "Total Weekend Attendance" that adds Experience 1 and Experience 2 automatically.

The rule is simple: don't do both. Don't create a Roll-up for something you're also typing manually. Don't create a manual Entry for something the system can calculate. Pick one and let the other one go.

---

## The Grand Total — Your Dashboard's Headline

A roll-up combines entries *inside one ministry*. The **grand total** is the next level up — the headline number on the dashboard that combines *across* ministries.

You define it in **Settings → Setup → Totals** ("Grand total rules"). Each rule sets:

- **Adds up** — any mix of the four types: Attendance, Volunteers, Stats, Giving.
- **Shown as** — **Weekly average** or **Running total**.
- **Across all included ministries** — every top-level ministry by default.

One rule is marked the **primary "Grand total"** — that's the headline figure on the dashboard. You can keep more than one rule. Out of the box there are two defaults: **Total Attendance** (attendance only, primary) and **Total Present** (attendance + volunteers).

**Excluding a ministry:** if a ministry shouldn't count toward the grand total — a side count, a satellite gathering you watch but don't want inflating the church-wide number — leave it out. You toggle it off the total from the dashboard; it keeps its own card and trend line, it just doesn't add into the headline.

**Roll-up vs. grand total, side by side:**
- **Roll-up** — combines entries *within* one ministry (Experience 9am + 11am → Experience).
- **Grand total** — combines *across* ministries into the dashboard headline, per your rules.

**Where it lives:** rules are edited at Settings → Setup → Totals (stored in `churches.dashboard_prefs.totals`); the per-ministry exclusions (`excludedTotalMinistries`) are toggled from the dashboard. Full data model in `TOTALS_RULES_PLAN.md`.

---

## Blank Is Not Zero

> If a service didn't meet, leave it blank. Don't enter zero.

This one matters more than it sounds.

Blank means "we didn't have this service." Zero means "we had it and nobody showed up."

When the dashboard calculates your weekly average or year-over-year comparison, blank weeks are skipped. Zero weeks are counted. If your church takes two weeks off for Christmas and you enter zeros, those zeros pull your annual average down as though you held services with empty rooms.

- Service didn't meet → leave it blank
- Service met, nobody came (rare, but it happens) → enter 0
- You forgot to enter last week → go back and fill it in, or leave it blank if you don't know

---

## Colors and Order

The order ministries appear in the tree sets their color. First one gets color 1, second gets color 2, and so on. That color follows the ministry everywhere — the dashboard, Entries, and History all use it.

If you move ministries around, colors shift. Set your order intentionally before you start entering data. If you want Experience to always be blue, keep it first.

You can also set a custom color on any ministry using the color picker. A custom color sticks no matter where the ministry sits in the order.

---

## Quick Answers

**Should I make this a ministry or a group?**
If it needs its own dashboard card — make it top-level. If it's a breakdown of something that already exists — nest it.

**When do I add a group inside a ministry?**
When you want to count something separately in Entries but you don't need it to show up as its own dashboard card.

**I have two giving sources. Do I need two top-level nodes?**
No. Add two Entry counts under one Giving node. The dashboard totals them.

**Can I put Giving under Experience?**
Depends on what you mean. If you want Giving to show on the Experience dashboard card — entered per service, every time Experience runs — click Experience and use "Add a count" to add a Giving count inside it. That's a count that belongs to Experience. If you want Giving to have its own dashboard card with its own trend line and its own schedule, it needs to be its own top-level node. The tree shape is the dashboard shape: same card = inside the same ministry. New card = top-level.

**What's the difference between "Add ministry or group" and "Add a count"?**
"Add ministry or group" creates a new dashboard card. "Add a count" adds a number to track inside whatever ministry you're looking at — it shows on that ministry's card, not a new one. If you want to add giving inside Experience, click Experience and use "Add a count." If you want Giving to be its own card, use "Add ministry or group."

**Do I need a "Total Volunteers" count?**
No. Add the individual roles. The system adds them up.

**Do I need a "Total Giving" count?**
No. Same reason.

**I run two services and want one combined attendance number.**
Add an Entry count per service, then add a Roll-up count on the parent ministry. The Roll-up does the math.

**What's the difference between a roll-up and the grand total?**
A roll-up combines entries inside one ministry. The grand total combines across ministries into the dashboard's headline number. Set what it adds up in Settings → Setup → Totals.

**How do I keep a ministry out of the church-wide total?**
Leave it out of the total from the dashboard. It keeps its own card and trend line but doesn't add into the grand total.

**Where do I change what the big dashboard number means?**
Settings → Setup → Totals ("Grand total rules") — choose the types it adds up and whether it shows as a weekly average or a running total.

**The service didn't meet this week. What do I enter?**
Nothing. Leave it blank.

**I moved ministries around and the colors changed.**
That's how it works — order drives color. Set the order before you start counting, or use a custom color override.

---

## Tooltip Copy

*One-liners for title attributes and inline help chips.*

**Add ministry or group (top-level button):**
Start something new at the top level. It gets its own dashboard card, its own color, its own trend line. Good for a whole service, a campus, or something church-wide like Giving. If it's a breakdown of something that already exists, click that ministry first and use "Add a group inside" instead.

**Add a group inside [X]:**
A group is a breakdown inside [X]. You count each one separately in Entries, but the dashboard adds them all up under [X] as one number. Use this when you want the detail without a separate dashboard card.

**Ministry label (top-level node):**
This is top-level — it gets its own dashboard card with its own color. Everything inside it rolls up here.

**Group label (nested node):**
This sits inside another ministry. You count it separately in Entries, but it adds up under the parent on the dashboard.

**Attendance:**
People in the room. Averages skip weeks the service didn't run — leave blank, not 0, for weeks you didn't meet.

**Volunteers:**
People serving. Add each role separately and the system totals them. Don't add a "Total Volunteers" count — it double-counts.

**Stats:**
Numbers that aren't headcounts — baptisms, salvations, hands raised, parking, connection cards.

**Giving:**
Dollar amounts. All your giving sources add up automatically. Don't add a "Total Giving" count — it double-counts.

**Entry button:**
You count this and type it in every week.

**Roll up sub-entries button:**
The math is done for you. This one adds up other counts automatically — you never type it.

**Weekly · church-wide badge:**
One number for the whole church, once a week. Not entered per service.

**Blank vs. zero:**
Blank means the service didn't run. Zero means it ran and nobody came. Leave it blank for weeks you didn't meet — zeros drag down your averages.
