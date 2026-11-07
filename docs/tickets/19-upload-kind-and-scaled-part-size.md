# 19: Uploads know their kind; part size scales with the file

**Parent:** docs/specs/03-video-vault.md
**Status:** done
**Blocked by:** None (can start immediately)

## What to build

A prefactor so that video can reuse the upload handshake. Starting an upload takes a **kind** (`AUDIO` or `VIDEO`, defaulting to `AUDIO`), and the size cap is looked up per kind from config (250 MB audio, 20 GB video by default). The part size is no longer fixed: it scales with the file so the part count stays under S3's 10,000-part limit, with 16 MiB as the minimum, and every part URL is issued when the upload starts. Every audio file under the cap still gets 16 MiB parts, so the music upload flow behaves exactly as before.

Video uploads aren't accepted end to end yet: ingest for kind `VIDEO` belongs to ticket 20. This ticket can reject `VIDEO` at create time, or accept it into the contract behind a clear "not available yet" error. Either is fine as long as audio is untouched.

## Acceptance criteria

- [ ] The contract's upload create request has an optional `kind`. Web types are regenerated, and `pnpm check:api` passes.
- [ ] The size cap is per kind and configurable. Audio over its cap is still rejected with today's message.
- [ ] A pure unit test covers the part-size rule: the 16 MiB minimum, a 20 GB file staying under 10,000 parts, and the boundary just over 16 MiB × 10,000.
- [ ] The response's part size and the number of part URLs match the rule.
- [ ] All existing ingest and upload tests (backend and web) pass unchanged.
