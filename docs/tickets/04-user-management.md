# 04: User management

**Parent:** docs/specs/01-phase-1-core-app.md (UI details: docs/specs/02-phase-1-web-ui.md)
**Status:** ready-for-agent
**Blocked by:** 03 (First-run setup, login and sessions)

## What to build

The admin can bring other people into the instance and remove their access, and every user can manage their own password.

- Admin screen listing users with role and status.
- Admin creates a user or generates an invite link; the invitee opens the link and sets their own password, so the admin never knows it.
- Admin deactivates a user; deactivated users cannot log in and existing sessions stop working.
- Any user can change their own password in settings.
- Admin-only endpoints and pages are guarded; non-admins cannot see or reach them.

## Acceptance criteria

- [ ] An admin can create a user or an invite link and see them in the user list.
- [ ] An invite link can be used once to set a password and is invalid afterward and after expiry.
- [ ] A deactivated user cannot log in and their active sessions are rejected on the next request (API test).
- [ ] A regular user receives a forbidden response from admin endpoints and the admin navigation is hidden for them.
- [ ] Changing a password requires the current password and invalidates other sessions for that user.
- [ ] There is no way to register without an admin-created account or invite.
- [ ] UI tests cover user list, invite creation, deactivation and password change against the MSW mock.
