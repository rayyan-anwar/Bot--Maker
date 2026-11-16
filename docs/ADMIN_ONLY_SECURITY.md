# BotForge single-administrator security

BotForge is configured as a private, single-administrator application. There is no public user registration and no self-service role assignment.

## Initial setup

1. Set `JWT_SECRET` to a unique random secret of at least 32 characters.
2. Set `BOTFORGE_ADMIN_EMAIL` to the one administrator email.
3. In a secure server shell, set `BOTFORGE_ADMIN_PASSWORD` to a unique password of at least 16 characters (up to 128), then run `npm run admin:create`.
4. Immediately unset `BOTFORGE_ADMIN_PASSWORD` from the shell environment.
5. Start the application and sign in at `/index.html`.

The bootstrap command refuses to create a second account. The public signup API always returns 403. All application pages and authenticated API routes require the configured administrator session. The admin dashboard separately checks the configured administrator identity.

## Login lockout and recovery

Three consecutive incorrect password attempts lock the administrator account. Correct password attempts cannot bypass a lock. To reset, set `BOTFORGE_ADMIN_NEW_PASSWORD` temporarily in a secure server shell and run `npm run admin:reset-password`; then immediately unset that variable. This updates the password hash and clears the lockout counter. Do not put live passwords in source control, chat, tickets or deployment logs.

## Session and interface security

- Session cookies are HttpOnly, SameSite=Strict and Secure in production.
- Session lifetime is eight hours.
- Admin dashboard supports dark and light themes; theme preference is stored in that browser only.
- Admin routes verify the configured single admin identity server-side. Hiding UI controls is not treated as authorization.
- Keep the app behind HTTPS, restrict server and database access, rotate secrets after suspected exposure, and back up the database securely.

## Scope note

This configuration intentionally removes customer accounts and public bot sharing. It makes this installation owner-only. If BotForge is later offered as a multi-customer SaaS, implement tenant isolation and a separate operator/admin control plane rather than re-enabling public signup in this single-admin deployment.
