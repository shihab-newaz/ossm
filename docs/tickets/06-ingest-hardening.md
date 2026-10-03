# 06: Ingest hardening

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
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

- [x] Each of the five formats ingests successfully with correct metadata (API tests using small sample files).
- [x] A renamed non-audio file (for example a text file named .mp3) is rejected with a readable reason.
- [x] A file over 250 MB is rejected before upload in the UI and rejected by the API if the client is bypassed.
- [x] Uploading the same file twice leaves one track and tells the user it was a duplicate.
- [x] A file with no tags ingests with the filename as title and "Unknown Artist".
- [x] Codec, bitrate, duration and dominant color are stored and returned by the API.
- [x] A failed ingest shows its reason in the UI and a retry action that succeeds once the cause is fixed.
- [x] The license chosen at upload is stored and returned; the default is "All rights reserved".
- [x] Pure unit tests cover the tag-fallback rules and the dominant-color computation.

## Comments

- Real-audio test library: `H:\AUDIO` on the dev machine (local only, not in the repo, and the files are not to be copied into it). Use it for manual and exploratory checks of this ticket. Automated tests should keep generating small fixture files instead.
- Contents of `H:\AUDIO` (checked 2026-10-03): mostly MP3 (including 128 and 320 kbps), one FLAC, one M4A, one `.weba` (WebM audio, likely an unsupported-format case), and four album subfolders. Good for exercising mixed formats, nested folders and rejection of unsupported files.
- Carried over from 05: move audio objects from `audio/<upload-id>.<ext>` to `audio/<aa>/<sha256>.<ext>` once the hash is known (the hash is already stored on the track). Add a unique index on `track.content_hash` for the duplicate check. 05 already enforces the 250 MB limit on client and API, and normalises codec names in `TagReader.codecName`.
- Smoke check for real files: `OSSM_AUDIO_DIR=H:AUDIO ./gradlew test --tests '*AudioLibrarySmokeTest'` currently reads only `.mp3`; extend its extension list as formats are added.
- Done. Decisions are in ADR 0005 (updated). Real-file check on `H:AUDIO` (212 audio files): all 211 supported ones read (209 MP3, 1 FLAC, 1 M4A, all with a bitrate), the one WebM `.weba` is rejected as unsupported. A live upload through the compose stack covered a 25 MB two-part FLAC, the M4A, a WebM named `.mp3` (refused with the readable reason) and an identical MP3 uploaded twice (second one `DUPLICATE`).
- Real files exposed three bugs the synthetic fixtures could not: the MP4 `dash` brand (video-site downloads) was rejected, a WebM file passed as MP3 on a single stray byte pair, and segmented MP4 reports no bitrate (now estimated from size and duration).
- Library limits worth knowing: jaudiotagger cannot read Opus (hence `OpusReader`), and WAV files carry no track number through it. The fixtures in `backend/src/test/resources/audio/` are synthetic tones made with ffmpeg; their README says how.
- Not done on purpose: the content-addressed audio key move (dedupe uses the hash in Postgres instead), a retry button for client-side rejections (nothing was sent), AAC in a raw `.aac` (ADTS) file (rejected as unsupported).
