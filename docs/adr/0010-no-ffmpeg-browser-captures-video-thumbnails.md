# 10. No ffmpeg: the browser captures video thumbnails and metadata

Status: accepted

## Context

The video vault (spec 03) needs a thumbnail, a duration and a resolution for each video, and must reject files that aren't videos. The usual tool is ffmpeg/ffprobe on the server. An earlier, unmerged design did exactly that. Adding Ubuntu's ffmpeg package took the API image from roughly 300 MB to about 1.26 GB. It also put a large native parser of untrusted files in the API process, needed timeouts and output caps, and made CI depend on ffmpeg.

The vault plays originals directly (ADR 0006) and never transcodes, so the only things ffmpeg would provide are one frame and a few numbers. The browser that uploads the file can decode it already.

## Decision

- The server never runs ffmpeg or ffprobe. Video ingest checks magic bytes (ISO BMFF `ftyp` for MP4/M4V/MOV, EBML for WebM/MKV), computes SHA-256 with a streaming read, and checks for duplicates. Nothing else.
- Whether an upload is audio or video is set by where it was started, not by sniffing streams.
- A web **frame grabber** loads the local file into a hidden `<video>`, seeks to about 10% of the duration, draws one frame to a canvas (640 px wide JPEG), and reads the duration, width and height.
- After the upload reaches `DONE`, the browser saves the frame and the numbers through a single thumbnail endpoint. When the watch page plays a video that has no thumbnail, it captures one from the playing element and saves it through the same endpoint.
- Duration, width and height are nullable and only for display. The server doesn't trust them for anything else.

## Consequences

- The API image, CI and audio ingest stay free of ffmpeg. There's no native media parser in the server.
- A file the browser can't decode (for example HEVC in MKV on Firefox) gets no thumbnail and no duration until someone watches it in a browser that can. Until then its tile shows a placeholder.
- Imported videos (folder import, a later spec) have no browser at ingest. They rely on backfill when first watched.
- The browser could send a wrong duration or an unrelated image. The only effect is on that user's own vault display, since vaults are private.
- If transcoding or server-side thumbnails are ever needed, they would come back as a separate worker image, not inside the API.
