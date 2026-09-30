# Issue tracker: Local Markdown (docs/specs)

Specs and tickets for this repo live as markdown files in `docs/specs/`, not in GitHub Issues. (The GitHub repo exists and is public, but it is not used for tracking work.)

## Conventions

- Specs are files directly in `docs/specs/`, numbered in creation order: `docs/specs/<NN>-<slug>.md` (for example `01-phase-1-core-app.md`).
- Tickets are one file per ticket at `docs/tickets/<NN>-<ticket-slug>.md`, numbered in dependency order (blockers first), continuing the global sequence across specs (specs 01 and 02 produced tickets 01-18; the next spec's tickets start at 19). Never a single combined tickets file.
- Each ticket file carries a `Status:` line near the top (`ready-for-agent` by default), a `Parent:` line pointing at the spec file, and a `Blocked by:` line listing ticket numbers (or "None").
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.
- No triage label vocabulary is configured; `Status:` values are plain text (`ready-for-agent`, `in-progress`, `done`).

## When a skill says "publish to the issue tracker"

Create a new file under `docs/specs/` following the conventions above (creating directories as needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the ticket number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `docs/specs/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `docs/tickets/NN-<slug>.md`, numbered in the global sequence, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `docs/tickets/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
