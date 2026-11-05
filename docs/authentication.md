# Standalone account configuration

Frame uses Better Auth and the Drizzle PostgreSQL adapter. Users, password hashes, linked accounts, sessions, verification records and rate limits stay in Frame's database. Password registration and login work without an external identity service. Optional social providers authenticate an identity; Frame still owns authorization, workspace membership and presentation data.

## Google and GitHub

Add both values for each desired provider to private server configuration:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Set the provider's authorized callback to the exact public application origin followed by `/api/auth/callback/google` or `/api/auth/callback/github`. For the default development origin these are `http://127.0.0.1:5174/api/auth/callback/google` and `http://127.0.0.1:5174/api/auth/callback/github`. Production callbacks use HTTPS. Keep `APP_ORIGIN` consistent across the API, browser and provider settings.

Restart the API after changing configuration. A sign-in button appears only when both values for its provider are set. No client credential or publishable key is required. `/api/auth/config` returns provider names and an email-enabled flag only.

An existing password user must sign in first, then open **Account settings → Manage sign-in methods & sessions → Connect Google/GitHub**. Accounts are not merged merely because their email addresses match. Linking requires the same email address and an authenticated session. OAuth tokens are encrypted using the stable `BETTER_AUTH_SECRET`. Disconnecting a provider requires a fresh session and another remaining sign-in method.

## Verification and password recovery

Configure a verified sender and API key through private server configuration:

```dotenv
RESEND_API_KEY=
AUTH_EMAIL_FROM=
```

When both are present, registration requires email verification. The sign-up screen displays a check-inbox message and a resend control. Sign-in to an unverified account sends another verification link. Verification returns to sign-in; it does not silently create a session.

**Forgot password?** sends a short-lived, single-use recovery link. Successful reset revokes existing sessions. The response is the same whether the email address exists. A provider-only user can use recovery to set a password. Without mail configuration, password registration remains available and recovery is hidden; Frame does not claim to send mail.

Enabling mail on an existing installation also requires previously unverified users to verify on their next sign-in. Confirm delivery with a development account before rollout. The Resend sender/domain must be approved for the addresses you intend to reach. Provider responses and link tokens are never logged; background delivery failures emit the generic event `auth_email_delivery_failed`. There is no durable mail queue or automatic delivery retry; users can request another link after the rate limit permits it.

## Sessions and authorization

Account settings lists active sessions and connected providers. Users can revoke one other session or all other sessions. Password changes also revoke other sessions. HttpOnly cookies identify sessions, and every protected request checks the PostgreSQL session and current workspace membership. Native session responses are not cached in cookies. Authentication requests use same-origin checks and database-backed rate limits; a caller-supplied forwarded IP cannot bypass them.

Keep `BETTER_AUTH_SECRET` stable across API instances and restarts. Never add any of these credentials to `VITE_` variables, Git, build arguments or frontend code. For CDK deployment, see [secret injection](deployment.md).

## Verification

```bash
bun run test tests/auth-parity.test.ts tests/standalone-auth.test.ts tests/standalone-session-contract.test.ts
bun run test:browser --config e2e/account-security.config.ts
```

These checks use real Better Auth and an isolated PostgreSQL database. Only external OAuth and email HTTP transports are intercepted in tests. The browser test follows real verification/reset tokens and tests session revocation, password change and recovery through the existing interface. Live Google/GitHub consent and real inbox delivery require separately configured development credentials; automated tests do not prove those external services are configured.

Official references: [social sign-in](https://better-auth.com/docs/concepts/oauth), [account linking](https://better-auth.com/docs/concepts/users-accounts), [email and password](https://better-auth.com/docs/authentication/email-password), and [session management](https://better-auth.com/docs/concepts/session-management).
