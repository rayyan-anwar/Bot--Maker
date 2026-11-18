# BotForge launch configuration

This file records the launch decisions and the recommended first deployment path. Real credentials and personal account values belong in the hosting provider's secret manager, not in this public repository.

## Owner decisions

- Custom domain: deferred. Use the hosting provider's generated HTTPS URL for the first staging launch.
- Administrator identity: configure `BOTFORGE_ADMIN_EMAIL` as the owner-provided admin mailbox in the host environment.
- AI providers: support OpenAI, Anthropic Claude, and Google Gemini. Enable each provider only after its server-side API key is added and a live smoke test passes.
- Recovery/support contact: the owner supplied a Gmail address. Keep it as an owner contact/recovery mailbox outside source control. It is not a valid production sender identity for Resend.
- Hosting budget: free for private testing where possible; move to the smallest persistent paid app instance before inviting real customers.

## Hosting recommendation

### Staging / private preview

- Render Free Web Service for the Node.js application.
- Neon Free PostgreSQL for persistent relational data.

This combination avoids an initial hosting bill, but it is **not production-ready**: Render Free services sleep after 15 minutes idle, can take about a minute to wake, have ephemeral local filesystems, and can restart. Neon Free compute scales to zero after 5 minutes and has monthly compute, storage, and transfer limits. Monitor usage and keep independent backups.

### First customer-facing deployment

- Render Starter Web Service (currently listed at US$7/month for the smallest paid web service) to avoid free-tier sleep.
- Neon Launch PostgreSQL, usage-based with no monthly minimum, or another managed PostgreSQL plan with tested backups and restore.
- Keep uploads in external object storage if persistent original-file storage is introduced.
- Add a custom domain only after the service passes staging checks.

The app is a single Node.js/Express service, so deploy it as a Render Web Service, not a static site. Set the build command to `npm ci` and start command to `npm start`. Configure all environment variables in Render's secret/environment settings. Use the generated HTTPS origin for `PUBLIC_BASE_URL` and OAuth callback origins until a domain is attached.

## Required environment configuration

Set these values in the hosting dashboard, not in this file:

- `NODE_ENV=production`
- `JWT_SECRET`: cryptographically random, at least 32 characters
- `BOTFORGE_ADMIN_EMAIL`: the owner-provided admin mailbox
- `BOTFORGE_ADMIN_NAME`: owner display name
- `DATABASE_URL`: Neon pooled PostgreSQL connection string, with TLS enabled
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GEMINI_API_KEY`: add independently when each provider is ready
- `RESEND_API_KEY`, `BOTFORGE_EMAIL_FROM`, `PUBLIC_BASE_URL`: only after a sender domain is verified with Resend
- `TRUST_PROXY=1`: only when the host's reverse proxy is trusted and correctly configured

After setting the administrator email and database, run `npm run admin:create` once using a secure host shell or controlled deployment job. Supply the initial admin password through the documented one-time bootstrap mechanism, then remove the temporary password variable immediately. Never put the admin password in GitHub files, chat, or deployment logs.

## Recovery email clarification

The supplied Gmail address can be used as the owner's contact/recovery mailbox, but it must not be placed in `BOTFORGE_EMAIL_FROM`. Resend requires a sender identity/domain that has been verified with Resend. Customer password-reset links are sent to the email address on the customer's account. The reserved administrator cannot use the public password-reset flow; administrator recovery remains an out-of-band operator action.

## Release gates before public launch

1. Verify the three AI providers independently with real API keys and controlled spending limits.
2. Verify PostgreSQL persistence across deploy/restart and rehearse backup/restore.
3. Verify password recovery with a verified sender domain and real delivery.
4. Configure OAuth credentials with exact HTTPS callback URLs, then test sign-in end to end.
5. Test admin/customer isolation, rate limits, password lockout, uploads, and concurrent usage quotas.
6. Configure payment providers in sandbox before enabling live checkout.
7. Complete browser end-to-end, security, and basic load testing.
8. Add monitoring, error alerts, spending alerts, and an incident/rollback procedure.

Passing GitHub CI alone does not satisfy these production release gates.
