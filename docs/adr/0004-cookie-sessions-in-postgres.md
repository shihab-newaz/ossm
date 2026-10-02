# 4. Cookie sessions stored in Postgres, no CSRF token

Status: accepted

## Context

Browsers talk to one origin (Caddy routes `/api` to the backend), so the simplest safe login is a server-side session behind an HttpOnly cookie. The UI never sees a token. Sessions must survive an API restart, and the instance has no open registration.

## Decision

- Sessions are Spring Session JDBC rows in Postgres. The schema is a Flyway migration, not created at startup. The cookie is `OSSM_SESSION`, HttpOnly, `SameSite=Lax`, 30 days, and `Secure` when `SESSION_COOKIE_SECURE=true` (set it whenever the site is served over HTTPS).
- Passwords use argon2id at the OWASP minimum cost (19 MiB, 2 iterations, 1 lane) through Spring Security's `Argon2PasswordEncoder`, which needs BouncyCastle.
- The login endpoint is our own controller, not Spring Security's form login. The session principal is only the username; the current role and active flag are read from the database on each `/auth/me`, so deactivating a user takes effect without hunting down their sessions.
- A wrong username and a wrong password return the same 401 body, and an unknown username still pays for a password check so the timing does not leak which usernames exist.
- Spring Security's CSRF protection is off. The API only accepts JSON bodies, the cookie is `SameSite=Lax` (not sent on cross-site POSTs), and there is one origin. If the API ever accepts form posts, or cookies become `SameSite=None`, this must be revisited.
- The request cache is off. Its default creates a session for every anonymous 401, which would let unauthenticated traffic write rows.

## Consequences

Logging out deletes the row, so a stolen cookie stops working immediately. There is no login throttling yet; brute-force limits are a follow-up before the instance faces the internet.
