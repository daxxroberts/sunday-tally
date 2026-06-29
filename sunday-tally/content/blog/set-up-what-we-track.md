---
title: "How to Set Up What You Track in Sunday Tally"
description: "The simplest correct way to set up your ministries, the four metric types, and your church-wide grand total in Sunday Tally, so your dashboard mirrors your church and the totals do themselves."
coverImage: "/blog/set-up-what-we-track-cover.png"
coverImageAlt: "The What We Track ministry tree in Sunday Tally with top-level ministries and nested groups"
ogImage: "/blog/set-up-what-we-track-cover.png"
date: "2026-06-29"
lastUpdated: "2026-06-29"
author: "Daxx Roberts"
category: "Sunday Tally Setup"
tags: ["sunday tally setup", "church metrics setup", "what we track", "church analytics"]
status: "draft-pre-grove"
featured: false
---

{/* DRAFT. Sunday Tally Setup post. Verified against docs/what-we-track-knowledge-base.md, TOTALS_RULES_PLAN.md, and the /settings/setup (track + totals) UI. Pros-forward, simplest correct setup. Needs GROVE stamp. */}

# How to set up what you track in Sunday Tally

The **What we track** screen, in **Settings → Setup → What we track**, is where Sunday Tally learns the shape of your church. Get it right once and everything downstream, the dashboard, your weekly entry, your history, simply works. Here's the simplest setup that also happens to be the correct one.

> **The one habit to get right from day one: blank is not zero.** When you enter weekly numbers, a service that didn't meet should be left **blank**, never entered as `0`. Blank means "we didn't have it" and is skipped in your averages. Zero means "we met and nobody came" and counts. There's a fuller explanation below, but if you remember nothing else from this guide, remember that one, it's the setting most likely to quietly distort your reports.

## Start with the shape: top-level or a group

The tree you build here *is* your dashboard. Anything **top-level** gets its own dashboard card, its own color, and its own trend line. Anything you **nest inside** it becomes a group that rolls up into its parent, counted separately when you enter numbers, shown as one combined total on the dashboard.

- Make it **top-level** when it deserves its own card: a whole service like Experience, LifeKids, or Switch, or something church-wide like Giving.
- **Nest it as a group** when it's just a breakdown you want to count separately but see as one number, like two campuses under a single "Life Groups" card.

The simplest way to remember it: same dashboard card means same branch; a new card means top-level.

## Pick the right type for each count

Every number you track is one of four types, and you choose it once when you create the count, so pick it up front:

- **Attendance** — people in the room.
- **Volunteers** — people serving (add one count per role).
- **Stats** — numbers that aren't headcounts: baptisms, salvations, first-time guests, hands raised, parking.
- **Giving** — dollar amounts.

That one choice tells the dashboard how to treat the number, which saves you work everywhere else.

## The one rule that prevents most setup mistakes

Ask a single question of every number: *would I enter this once per service, or once for the whole week?*

- **Once per service** (attendance, the volunteer roles for that service) → put it under the ministry that runs the service.
- **Once for the whole week** (giving, total parking across all services) → give it its own top-level node.

That's why Giving lives on its own rather than under "Experience": you have one weekend giving total, not a separate one for the 9am and the 11am.

## Let the system do the math (within a ministry)

Add the pieces, not the totals. Add each volunteer role and the dashboard sums them. Add each giving source and the dashboard sums them. There's no need to create a "Total Volunteers" or "Total Giving" count, and adding one actually doubles your numbers, because you'd be entering the pieces *and* a total.

If you do want a combined number inside a ministry, say, weekend attendance across two services, add each service as an **Entry** count, then add one **Roll-up** on the parent. The roll-up does the math, and you never type it by hand.

## The grand total: your dashboard's headline number

A roll-up combines entries *inside one ministry*. The **grand total** is the next level up, the big headline number on your dashboard that combines *across* ministries. You decide what it means in **Settings → Setup → Totals** ("Grand total rules"), where you choose:

- **What it adds up** — any mix of Attendance, Volunteers, Stats, and Giving.
- **How it's shown** — a **weekly average** or a **running total**.
- **Which ministries count** — by default it spans every top-level ministry.

One rule is marked the **primary "Grand total"**, and that's the headline figure. You can keep more than one rule, and out of the box Sunday Tally starts you with two sensible ones: **Total Attendance** (attendance only) and **Total Present** (attendance + volunteers).

If a ministry shouldn't count toward the headline, a side gathering you track but don't want inflating the church-wide number, just leave it out of the total: uncheck it from the dashboard, and it keeps its own card without adding into the grand total.

**Where you edit it:** Settings → Setup → Totals. Change it any time; the dashboard recalculates on the spot.

## Blank is not zero (the habit, in full)

This is the detail that quietly breaks reports, so it's worth making muscle memory before you enter your first week.

> Blank means "we didn't meet." Zero means "we met and nobody came."

When the dashboard figures your weekly average or your year-over-year comparison, it **skips blank weeks** and **counts zero weeks**. So if you take two weeks off at Christmas and type `0`, those zeros drag your annual average down as though you'd held services to empty rooms.

- Service didn't meet → leave it **blank**.
- Service met, nobody came (rare, but it happens) → enter **0**.
- Forgot last week → go back and fill it in, or leave it blank if you genuinely don't know.

Get this one habit right and every average the dashboard shows you stays honest.

## Your first five minutes

All of this lives in **Settings → Setup**:

1. **Add your services as top-level ministries** ("Add ministry or group") under the **What we track** tab, one card each for the ones you want to see on their own.
2. **Add Giving as its own top-level node** — it's church-wide and entered once a week.
3. **Inside each ministry, use "Add a count"** to add its attendance, each volunteer role, and any stats.
4. **Add each giving source as an Entry** under Giving (Online, App, Cash), no total.
5. **Set your grand total** on the **Totals** tab — pick what the headline adds up and whether it's a weekly average or a running total.
6. **Set your order** — a ministry's position sets its color across the whole app, so put your main service first.

That's a complete, correct setup. Everything else is just adding more of the same.

## Why this setup pays off

- **Your dashboard mirrors your church.** The tree you build is exactly what you see, no surprises.
- **The totals take care of themselves.** Roles and giving sources add up inside a ministry; the grand total adds up across ministries, exactly how you defined it.
- **Your averages stay honest,** because blank weeks are skipped instead of counted.
- **Your colors stay consistent** everywhere, so a ministry looks the same on the dashboard, in entry, and in history.
- **Weekly entry gets fast,** because you're only typing a handful of real numbers and the system calculates the rest.

## Frequently asked questions

### Should I make this a ministry or a group?
If it needs its own dashboard card, make it top-level. If it's a breakdown of something that already exists, nest it as a group inside that ministry. The shape of the tree is the shape of your dashboard.

### What's the difference between a roll-up and the grand total?
A roll-up combines entries *inside one ministry* (the two services that make up Experience). The grand total combines *across* ministries into your dashboard's headline number, and you define what it adds up in Settings → Setup → Totals.

### How do I keep a ministry out of the church-wide total?
Leave it out of the total from the dashboard, uncheck it, and it keeps its own card and trend line without adding into the grand total. Handy for side counts you watch but don't want inflating the headline.

### A service didn't meet this week. What do I enter?
Nothing. Leave it blank. Blank weeks are skipped in your averages; a zero would count as a service that met to an empty room and pull your numbers down.
