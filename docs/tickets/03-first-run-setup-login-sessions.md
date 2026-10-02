# 03: First-run setup, login and sessions

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
**Blocked by:** 01 (Walking skeleton)

## What to build

A fresh instance can be claimed and a user can log in and out. On first visit with no users, the web app shows a setup screen that creates the admin account. Once an admin exists the setup screen is gone for good, and everyone sees the login screen.

- Backend: setup endpoint that only works while no users exist; login and logout; argon2id password hashing; HttpOnly cookie sessions stored in Postgres (Spring Session JDBC) that survive a restart; two roles (admin, user); problem-detail errors.
- Contract: auth and setup endpoints authored in OpenAPI first, client regenerated, MSW handlers added.
- Web: setup screen, login screen with clear error messages, account menu with logout, redirect to login on 401 and return to the original page afterward, theme setting persisted.
- No open self-registration.

## Acceptance criteria

- [x] With no users, visiting the site shows setup; completing it creates an admin and logs them in.
- [x] The setup endpoint and screen are unavailable once any user exists (verified by an API test).
- [x] Correct credentials log in; wrong credentials show an error without revealing which field was wrong.
- [x] Passwords are stored as argon2id hashes (verified by an API-level test that the stored value is not the password).
- [x] The session cookie is HttpOnly and survives an API restart (restart test with Testcontainers).
- [x] An expired or missing session sends the user to login and returns them to the page they wanted.
- [x] Logout invalidates the session server-side.
- [x] UI tests against the MSW mock cover the setup, login, 401 redirect and logout flows.
