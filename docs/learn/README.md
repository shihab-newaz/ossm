# Learn: building the OSSM backend

A learning path for building this backend yourself, in the order it was built. It records the procedure that was followed, why each decision was made, what went wrong on the way, and how you will know each step works.

It documents the repo as of commit `f2948f2` (Phase 1, tickets 01 to 11). Everything here is taken from the tickets (`docs/tickets/`), the ADRs (`docs/adr/`), the spike finding (`docs/spikes/`) and the code. Where a document adds a judgement of its own, it is under a heading that says **Hindsight**.

The web app is not covered. Ticket 08 (the player) and the web halves of every other ticket are left out.

## How to use this

1. Start a blank Spring Boot project next to this repo. Do not copy files across.
2. Take one rung at a time, in order. Each document gives the goal, the ideas to learn first, the steps that were followed, and a checkpoint written as behaviours.
3. Write the checkpoint tests before the code. Make them fail for the right reason first.
4. Only then open the reference code listed at the bottom of each document and compare. Differences are worth thinking about; they are not mistakes by default.

The repo is the answer key, not the starting point.

## Before you start

- Java 25 toolchain, Gradle, and Docker running (the tests start real containers).
- Enough SQL to write a join and a `group by`, and enough HTTP to know what `206` and `Range` mean.
- Spring Boot basics: controllers, dependency injection, configuration properties. Spring Security, Spring Session, Flyway and the S3 SDK are taught on the rung that needs them.

## The rungs

| # | Document | Tickets | ADRs | Reference code |
|---|---|---|---|---|
| 0 | [The working procedure](00-the-procedure.md) | all | all | `docs/tickets/`, `.github/workflows/ci.yml` |
| 1 | [Walking skeleton and the contract](01-walking-skeleton-and-contract.md) | 01 | 0003 | `backend/build.gradle.kts`, `OpenApiContractTest` |
| 2 | [Spike the object store](02-object-store-spike.md) | 02 | 0001 | `spikes/s3-store/`, `docs/spikes/02-seaweedfs-finding.md` |
| 3 | [Auth and sessions](03-auth-and-sessions.md) | 03, 04 | 0004 | `auth/`, `users/`, `V2`, `V3` |
| 4 | [Upload and ingest](04-upload-and-ingest.md) | 05, 06 | 0005 | `ingest/`, `storage/`, `V4`, `V5` |
| 5 | [Streaming with range requests](05-streaming.md) | 07 | 0006 | `library/StreamController` |
| 6 | [Playback events and the outbox](06-playback-events.md) | 09 | 0008 | `events/`, `V6` |
| 7 | [Library reads](07-library-reads.md) | 10, 11 | none | `library/` |
| 8 | [Testing against real infrastructure](08-testing-with-real-infrastructure.md) | all | none | `backend/src/test/` |
| 9 | [Hindsight](09-hindsight.md) | | 0002, 0003 | |

Rung 8 is a topic that runs through all the others. Read it alongside rung 1 and again after rung 4.

## Vocabulary

Domain terms (qualifying play, playback event, genre slug, featured album) are in `CONTEXT.md` at the repo root.

## What this is not

It is not a tutorial for Spring Boot in general, and it does not try to teach every library it uses. Each document names what to read and leaves the reading to you.
