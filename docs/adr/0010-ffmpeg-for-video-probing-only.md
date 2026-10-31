# 10. Use ffmpeg for video probing, thumbnails and subtitles, never for transcoding

Status: accepted

(First written as 0009. Search took that number on `main` at the same time, so this one was renumbered on 2026-10-31.)

## Context

Spec 01 kept ffmpeg out: audio tags and properties are read on the JVM (ADR 0005). Video (spec 03) needs duration, resolution, stream codecs, a thumbnail frame and embedded subtitles from MP4, MOV, WebM and MKV. No maintained JVM library reads all of those, and decoding a frame for a thumbnail on the JVM is not realistic.

## Decision

- The API image installs `ffmpeg` (which includes `ffprobe`) from the base image's distribution packages.
- Video ingest runs `ffprobe -print_format json -show_format -show_streams` against an internal presigned GET URL for the object, so it reads only the ranges it needs. It runs `ffmpeg` to grab one thumbnail frame and to extract text subtitle streams to WebVTT.
- Each call is a child process behind a `MediaProbe` port with a timeout (default 2 min, `ossm.media.timeout`) and a cap on output size. A timeout or non-zero exit is a terminal ingest failure with a readable reason.
- A missing binary fails each video job with "Video processing isn't available on this server (ffmpeg is missing)." It does not fail startup or `/api/v1/health`, so a server without ffmpeg still serves music. The binaries are found on the `PATH` unless `ossm.media.ffprobe` and `ossm.media.ffmpeg` name them.
- ffmpeg never transcodes or remuxes the video itself. Playback is direct play (ADR 0006).
- Audio ingest is unchanged and stays on the JVM.

## Consequences

The first estimate here, 80–100 MB more, was wrong. Ubuntu's `ffmpeg` package pulls in its full codec and filter set: the API image is about 1.26 GB as `docker image ls` reported it on 2026-10-31, and the image that only adds ffmpeg to `eclipse-temurin:25-jre` is about 1.09 GB. A static ffmpeg build, or a slimmer distribution, would cut most of that; it has not been needed yet.

ffmpeg parses untrusted files, so it runs as the same unprivileged user as the API, with the timeout, and only ever reads from a URL and writes to a temp directory that is deleted after the job.

Tests that ingest video need ffmpeg on the machine and in CI. `VideoFlowTest` skips those tests when ffmpeg is not on the `PATH`; CI installs it, so they always run there.

Moving to HLS later would reuse this port; it would add a transcode job rather than change the probe.
