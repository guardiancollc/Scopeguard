# ScopeGuard native mobile preparation

Status: scaffold only; **not a distributable App Store or Play Store build**.

ScopeGuard currently runs on Vercel with serverless `/api/*` endpoints. Simply copying the static pages into a native WebView would break relative API calls, authentication redirects, and subscription checkout. Do not ship a wrapper pointing at a Preview deployment.

## Release approach
1. Keep the Vercel API as the authenticated backend; define a production API base URL only after production approval.
2. Create a native mobile client using Capacitor (or equivalent) with bundled local assets, native deep links, and secure session handling.
3. Audit all `/api/*` calls, auth redirect URLs, uploads, PDFs, email OAuth, and service-worker behavior under `capacitor://localhost` and `http://localhost`.
4. Implement native iOS and Android compliant subscription purchasing, or document and verify an applicable platform exception before submitting.
5. Implement authenticated account deletion, data retention handling, and privacy policy/support URLs.
6. Generate and test actual Xcode and Android Studio projects; sign only using developer-controlled credentials.
7. Test physical devices and TestFlight/Play internal tracks before store submission.

## Publisher
Individual account: Anthony Caceres. Never commit Apple credentials, certificates, Android keystores, or reviewer passwords.

## Current blocking items
- Apple enrollment pending; Google Play account not yet established.
- No native iOS/Android project generated or signed.
- Existing web Stripe checkout is not an approved mobile purchase implementation.
- Account deletion and public privacy/support URLs remain unverified.

The existing web app and billing are unchanged. All preparation is Preview branch only.
