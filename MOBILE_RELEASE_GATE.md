# ScopeGuard mobile store submission gate (October 27, 2026)

Status: NOT READY TO SUBMIT. Preview-only preparation. No production changes authorized.

## Confirmed
- Web app deployed through Vercel; billing sandbox recovery and renewal verified against Stripe and Supabase.
- Existing project is a responsive web/PWA with a service worker and manifest, not an Xcode iOS archive or Android App Bundle.
- No iOS/Android native projects or signing assets are in this repository.
- Current paid plan purchase is through Stripe Checkout in api/billing-checkout.js.

## Release blockers
- [ ] Confirm Apple Developer Program and Google Play Console access and the legal publisher identity.
- [ ] Choose mobile packaging strategy; build and sign real iOS and Android binaries. A plain website wrapper may be rejected for insufficient native utility.
- [ ] Resolve platform billing compliance: determine applicable Apple/Google rules by storefront, audience, and distribution, and implement required in-app purchase / billing or permitted exception. Do not assume web Stripe checkout can simply be reused in both apps.
- [ ] Implement/test authenticated mobile flows, session persistence, photo capture/upload, PDF downloads/sharing, navigation, and account deletion.
- [ ] Validate mobile permissions and full user workflows on physical iPhone and Android devices.
- [ ] Provide publicly accessible privacy policy, terms, support URL, and complete accurate privacy/data safety declarations.
- [ ] Supply store icons, launch imagery, device screenshots, descriptions, age/content ratings, and reviewer/demo credentials.
- [ ] Configure bundle/application IDs, certificates/keystores, and platform signing; create store records.
- [ ] Submit binaries to TestFlight/internal testing, address crashes and store feedback.
- [ ] Obtain explicit approval before any Production release or store submission.

## Important
Apple App Review Guidelines 3.1, 4.2, 5.1:
https://developer.apple.com/app-store/review/guidelines/
Google Play payments policy:
https://support.google.com/googleplay/android-developer/answer/9858738

Do not commit credentials, signing keys, or test account passwords to GitHub.
