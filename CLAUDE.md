# OSSM

OSSM (Open Source Streaming Music) is a self-hosted music streaming app for your own files. It's a portfolio project: Spring Boot API + Next.js web UI + Postgres + an S3-compatible object store (SeaweedFS as the reference deployment). Kafka and ClickHouse analytics arrive in Phase 2.

Visual design lives in `DESIGN.md`. Follow its tokens literally.

## Agent skills

### Issue tracker

Specs live as local markdown files in `docs/specs/` and tickets in `docs/tickets/` (not GitHub Issues). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
