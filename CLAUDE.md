# OSSM

OSSM (Open Source Streaming Music) is a self-hosted music streaming app for your own files. It's a portfolio project: Spring Boot API + Next.js web UI + Postgres + an S3-compatible object store (SeaweedFS as the reference deployment). Kafka and ClickHouse analytics arrive in Phase 2.

Visual design lives in `DESIGN.md`. Follow its tokens literally.

## Frontend (`web/`)

Next.js 16 App Router, React 19, Tailwind 4, TanStack Query, tested with Vitest, Testing Library and MSW. Package manager is pnpm.

- **API access** goes through the typed `openapi-fetch` client in `web/src/api/client.ts`. Types in `src/api/schema.d.ts` are generated from `contract/openapi.yaml` (`pnpm gen:api`; CI runs `pnpm check:api`). Change the contract first, then regenerate; don't hand-edit `schema.d.ts` or hand-write request types.
- **Same-origin `/api`**: Caddy routes it to the backend in the compose stack, and `next.config.ts` rewrites it in `pnpm dev`. Don't hardcode backend URLs in components.
- **Server state** lives in TanStack Query (the provider is in `components/Providers.tsx`). Use it for data fetching and mutations rather than SWR or `useEffect` fetches.
- **Styling** uses the tokens in `src/styles/tokens.css`, mapped from `DESIGN.md`. Use the CSS variables, not raw hex values.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm test` from `web/` before finishing.

## Agent skills

### Issue tracker

Specs live as local markdown files in `docs/specs/` and tickets in `docs/tickets/` (not GitHub Issues). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
