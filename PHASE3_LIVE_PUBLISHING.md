# Phase 3.4 — Live Instagram publishing (v0.3.0-beta.3)

Phase 3.3 schedules remain local. This release adds **explicit per-post cloud activation**. Nothing already on the calendar becomes live without the owner's separate click. This protects existing test schedules.

## Instagram account

Use the connected Travel One Pro Instagram professional account (`@travelonepro`) in **Social Accounts**. The cloud publisher reads its encrypted access token from the existing restricted Supabase table. Never paste a token or owner key into the browser, GitHub, or ChatGPT.

## Before enabling live publishing

1. Verify [Sniff Solution Phase 3.4 GitHub Actions](https://github.com/vicentejanvrot-sketch/Sniff-Solution/actions) tests and the beta.3 full Windows ZIP.
2. Confirm the existing Render environment contains `META_AUTH_ENABLED=true`, the existing Graph version and app secret, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLISHING_TOKEN_ENCRYPTION_KEY`, `WORKSPACE_ID=developer` and `PUBLISHING_OWNER_KEY`. Do not regenerate encryption or owner keys; doing so can disconnect existing credentials.
3. Keep the existing **private** Supabase Storage bucket `marketing-media`. The publisher stages user-approved JPEG/MP4 in `developer/publishing/<publication-id>`; Supabase signed links expire in one hour.
4. After verifying the new Render deployment and the controlled account connection, set **`PUBLISHING_ENABLED=true` on the Render service**, save and deploy. `/healthz` must return `publishingEnabled:true`. No existing local schedule is activated by this setting.
5. **Always-on worker**: Render Free services spin down; therefore automatic delivery on Free is **not reliable**. Use an always-on service or an independently configured authenticated scheduler before relying on unattended posting. Review any cost change before upgrading.
6. In Sniff desktop **Publishing Calendar**, create an approved post with a future date and time (at least two minutes ahead), select the connected account, and save. This is still a *local* schedule.
7. Open the scheduled post and click **Activate live publishing**, then confirm the public Instagram action. This stages its content privately and creates a durable Supabase `marketing_publish_jobs` record. The account owner alone triggers activation.
8. Use **Refresh cloud publishing status** to see Published, Cancelled, or Needs reconciliation. Published entries include Instagram media IDs in the local record. Do not click Activate again if cloud response is uncertain.

## Supported media and safety

- JPEG and PNG still images are normalized with FFmpeg to a 1080 × 1350 JPEG feed image. This **may add margins**, not crop content. Review the source media before activating.
- MP4 video publishes as an Instagram Reel; Meta must finish processing the container before it can be published.
- A cloud job is claimed only once (status and attempts checked). Unknown Meta outcomes are marked **needs_reconciliation**. No automatic retry after an ambiguous publish response.
- Cloud activation requires matching connected account, brand, approved version and future UTC time. Cancellation is only available **before** the job is claimed.
- API credentials stay on the desktop server or protected Render/Supabase services; the desktop web interface cannot read encrypted account tokens.
- The app never autonomously activates historical beta.1 or beta.2 schedules.
- Instagram content may be publicly visible even if others do not know the username. Check the account's privacy and audience before confirming activation.
- Publishing history is durable in `marketing_publish_jobs` and `marketing_publish_events`.
- If `needs_reconciliation` appears, manually inspect Instagram for the media before trying again; never blindly retry.

## Alberta time-zone update

On November 1, 2026, Alberta adopted **Alberta Time (UTC−06:00 permanently)**. The time-zone dropdown supports IANA locations and explicitly shows `America/Edmonton — Alberta Time (UTC−06:00 permanent)`. The current-clock helper and server-side UTC converter account for older time-zone data. An 07:50 Calgary/Edmonton time on November 19, 2026 corresponds to **13:50 UTC**, not 14:50 UTC. Existing schedules retain their explicit UTC `scheduledAt` until edited.

Sources: https://www.alberta.ca/albertas-new-time-system-abt and https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca
