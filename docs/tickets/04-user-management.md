# 04: User management

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** done
**Blocked by:** 03 (First-run setup, login and sessions)

## What to build

The admin can bring other people into the instance and remove their access, and every user can manage their own password.

- Admin screen listing users with role and status.
- Admin creates a user or generates an invite link; the invitee opens the link and sets their own password, so the admin never knows it.
- Admin deactivates a user; deactivated users cannot log in and existing sessions stop working.
- Any user can change their own password in settings.
- Admin-only endpoints and pages are guarded; non-admins cannot see or reach them.

## Acceptance criteria

- [x] An admin can create a user or an invite link and see them in the user list.
- [x] An invite link can be used once to set a password and is invalid afterward and after expiry.
- [x] A deactivated user cannot log in and their active sessions are rejected on the next request (API test).
- [x] A regular user receives a forbidden response from admin endpoints and the admin navigation is hidden for them.
- [x] Changing a password requires the current password and invalidates other sessions for that user.
- [x] There is no way to register without an admin-created account or invite.
- [x] UI tests cover user list, invite creation, deactivation and password change against the MSW mock.

## Comments

- Design choice: "create a user" is an invite. The admin creates a pending account and gets a one-time link (7 days, stored hashed); the person sets their own password, so the admin never knows it. Admins can issue a new link for a pending user and reactivate a deactivated one.
