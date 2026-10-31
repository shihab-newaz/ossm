# 7. Library reads

Tickets 10 and 11 (the backend halves). No ADR: these were ordinary decisions.

## Goal

Read endpoints that let the UI browse tracks, albums and artists with stable paging, and build a home page (Explore) from the user's own library: genres, recently added, featured and most played.

## Learn first

- SQL joins, `group by`, aggregates, and `left join` when a row may have no parent (a track with no album).
- Why paging needs a deterministic order, and what happens to pages without one.
- Limit/offset paging, and its limits.
- Ordered-set aggregates (`mode() within group`), `regexp_replace`, and CTEs.
- How to take a sort option from a request without building SQL from raw input.

## Procedure

1. **Paging contract.** `limit` and `offset` query parameters. No `limit` means everything, so existing callers did not change. The total goes in an `X-Total-Count` header, so the body stays a plain array. `limit` is 1 to 1000 and `offset` is not negative; anything else is `400`.
2. **Stable order.** Every `order by` ends in the row id, so pages never overlap or skip when other columns tie.
3. **Sort by whitelist.** The `sort` parameter is mapped to a fixed SQL fragment with a `switch`; an unknown value is `400`. Raw input is never concatenated into SQL. `limit` and `offset` are validated integers, and values that are bound use named parameters.
4. **One projection per read model.** A shared select list and joins define what a "track" row contains, and a mapper turns a result row into the response record. Tracks without an album come from a `left join`.
5. **Album and artist reads.** List and detail endpoints for each, with counts and summed durations from a `group by`. Detail returns the album with its tracks (ordered by disc, track number, title).
6. **Genres.** Built from the tags actually present, so there are no empty genres. The *slug* is computed in SQL (lower case, runs of non-alphanumerics become one hyphen, trimmed), so "Hip-Hop", "hip hop" and "HIP/HOP" are one genre and grouping and filtering share a single definition. The display name is the most common spelling (`mode()`). It works for non-Latin tags.
7. **Recently added.** Albums ordered by their newest track's time, so an album rises when a track is added to it. Tracks without an album do not appear.
8. **Featured.** The newest album that has a cover, with `204` when there is none.
9. **Most played.** Reuses the per-user endpoint from rung 6, so it is private and counts qualifying plays only.

## Decisions and why

- **Offset paging, with the total in a header.** Simple, and fine for a personal library. See **Hindsight** in rung 9 for when to revisit.
- **Plain array bodies.** Adding paging did not break the existing consumer of `GET /tracks`.
- **Genre slug in SQL.** One definition used by the grouping, the filter and the tile colour, so they cannot disagree.
- **A hash of the slug picks the tile colour on the client.** A test pins three genres so a change to the hash is noticed.

## Pitfalls

- Pages overlap if two rows tie on the sort column and the order is not completed by a unique column.
- A `left join` that is turned into an inner join by a `where` on the joined table silently drops albumless tracks.
- Some things were known and left: tracks without an album are not grouped as singles in the Albums tab; an album's "Uploaded by" names the uploader of its first track only.

## Checkpoint

- [ ] Pages of any size, taken in turn, tile the whole library with no overlap and no gaps.
- [ ] Ties are broken the same way every time.
- [ ] Each sort option orders as documented, and an unknown sort is `400`.
- [ ] `limit=0`, `limit=1001` and a negative offset are `400`.
- [ ] Album and artist detail return `404` for an unknown id and `401` when anonymous.
- [ ] Two genre spellings that differ only in case or punctuation are one genre, with the combined count.
- [ ] Recently added reorders when a track is added to an older album.
- [ ] Featured is `204` on a library with no covers.
- [ ] Most played ranking changes as qualifying plays arrive.

## Reference code

`library/` (`LibraryController`, `BrowseController`, `ExploreController`, `HistoryController`, `Paging`, `Genres`). Tests: `BrowseLibraryTest`, `ExploreApiTest`.
