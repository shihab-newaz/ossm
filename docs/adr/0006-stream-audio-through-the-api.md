# 6. Stream audio through the API, with a single byte range

Status: accepted

## Context

Uploads go straight to the object store (ADR 0005) because they are large and one-off. Playback is different: it is a read on every listen, and it must be behind the login. The store has no users of its own, and presigned read URLs would hand out links that keep working after a user is deactivated or logged out.

## Decision

- `GET /api/v1/tracks/{id}/stream` proxies the object from the store. It is an ordinary authenticated API route, so sessions, deactivation and logout apply with no extra work, and the store stays reachable only from the compose network (plus the signed upload path from ADR 0005).
- Direct play only. The file is sent as stored, with its content type taken from the extension of the object key (`audio/mpeg`, `audio/flac`, `audio/mp4`, `audio/ogg`, `audio/wav`).
- One byte range is supported: `start-end`, open-ended `start-` and suffix `-n`. The API asks the store for just that range, so seeking in a 250 MB file does not re-read the start. An end past the file is clamped; a start past the end is `416` with `Content-Range: bytes */size`.
- A `Range` header that is malformed, uses another unit or asks for several ranges is ignored and the whole file is sent. HTTP allows this, and browsers only ever ask for one range.
- The object is opened before the response begins, so a track whose file has gone missing from the store is a clean `404` problem response rather than a torn stream. The body is copied on a virtual thread with `StreamingResponseBody`.
- Responses are `Cache-Control: private, max-age=86400`. The bytes behind a track id never change, and `private` keeps shared caches from holding audio that needs a login.
- The cover endpoint already worked this way (ADR 0005 notes covers are content-addressed), so cover art and audio share the same rules.

## Consequences

Every listener's audio flows through the API process. That is fine for a self-hosted instance and cheap with virtual threads, since the thread blocks on I/O rather than on a pool slot. If it ever matters, the endpoint could answer with a short-lived presigned redirect instead.

Seeking inside a file depends on the store honouring range reads, which SeaweedFS does.

Not covered: conditional requests (`If-Range`, `ETag`). `HEAD` works (Spring derives it from the `GET` mapping and it returns the right length), but it has not been checked whether it opens the object in the store.

## Addendum: the video vault (spec 03, ticket 21)

Video originals use the same mechanism (`GET /api/v1/videos/{id}/stream`, and `/download` for the attachment), with the rules shared in `ObjectResponses` so audio and video cannot drift apart. What differs:

- **Owner first.** A video belongs to one user. The lookup is `where id = ? and owner_id = ?`, so someone else's video, an admin's included, is a `404` before any range or object is looked at. Never a `403`, and never a `416` for a video you cannot see.
- **`Cache-Control: no-cache, private`**, not a day of `max-age`. A track is shared by everyone who can log in; a video is one person's, and a browser used by two people must not replay one person's video from its cache for the other. Seeking still reads only the ranges it needs; what is lost is only re-use of cached bytes after a reload.
- **The content type comes from the container recorded at ingest** (`video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`), not from the object key or the file name.
- **Download** adds `Content-Disposition: attachment` with both `filename` (safe ASCII, other characters as `_`) and `filename*=UTF-8''…` (RFC 6266 and 5987), with control characters removed so a file name cannot start another header. It supports ranges too, so an interrupted download can resume.
