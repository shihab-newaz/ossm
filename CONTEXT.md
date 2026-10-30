# OSSM glossary

Domain terms for OSSM. Filled in lazily as the language settles; add a term when a conversation or a PR needs it.

<!-- Term: one-line definition. Note anything the code calls it differently. -->

**Qualifying play**: a play that counts toward history and Most played. It is recorded as a `play_completed` event once the user has actually heard 30 seconds or 50% of the track, whichever comes first. Seeks and paused time do not count. The code calls the event `play_completed`.

**Playback event**: a record of something the player did (`play_started`, `play_completed`, `skipped`). The browser queues events in a localStorage outbox and posts them; the server stores them idempotently by `eventId`. See ADR 0008.

**Genre slug**: a genre name lowercased, with runs of non-alphanumeric characters turned into one hyphen. "Hip-Hop", "hip hop" and "HIP/HOP" share the slug `hip-hop` and count as one genre.

**Featured album**: the newest album that has a cover. Shown in the Explore banner.

**Video**: a movie or an episode in the video library (spec 03). Separate from a track: its own table, its own player engine.

**Movie**: a video that stands alone, with a title and optional year.

**Show**: a series that groups episodes. Season is a number on the episode, not its own record.

**Episode**: a video that belongs to a show, with a season number, episode number and optional episode title. Parsed from filenames like `S01E02` or `1x02`, editable afterwards.

**Playable**: set at ingest when the browser can play a video's container and codecs as stored. A video that is not playable is still kept, with a "may not play in this browser" badge. There is no transcoding.

**Watch progress**: a user's last position in a video and whether it is watched (90% or fewer than 2 minutes left). Last write wins. It is not a playback event.
