# 8. Testing against real infrastructure

Runs through every rung. The declared rule (spec 01): the backend's one seam is the HTTP API, and the database and object store are never mocked.

## Goal

Tests that fail when the system is wrong and pass when it is right, without a mock standing between the test and the behaviour that matters.

## Learn first

- Testcontainers, and Spring Boot's `@ServiceConnection` for wiring a container's address into the app.
- `@SpringBootTest(webEnvironment = RANDOM_PORT)` and why Spring caches application contexts between test classes.
- The difference between a test at a seam (HTTP) and a test of an algorithm (pure unit).
- Test isolation when many tests share one database.

## The pieces

| Piece | Role |
|---|---|
| `PostgresTestConfiguration` | A `postgres:17-alpine` container, wired in with `@ServiceConnection`. |
| `TestInfrastructure` | Imports the Postgres configuration and adds the S3-compatible store (`chrislusf/seaweedfs:4.48`, waited for on port 8333). Every integration test imports this one class, so they share one context. |
| `AuthTestSupport.resetInstance` | Truncates users, sessions, uploads, library tables and job rows between tests. It first waits for any running job to finish, because truncating under a running job can deadlock, and retries on lock failures. |
| `Session` | A browser stand-in: a JDK `HttpClient` with its own cookie jar. One `Session` per simulated user, which is how per-user isolation is tested. |
| `Http`, `StoreClient` | Plain helpers for unauthenticated calls and for talking to the store directly. |
| `Mp3Fixture` and `resources/audio/` | MP3 files built in code; the other formats are small synthetic tones made with ffmpeg. No real music is in the repo. |
| `AudioLibrarySmokeTest` | Reads every MP3 in a folder when `OSSM_AUDIO_DIR` is set. Local only, skipped otherwise. |

## What is tested where

- **HTTP seam, real Postgres and store:** auth, setup, user management, upload, ingest, streaming, events, library reads, the contract.
- **Pure unit tests:** the retry schedule, tag fallbacks, tag reading of fixtures, the format sniffer, dominant colour. Algorithms with no I/O.
- **Restart tests:** stop one application context and start another against the same database to prove that sessions and queued jobs survive.

## Procedure for a new test

1. Import `TestInfrastructure` and inject the port.
2. Reset the instance in `@BeforeEach`.
3. Create a user through the real API (setup, then invite or create), and log in with a `Session`.
4. Do the thing over HTTP. Assert on the response, then, where the response cannot show it, on the table (for example, that the stored password is not the password).
5. Add the unhappy paths in the same class: anonymous, another user, malformed input, unknown id.

## The restart-test lesson

`IngestSurvivesRestartTest` was flaky: it expected only its own worker to take its job, but cached application contexts from other test classes kept their ingest schedulers polling the shared database, and one of them took the job first. The fix is not a retry. The restart tests run in their own Gradle task and JVM (`restartTests`, run after `test`), so nothing else is polling.

## Pitfalls

- A test that passes with a mocked store proves nothing about presigned URLs, ranges or checksums.
- Shared state is the enemy: if two classes need different data, reset it, do not assume order.
- Synthetic fixtures are not real files. Run the smoke test on a real library before trusting a format reader.

## Checkpoint

- [ ] You can start the whole integration suite with only Docker available.
- [ ] A new test class needs only the import and a reset, with no per-test container.
- [ ] You can explain why the restart tests are in a separate JVM.
- [ ] You have deliberately broken one behaviour and confirmed a test failed.

## Reference code

`backend/src/test/java/dev/ossm/api/` (`TestInfrastructure`, `PostgresTestConfiguration`, `AuthTestSupport`, `Session`, `Http`, `StoreClient`, `Mp3Fixture`), `backend/build.gradle.kts` (`restartTests`).
