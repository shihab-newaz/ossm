# OSSM glossary

Domain terms for OSSM. Filled in lazily as the language settles; add a term when a conversation or a PR needs it.

<!-- Term: one-line definition. Note anything the code calls it differently. -->

**Qualifying play**: a play that counts toward history and Most played. It is recorded as a `play_completed` event once the user has actually heard 30 seconds or 50% of the track, whichever comes first. Seeks and paused time do not count. The code calls the event `play_completed`.

**Playback event**: a record of something the player did (`play_started`, `play_completed`, `skipped`). The browser queues events in a localStorage outbox and posts them; the server stores them idempotently by `eventId`. See ADR 0008.

**Genre slug**: a genre name lowercased, with runs of non-alphanumeric characters turned into one hyphen. "Hip-Hop", "hip hop" and "HIP/HOP" share the slug `hip-hop` and count as one genre.

**Featured album**: the newest album that has a cover. Shown in the Explore banner.
