---
name: SundayTally
description: Engineered clarity for church data.
colors:
  neutral-bg: "#FAFAFA"
  neutral-surface: "#F5F5F4"
  neutral-border: "#E7E5E4"
  ink-primary: "#1C1917"
  ink-secondary: "#78716C"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.05em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "'Fira Code', ui-monospace, monospace"
    fontWeight: 500
rounded:
  md: "0.375rem"
  xl: "0.75rem"
  2xl: "1rem"
  3xl: "1.5rem"
spacing:
  4: "1rem"
  6: "1.5rem"
  8: "2rem"
  12: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.ink-primary}"
    textColor: "#ffffff"
    rounded: "9999px"
    padding: "16px 32px"
  card-default:
    backgroundColor: "#ffffff"
    rounded: "{rounded.2xl}"
    padding: "{spacing.8}"
---

# Design System: SundayTally

## 1. Overview

**Creative North Star: "The Engineered Record"**

This system represents a clean, precise, and understated approach to data. It rejects the generic SaaS "bento box" aesthetic and the magical "AI sparkles" look. Instead, it feels like an editorial journal built by an engineer: relying on negative space, sharp typography, and thin structural borders rather than drop-shadows or gradients.

**Key Characteristics:**
- High-craft and editorial minimalism.
- Data over decoration.
- Strict alignment and generous padding.
- Flat by default, shadows used exceptionally sparingly.

## 2. Colors

A strictly restrained palette anchored in warm off-whites and slate ink.

### Primary
- **Slate Ink** ({colors.ink-primary}): The dominant anchor for all primary text, headings, and primary CTAs. Provides a slightly warmer, softer contrast than pure black.

### Neutral
- **Gallery Off-White** ({colors.neutral-bg}): The default page background. A warm, museum-like canvas that avoids the starkness of pure white.
- **Cool Paper** ({colors.neutral-surface}): Used for slightly recessed areas, secondary cards, or subtle emphasis regions.
- **Stone Border** ({colors.neutral-border}): A delicate 1px line used for all structural containment.
- **Muted Ink** ({colors.ink-secondary}): Used for secondary text, descriptions, and metadata.

**The One Voice Rule.** There is no traditional "brand accent color" (no blue, red, or green buttons). The system speaks purely through the contrast between the Gallery Off-White background and the Slate Ink foreground. 

## 3. Typography

**Display Font:** System Sans (Arial/Helvetica)
**Body Font:** System Sans (Arial/Helvetica)
**Label/Mono Font:** Fira Code

**Character:** Utilitarian, highly legible, and deliberately neutral. It steps out of the way of the data.

### Hierarchy
- **Display** (800, clamp(3rem, 5vw, 4.5rem), tight tracking): Hero headlines. Staggeringly bold to contrast the minimal UI.
- **Headline** (700, 2.25rem): Section headings and major component titles.
- **Body** (400, 1.125rem, 1.6 leading): Standard reading text. Line length capped at 65–75ch.
- **Label** (500, 0.875rem, Fira Code): Used for numeric data, metrics, and technical metadata. Tabular numerals ensure alignment.

**The Technical Metric Rule.** Any critical number or data point should use the `Fira Code` mono font (`.font-num`) to enforce tabular alignment and signal engineered precision.

## 4. Elevation

The system uses flat 1px borders (`border-stone-200`) for nearly all structural containment, rejecting the modern trend of ubiquitous soft drop-shadows.

### Shadow Vocabulary
- **Floating UI** (`box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1)`): The `shadow-xl` / `shadow-2xl` depth is reserved *exclusively* for elements that break the document flow entirely, such as the floating AI Assistant overlay or modal dialogs. 

**The Flat-By-Default Rule.** Surfaces are flat at rest. If a container needs separation from the background, it receives a 1px border or a subtle background tint (`bg-stone-50`), never a shadow.

## 5. Components

### Buttons
- **Shape:** Full pill (`rounded-full`)
- **Primary:** Slate Ink background, white text.
- **Hover:** Slight scale up (`hover:scale-105`), avoiding color shifts to maintain the monochrome discipline.
- **Secondary:** White background, 1px Stone border, Slate Ink text.

### Cards / Containers
- **Corner Style:** Large radii (`rounded-2xl` or `rounded-3xl` for major regions).
- **Background:** Pure white (`#ffffff`) or Cool Paper (`#F5F5F4`).
- **Border:** Always 1px Stone Border.
- **Shadow Strategy:** None. Flat by default.

### Dashboards & Metrics
- **Style:** Numbers are pushed to extreme sizes (e.g., `text-3xl font-extrabold`) while labels stay minimal and muted (`text-sm text-stone-500 font-medium`).
- **Charts:** Reduced to bare geometric minimums. No grids, no axes lines if possible, just the data volume itself.

## 6. Do's and Don'ts

### Do:
- **Do** rely on generous padding (e.g., `p-8` or `p-12`) to separate elements instead of lines or boxes.
- **Do** use `Fira Code` for all dashboard numbers and metrics.
- **Do** use `bg-[#FAFAFA]` for the main page background.

### Don't:
- **Don't** use the generic SaaS "Bento Box" template with repeating identical cards and generic icons.
- **Don't** use "Apple Dark Mode" or overly moody tech styling.
- **Don't** use "Magic" AI aesthetics like sparkles, purple/pink gradients, or glowing orbs.
- **Don't** use light gray text on off-white backgrounds; ensure text contrast is high by sticking to `stone-500` or darker.
- **Don't** apply shadows to standard cards or layout columns.
