# 0. The working procedure

The same loop was run for every slice of the backend. The technology changes from rung to rung; the loop does not. Learn this first.

## The loop

1. **Write the ticket before the code.** A ticket says what to build, who it is blocked by, and a list of acceptance criteria. Each criterion is a statement a test can fail, for example "Uploading the same file twice leaves one track" (ticket 06). Vague criteria ("ingest is robust") were not accepted.
2. **Spike what you do not know.** The object store was an unknown, so ticket 02 was a time-boxed spike that finished before any upload code was written. The deliverable was a written finding with pass/fail per question and a go/no-go (rung 2).
3. **Decide, then write the decision down.** When a choice was not obvious, an ADR recorded the context, the decision and the consequences. Eight exist. Most were written at the end of the ticket that forced the decision, and updated when later tickets changed it (ADR 0005 was updated by ticket 06).
4. **Contract first.** `contract/openapi.yaml` is edited by hand before any controller exists. The web types are generated from it, and a backend test fails if the running API drifts from it (rung 1, ADR 0003).
5. **Test at the HTTP seam, against real infrastructure.** Tests call the API over HTTP with a real Postgres and a real S3-compatible store started by Testcontainers. Nothing is mocked. Small pure algorithms (retry schedule, tag fallbacks, dominant colour) also have plain unit tests (rung 8).
6. **Schema through Flyway, never through the ORM.** `spring.jpa.hibernate.ddl-auto` is `validate`. Session tables and the job-queue table are Flyway migrations too, not created at startup. Six migrations exist, one per slice that needed tables.
7. **Do the thinnest thing, then check it against real data.** Synthetic fixtures passed first; real files then found bugs the fixtures could not (rung 4).
8. **Close the ticket honestly.** Tick the criteria, then add a comment with what was decided, what was done early for a later ticket, what was *not done on purpose*, and what was *not verified*. Those last two lines are the most useful part of a ticket a month later.

## Rules that held throughout

- Every `/api/**` route needs a login unless it is on a short, explicit allow-list in `SecurityConfig`.
- The user always comes from the session, never from a request body.
- The database enforces what must never happen (unique content hash, one event per id). Application code checks first so the user gets a good message, but it is not the only guard.
- A failure the user can act on gets a readable reason; one they cannot gets a retry.
- Anything outside the Postgres/S3 pair (Kafka, ClickHouse) sits behind a small port, so adding it later changes plumbing, not producers.

## Habits worth copying

- **Mutation checks.** After writing tests for the 30-second rule (ticket 09), the rule was deliberately broken in three places to confirm a test failed each time. A test that cannot fail is not a test.
- **Pin what you run.** The store image is pinned (`chrislusf/seaweedfs:4.48`) in compose and in Testcontainers, and the Postgres test image is `postgres:17-alpine`.
- **Format on CI.** `./gradlew spotlessCheck` (google-java-format) runs before tests.
- **Keep a "known gaps" file.** `PROGRESS.md` lists what is unverified. A gap you have written down is a to-do; one you have not is a surprise.

## What CI runs

| Job | What it checks |
|---|---|
| backend | `spotlessCheck`, then `./gradlew test` (which includes the contract test and the restart tests) |
| web | `pnpm check:api`, typecheck, lint, tests |
| images | both Docker images build |

## Snippets

**The shape of a ticket** (`docs/tickets/06-ingest-hardening.md`, trimmed). Note that every criterion is something a test can fail.

```markdown
# 06: Ingest hardening

**Parent:** docs/specs/01-phase-1-core-app.md
**Status:** done
**Blocked by:** 05 (Upload, ingest and a track appears)

## What to build
Make ingest safe and complete for real-world files: all supported formats, sensible defaults
for bad tags, duplicate protection, clear failures and retries ...

## Acceptance criteria
- [x] A renamed non-audio file (for example a text file named .mp3) is rejected with a readable reason.
- [x] Uploading the same file twice leaves one track and tells the user it was a duplicate.
- [x] Pure unit tests cover the tag-fallback rules and the dominant-color computation.

## Comments
- Done. Decisions are in ADR 0005 (updated). ...
- Not done on purpose: the content-addressed audio key move (dedupe uses the hash in Postgres instead) ...
```

**The shape of an ADR** (`docs/adr/0003-contract-first-api.md`, complete). Short on purpose.

```markdown
# 3. The OpenAPI document is the API contract

Status: accepted

## Context
The web app and the backend are built as separate slices and must not drift apart.

## Decision
`contract/openapi.yaml` is hand-authored and committed. The web app generates its TypeScript
types from it and makes every call through the typed client. The backend serves its own
`/v3/api-docs`, and a test fails when the set of operations and response codes differs from
the committed contract. Errors use RFC 9457 problem details.

## Consequences
An API change is a contract change first. ...
```

**The backend CI job** (`.github/workflows/ci.yml`). Format first, then the whole suite, which includes the contract test and the restart tests.

```yaml
backend:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: backend
  steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-java@v6
      with:
        distribution: temurin
        java-version: 25
    - uses: gradle/actions/setup-gradle@v6
    - name: Format check
      run: ./gradlew spotlessCheck
    - name: Test
      run: ./gradlew test
```

## Checkpoint

Before moving on, pick one ticket from `docs/tickets/` and answer:

- Which acceptance criterion would be hardest to turn into a failing test, and why?
- What would you have spiked first?
- Which decision in it deserves an ADR?
