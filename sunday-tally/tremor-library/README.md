# Tremor library (mirrored reference)

A full local mirror of **Tremor** (the Vercel-owned, Tailwind v4 copy-paste component set,
formerly "Tremor Raw") — to pull from when building our charts and dashboards.

- **components/** — ~40 Tremor components (all charts: Area/Bar/Combo/Donut/Line/Spark/BarList/
  CategoryBar/Tracker/ProgressBar/ProgressCircle, plus Card/Table/Tabs/Tooltip/etc.) — folder
  per component, with examples/stories. Source: `github.com/tremorlabs/tremor`.
- **blocks/** — 323 pre-composed blocks across 28 categories (kpi-cards, chart-compositions,
  chart-tooltips, area/bar/line/donut/spark charts, tables, page-shells, filterbars, etc.).
  Source: `github.com/tremorlabs/tremor-blocks`.
- **utils/**, **hooks/** — the `cx` helper (clsx + tailwind-merge) and shared hooks the
  components depend on.

## License / provenance
- `github.com/tremorlabs/tremor` ships **Apache-2.0** — see `./LICENSE`. Keep attribution
  when promoting code into the app.
- `github.com/tremorlabs/tremor-blocks` has **no LICENSE file** in the repo. Vercel's
  acquisition announcement states all Tremor products (incl. Blocks) are free and open source,
  but the license is not declared in-repo — treat as Apache-2.0 by association and confirm
  before any external redistribution.

## ⚠️ This folder is NOT part of the app build
It is excluded in `tsconfig.json` and `eslint.config.mjs`. Two reasons:
1. **Recharts version gap.** Tremor targets **`recharts@^2`**; our app runs **`recharts@^3.8`**.
   Recharts 3 was a major rewrite, so these chart components do **not** drop in and run as-is.
2. The blocks contain demo data, Next-app-specific imports, and deps we haven't installed
   (`tailwind-variants`, `@remixicon/react`, several `@radix-ui/*`, etc.).

## How to use it
This is a **pull-from reference**, not an imported package. To adopt a component:
1. Copy the file(s) from `components/<Name>/` into `src/components/...`.
2. Add the deps that component needs (`clsx`, `tailwind-merge`, `tailwind-variants`,
   the relevant `@radix-ui/*`).
3. **Resolve the Recharts version** for any chart component — see OPEN_ITEMS / the team
   decision (align on recharts v2, or adapt the component to recharts v3).
4. Run the humanizer on any user-facing strings; verify on Tailwind v4.
