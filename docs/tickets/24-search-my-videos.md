# 24: Search my videos

**Parent:** docs/specs/03-video-vault.md
**Status:** ready-for-agent
**Blocked by:** 20

## What to build

A search box on the Videos page filters the vault by title and description, with typo-tolerant trigram matching (ADR 0009), always scoped to the signed-in user. Results are ranked by similarity, with newest first on ties. Clearing the box shows the full vault again. Global music search is unchanged.

## Acceptance criteria

- [ ] API test: a partial word and a small typo find a video by its title and by its description.
- [ ] API test: another user's matching video never appears.
- [ ] API test: the query uses the owner-plus-trigram index (check with `EXPLAIN` on a seeded table, or document why the planner skips it on tiny data).
- [ ] Web test: typing filters the grid (debounced), an empty result shows a clear message, and clearing restores the vault.
- [ ] The existing music search tests pass unchanged.
