# BUILD FLAGS

Open items that require a decision or IRIS map update before they can be considered complete.

---

## Open

| Screen / File | What is ambiguous | What is needed to proceed |
|---|---|---|
| OnboardingLayout + ONBOARDING_CHURCH (/onboarding/church) | Logo (S monogram + wordmark), indigo progress bar, and "Exit setup" link are live in the layout but **not yet documented in any IRIS element map**. No `IRIS_ONBOARDING_CHURCH_ELEMENT_MAP.md` exists. | IRIS needs to create the ONBOARDING_CHURCH element map and add these shared-layout elements (logo, progress bar, exit link). *(Pre-existing — not part of the mirrored-metrics feature.)* |
| **Mirrored metrics — DetailPanel section order (Phase 4 fidelity fix)** | The editor renders the "Counted in every group" (template) section above the groups list but the "Counted in {ministry} as a whole" (ministry_only) section *below* everything. The approved mockup + Daxx's instruction put **"as a whole" ABOVE "every group"**, both directly above the groups list. | Reorder `DetailPanel.tsx` (ministry-with-groups branch) to: identity → "as a whole" → "every group" → groups list. Fix + live-verify in Phase 4. |
| **Mirrored metrics — IRIS_TTRACK_ELEMENT_MAP.md (Phase 4 map update)** | The Phase-2 editor is built but the element map has no E-numbers for the new structures. | IRIS to author E-numbers for: the two ministry add-sections (as-a-whole / every-group); the group node's "from {ministry}" (ghosted/locked mirror rows) + "just for {group}"; the RETIRED entry/roll-up toggle + "rolls up into"/op selectors; the template "Adds up your groups" hint; the "Move to every group" link; and the depth-2 "no Add-a-group on a group" rule. |
