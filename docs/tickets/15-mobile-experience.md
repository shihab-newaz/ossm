# 15: Mobile experience

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 08 (Queue and full player), 10 (Library browsing)

## What to build

The app is comfortable to use on a phone, following DESIGN.md Section 8.

- Below 1024px the sidebar becomes a bottom tab bar (Home, Explore, Search, Library).
- The player collapses to a 64px mini-player (cover, title and artist, play, like) with a thin progress line, and expands to a full-screen dark player with blurred cover backdrop; swipe down dismisses it.
- Detail headers stack; track lists hide secondary columns and move row actions into a menu; touch targets are at least 44px and hover-only affordances have touch alternatives.
- Layouts verified at mobile, tablet and desktop widths.

## Acceptance criteria

- [ ] At mobile widths the tab bar replaces the sidebar and every primary destination is reachable.
- [ ] The mini-player expands to the full-screen player and swipe-down (and a visible close control) returns to the page.
- [ ] Full-screen player uses the dark theme regardless of the app theme.
- [ ] All interactive targets are at least 44×44px.
- [ ] Content never hides behind the mini-player or tab bar.
- [ ] Every screen implemented so far has been checked at mobile, tablet and desktop widths, in light and dark.
- [ ] UI tests cover mini-player expansion and dismissal.

## Comments
- From 08: the queue button and shuffle/repeat are hidden below the lg breakpoint, and there is no full-screen player yet. This ticket should add the mini-player expansion and a way to reach the queue on mobile.
