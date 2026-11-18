# Instagram authorization staging

Authorization endpoints are implemented but disabled unless META_AUTH_ENABLED=true.
Publishing remains disabled independently. The desktop UI is not wired yet.

Existing Render values: META_APP_ID, META_CONFIGURATION_ID, PUBLISHING_TOKEN_ENCRYPTION_KEY.
Keep the existing encryption key. Never copy it into chat, the desktop app, or GitHub.

Add these values in Render > sniff-publishing > Environment:
- META_APP_SECRET: copy from Meta App settings > Basic, keep private.
- SUPABASE_URL: https://qmgvzvdqtpwipkgbpxyo.supabase.co
- SUPABASE_SECRET_KEY: server secret from Supabase API Keys; never use browser/anon key.
- META_REDIRECT_URI: https://sniff-publishing.onrender.com/auth/meta/callback
- META_GRAPH_API_VERSION: v27.0 (confirm app supports this version before enabling).
- WORKSPACE_ID: developer
- PUBLISHING_OWNER_KEY: independent random base64 32-byte secret. Keep on Render and trusted desktop backend only; never expose in browser or share in chat.
- META_AUTH_ENABLED: false

Keep PUBLISHING_ENABLED=false. Only enable authorization after the desktop bridge, account verification, and tests are ready. Never open the raw Meta URL with a static state.

The start endpoint requires a bearer owner key and JSON brandId and expectedUsername. Callback consumes the durable state before token exchange; only the exact expected username is stored. Graph account discovery uses the assigned Instagram accounts edge and requires real-account verification. Mock tests are not proof of live Meta permissions.

Render free staging is sufficient for testing authorization, not guaranteed scheduled publishing.
