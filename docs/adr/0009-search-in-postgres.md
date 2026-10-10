# 9. Search is Postgres trigrams plus prefix full text

Status: accepted

## Context

People look for music by half a word, by a misspelling, or by artist and title together. The library is a few thousand tracks on one Postgres, and an external search engine would be a second thing to run, back up and keep in step.

## Decision

**Two mechanisms, one query.** A row matches when either the trigram test or the prefix test does:
- `pg_trgm` `strict_word_similarity` finds typos and mid-word fragments ("glroy box", "sour tims"). Strict, because plain `word_similarity` lets "radiohead" find "Portishead" through the shared "head". The threshold is 0.2, set per search transaction with `set_config(..., true)`, so it never leaks to other work on the pooled connection. Transpositions in short words score that low.
- Full text with the `simple` configuration and prefix terms (`gl:* & bo:*`) finds what is typed so far. Trigram scores for a short prefix of a long word are too low to match ("gl" for "Gloriously"), and one letter does not match at all. No stemming or stop words: they only get in the way of song titles.

**What is searched.** A track by its title, artist and album together, an album by its title and artist, an artist by its name. The combined text is a `search_text` column kept by a trigger, so ingest and tests that insert rows need not know about it. It cannot go stale because artist names and album titles are never edited. If an edit feature ever arrives, the trigger must also run on artist and album updates.

**Ranking.** Each hit scores the better of its title (or name) match and the wider text match, which is worth 0.9 of the same match on the title. A prefix hit is worth 0.8, below an exact word (1.0). `top` is the best first hit of the three groups; an artist beats an album beats a track when scores tie.

**Not done.** No accent folding ("Beyonce" does not find "Beyoncé"): `unaccent` is not immutable, so indexes would need a wrapper function. No stored `tsvector` column: the expression indexes are enough at this size.

## Consequences

- One-letter queries match every row that has a word starting with that letter, and each is scored before the limit applies. This is the slowest case (about 240 ms through HTTP on 6,000 tracks in CI); the palette debounces typing so it is rarely asked for twice in a row.
- Changing the threshold or weights changes results for everyone; `SearchApiTest` pins the behaviours that matter (typos, partial words, no false matches for unrelated words, title before album).
