# 06: Ingest hardening

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 05 (Upload, ingest and a track appears)

## What to build

Make ingest safe and complete for real-world files: all supported formats, sensible defaults for bad tags, duplicate protection, clear failures and retries, and the extra metadata the UI needs later.

- Accept MP3, FLAC, M4A/AAC, OGG/Opus and WAV, verified by sniffing file content rather than trusting extensions. Reject anything else with a readable reason.
- Enforce the 250 MB limit both client-side (before upload) and server-side.
- Compute a SHA-256 content hash; a re-upload of an identical file is recognized and skipped with a clear message.
- Tag fallbacks: filename as title, "Unknown Artist", missing album grouped sensibly.
- Extract codec, bitrate and duration for the quality badge.
- Compute the album's dominant color from its cover at ingest and store it.
- Optional per-track license chosen at upload time (default "All rights reserved").
- Failed ingests keep a human-readable reason and can be retried from the UI; transient failures retry automatically with backoff.
- Admins can see ingest failures.

## Acceptance criteria

- [ ] Each of the five formats ingests successfully with correct metadata (API tests using small sample files).
- [ ] A renamed non-audio file (for example a text file named .mp3) is rejected with a readable reason.
- [ ] A file over 250 MB is rejected before upload in the UI and rejected by the API if the client is bypassed.
- [ ] Uploading the same file twice leaves one track and tells the user it was a duplicate.
- [ ] A file with no tags ingests with the filename as title and "Unknown Artist".
- [ ] Codec, bitrate, duration and dominant color are stored and returned by the API.
- [ ] A failed ingest shows its reason in the UI and a retry action that succeeds once the cause is fixed.
- [ ] The license chosen at upload is stored and returned; the default is "All rights reserved".
- [ ] Pure unit tests cover the tag-fallback rules and the dominant-color computation.
