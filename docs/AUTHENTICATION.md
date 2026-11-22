# Authentication

Email and password through the official Supabase browser client. One working
method for this milestone; social sign-in is not enabled because no provider is
configured.

## What is implemented

| Flow | Behaviour |
| --- | --- |
| Create account | Email + password (minimum 8 characters). With confirmation enabled, the app says "open the confirmation email, then sign in here" instead of pretending the student is signed in |
| Email confirmation | The link lands on `/auth/callback`, which renders a short page and returns to the app with the link intact so the client can exchange the code. The rate-limited "resend confirmation" action is available from sign-in |
| Sign in | Clear errors for wrong password, unconfirmed email, unknown account, rate limiting and network failure |
| Password recovery | "Forgot password?" sends a single-use link to `/auth/reset`; the app then asks for a new password through `auth.updateUser` |
| Session restoration | The SDK persists the session and refreshes its token. On load the app restores the session; a restored session is what makes cross-device continuation work |
| Session expiry | A refresh failure or a sign-out after a session is shown as "Session expired — sign in again to sync"; the study tools keep working with the cached copy |
| Sign out | Clears the account cache for that user, drops the in-memory remote store and returns to guest mode. One account's records are never shown to the next |

Authentication code lives in `src/client/core/auth.js` and never touches the DOM.
The SDK is loaded lazily, pinned to an exact version and verified with a
Subresource Integrity hash (`npm run check:sdk` re-computes it). If the download
fails, the app stays in guest mode and says why.

## Configuration

```
SUPABASE_URL=https://<project-ref>.supabase.co        # public
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...           # public (legacy anon JWT also accepted)
```

Only these two values reach the browser. See [Setup](SETUP.md) for where to set
them. The service-role key must never be used as the client key.

## Supabase dashboard settings

1. **Authentication → Providers → Email**: enabled.
2. **Confirm email**: enabled for production. For a quick local test you may
   disable it, but then the "check your email" path is not exercised.
3. **URL Configuration → Site URL**: your origin, e.g. `https://study.example`.
4. **Redirect URLs**: add exactly
   ```
   http://127.0.0.1:3000/auth/callback
   http://127.0.0.1:3000/auth/reset
   https://<your-domain>/auth/callback
   https://<your-domain>/auth/reset
   ```
   Supabase only redirects to an allow-listed URL; a missing entry shows up as a
   link that goes nowhere. Wildcards are not used here, so each origin is listed.
5. **Password**: minimum length 8 to match the client-side check.

## Email delivery in production

Supabase's built-in email sender is rate-limited and intended for testing. Before
real students sign up you need a mail provider:

1. Authentication → Settings → SMTP: configure a transactional provider
   (for example Resend, Postmark, SES or your institution's SMTP) with a verified
   sending domain. Keep the password as a Supabase secret, not in this repository.
2. Adjust the **Confirm signup** and **Reset password** email templates if you
   want your own wording. Leave the confirmation link pointing at
   `{{ .ConfirmationURL }}`; that URL performs the redirect into `/auth/callback`.
3. Check the rate limits (Authentication → Rate Limits) against your expected
   signups, and raise the "emails per hour" limit only as far as your provider
   allows.
4. A custom domain or proxy must allow the auth redirect paths above.

Without SMTP, sign-up still creates the account, but students will not reliably
receive confirmation or recovery mail.

## What is not implemented

- Social/OAuth sign-in (no provider configured).
- Multi-factor authentication.
- Changing an email address (the UI does not offer it; the database would accept it).
- The admin/import APIs use a separate token, not a student session, by design.
