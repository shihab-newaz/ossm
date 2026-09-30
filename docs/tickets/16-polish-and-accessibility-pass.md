# 16: Polish and accessibility pass

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 11 (Explore page), 13 (Favorites and History), 14 (Playlists), 15 (Mobile experience)

## What to build

A deliberate audit of the finished Phase 1 UI against DESIGN.md and accessibility standards, fixing every gap. This ticket is about consistency and quality, not new features.

- Walk every screen against DESIGN.md: tokens, type scale, radii, elevation, motion, component styles, empty and error states, skeleton loaders.
- Accessibility: keyboard reachability of every interaction, visible focus, correct labels and roles, AA contrast (including text over artwork on a scrim), announcements for ingest status and toasts, reduced-motion behavior.
- Consistency: Amp Orange reserved for the primary action and active state; no spinners for page loads; no gradients on chrome; two-line maximum under cards.
- Error handling: sensible screens for 401, 404 and 500 and for network failure.
- Admin and Settings screens included in the audit.

## Acceptance criteria

- [ ] A written checklist of DESIGN.md requirements is completed for every screen, with deviations fixed or recorded as intentional.
- [ ] An automated accessibility scan (for example axe) runs in CI on key pages and has no serious or critical violations.
- [ ] The whole app is operable by keyboard alone, including the player, queue, menus and dialogs.
- [ ] Reduced-motion preference disables tile rotation, shimmer and scale effects.
- [ ] All pages have loading skeletons and empty and error states.
- [ ] Light and dark themes both pass the contrast checks.
