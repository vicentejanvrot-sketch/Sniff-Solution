# Phase 3 — Automated Publishing configuration

Phase 2 baseline: fbb53fab05a07596a89635a487f6fae29bc78e2e (0.2.5).
Development branch: phase3-automated-publishing.

## Database
The additive db/phase3_publishing.sql foundation was applied to project qmgvzvdqtpwipkgbpxyo on 2026-11-17. Do not reapply on that project. All three tables are backend-only with RLS and no public client grants. Do not add browser access or mandatory application sign-in. For a fresh project install Phase 1/2 schema first.

## Planned server configuration (not yet consumed by the application)
- PUBLISHING_ENABLED=false (fail closed until end-to-end acceptance)
- META_APP_ID: Instagram app identifier
- META_APP_SECRET: server-only
- META_REDIRECT_URI: exact HTTPS callback on the future controlled cloud service
- META_GRAPH_API_VERSION: supported version selected and verified during integration
- PUBLISHING_TOKEN_ENCRYPTION_KEY: securely generated 32-byte key, stored only in server secret manager
- SUPABASE_URL, SUPABASE_SECRET_KEY, WORKSPACE_ID: existing backend configuration

Never commit actual credentials or put them in browser code or workspace exports. The token_ciphertext field is not encryption by itself; implement authenticated encryption and rotation before storing credentials. No credentials have been configured.

## Activation steps
1. Create or select a Meta developer app with Instagram API and an eligible professional Instagram test account. Verify current Instagram Login permissions and app review requirements against Meta documentation.
2. Provision the chosen Render cloud service with a protected OAuth callback and worker. Do not expose the desktop server.
3. Implement OAuth state verification, token exchange, encryption, expiry/refresh and account disconnection.
4. Implement schedule management and approved media snapshot/version checks, including upload of approved local assets into private cloud storage. Convert PNG to JPEG for image publishing. Generate short-lived media URLs only when needed by Meta.
5. Implement transactional job claims and durable container IDs, status polling, publish result recording, bounded retries and reconciliation for ambiguous publish outcomes. Never blindly replay a potentially successful publish.
6. Add calendar, queue, history, connection settings, and notifications to desktop UI.
7. Run automated tests and real-account acceptance, including leaving desktop closed. Enable publishing only after verification.

References:
- https://developers.facebook.com/docs/instagram-platform/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://render.com/docs/background-workers

No live publishing, OAuth, deployed worker, or scheduled cron is enabled by this foundation.
