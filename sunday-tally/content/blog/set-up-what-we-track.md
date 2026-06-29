---
title: "How to Set Up What You Track in Sunday Tally"
description: "The simplest correct way to set up your ministries and the four metric types in Sunday Tally, so your dashboard mirrors your church and the totals do themselves."
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

{/* DRAFT. Sunday Tally Setup post. Verified against docs/what-we-track-knowledge-base.md + /settings/track UI. Pros-forward, simplest correct setup. Needs GROVE stamp. */}

# How to set up what you track in Sunday Tally

The **What we track** screen is where Sunday Tally learns the shape of your church. Get it right once and everything downstream, the dashboard, your weekly entry, your history, simply works. Here's the simplest setup that also happens to be the correct one.

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

## Let the system do the math

Add the pieces, not the totals. Add each volunteer role and the dashboard sums them. Add each giving source and the dashboard sums them. There's no need to create a "Total Volunteers" or "Total Giving" count, and adding one actually doubles your numbers, because you'd be entering the pieces *and* a total.

If you do want a combined number, say, weekend attendance across two services, add each service as an **Entry** count, then add one **Roll-up** on the parent. The roll-up does the math, and you never type it by hand.

## Leave blank, not zero

When a service doesn't meet, leave that week **blank**. Blank means "we didn't have it," and the dashboard skips it when it figures your averages. **Zero** means "we met and nobody came," and it counts. A blank Christmas week keeps your yearly average honest; a zero quietly drags it down.

## Your first five minutes

1. **Add your services as top-level ministries** with "Add ministry or group", one card each for the ones you want to see on their own.
2. **Add Giving as its own top-level node** — it's church-wide and entered once a week.
3. **Inside each ministry, use "Add a count"** to add its attendance, each volunteer role, and any stats.
4. **Add each giving source as an Entry** under Giving (Online, App, Cash), no total.
5. **Set your order** — a ministry's position sets its color across the whole app, so put your main service first.

That's a complete, correct setup. Everything else is just adding more of the same.

## Why this setup pays off

- **Your dashboard mirrors your church.** The tree you build is exactly what you see, no surprises.
- **The totals take care of themselves.** Roles and giving sources add up automatically; there's nothing to maintain.
- **Your averages stay honest,** because blank weeks are skipped instead of counted.
- **Your colors stay consistent** everywhere, so a ministry looks the same on the dashboard, in entry, and in history.
- **Weekly entry gets fast,** because you're only typing a handful of real numbers and the system calculates the rest.

## Frequently asked questions

### Should I make this a ministry or a group?
If it needs its own dashboard card, make it top-level. If it's a breakdown of something that already exists, nest it as a group inside that ministry. The shape of the tree is the shape of your dashboard.

### I have two giving sources. Do I need two top-level nodes?
No. Add two Entry counts under one Giving node, and the dashboard totals them. The same goes for volunteer roles, add each one and let the system add them up.

### A service didn't meet this week. What do I enter?
Nothing. Leave it blank. Blank weeks are skipped in your averages; a zero would count as a service that met to an empty room and pull your numbers down.
