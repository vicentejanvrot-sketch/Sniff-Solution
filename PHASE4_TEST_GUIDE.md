# Phase 4 · v0.4.0

## Install the complete Windows update

Use the GitHub Release asset **Sniff-Solution-Windows-Full-App-0.4.0-&lt;commit&gt;.zip**. The source archive is not the runnable distribution.

1. Quit Sniff Solution from its tray menu. Closing the browser leaves the old server running. Let active work finish.
2. Extract **all** ZIP contents over the existing app folder and replace application files.
3. Run **START_SNIFF.cmd** from that folder. It refreshes the desktop and Start menu shortcuts to that exact copy.
4. Confirm **v0.4.0** in the header/sidebar and the build commit against build-info.json. Reopen through the refreshed shortcut.

The ZIP contains the launcher, app, Node.js, Python, FFmpeg and FFprobe. Real `.env`, `.data`, API keys and user files are excluded. Overwriting app files preserves desktop records/settings in `%LOCALAPPDATA%\SniffSolution` and existing checkout `.env`/`.data`. Retain the same publishing owner key, encryption key, workspace and cloud service.

## Daily planning acceptance

1. Open **Content Planner → New content plan**. Choose a brand, title, goal, IANA time zone and one to seven explicit posting dates/times. Choose image or Reel for each day; Reels support one 5 or 10 second clip. Save. This makes no paid call or publication.
2. Configure an existing OpenAI or Claude text model/key. Select the text model and **Prepare unfinished days**. Confirm the stated number of text requests/reservations. Follow Activity or **Refresh results**. Each day gets its own title, purpose, creative brief, optional single-line on-screen text and actual Instagram caption.
3. Edit a day and **Save for review**, or **Save & approve day** after checking claims, caption, scenes and timing. **Regenerate this day** makes one new paid text request; earlier versions remain in **Previous versions**. Active requests and publication-linked days reject edits. Malformed/truncated outputs never replace saved text and retain billing reservations for reconciliation. No billed request is automatically retried.
4. Open the approved day's **Image Studio** or **Video Studio**. Check the carried brief, caption, aspect ratio and Reel duration. Planner video briefs skip the separate text-preparation step. Edit content in the planner and reapprove it; the studio protects those saved fields. Optional overlay text is loaded separately, with brand overlays enabled when present; review the rendering font/options before generation.
5. Select **Start production** to make a separate paid media request. Approve the finished asset in **Media Library** after checking the actual result. The planner approval does not approve generated media.
6. Return to the plan and refresh. Select an approved finished output and connected account, then **Create local schedule**. Check the exact caption, planned local time and time zone in Publishing Calendar. No live cloud activation happens here.
7. If you intend to publish, use the existing explicit **Activate live publishing** flow on that individual post. Confirm status/history afterwards. Never activate test content unintentionally.
8. Refresh planner progress to follow generation, media review, scheduling and publication. Editing a day creates a new version; existing media remains stored under its previous version. Cancel a local schedule before editing its day. Published/history records remain protected.
9. Export a plan, restart the app and verify dates, text, reviews and links remain. Existing Phase 1–3 records and keys must still be present.

## Existing cloud analytics setup

No additional licensed service or new cloud instance is required. This extends the existing publishing service; it does not provision Render resources or change publication activation.

1. Apply **db/phase4_insights.sql** once to the existing Supabase project using migration management. It adds one private RLS-enabled, service-role-only cache table and preserves existing data. Do not grant browser access.
2. Deploy the merged Phase 4 revision of `cloud/publishing-server.mjs` and `lib/` to the existing Render publishing service. If that service still tracks `phase3-automated-publishing`, point it to `main` or explicitly deploy the merged revision. Preserve all existing environment values. Add **INSIGHTS_ENABLED=true**. Set false to stop collection without deleting observations or changing publishing.
3. In the **existing Facebook Login for Business / Unified Login configuration**, include **instagram_manage_insights** alongside the current required account/publishing permissions. Facebook Login configurations may additionally require `pages_read_engagement`; business-role arrangements can impose further requirements. Retain the current login method. Do not substitute the Instagram-Login-specific `instagram_business_manage_insights` scope.
4. Reconnect the exact account through **Social Accounts** if the existing token lacks access. Owner-managed test accounts can use the app's permitted access level; serving other customers may require Meta review/Advanced Access. Do not share tokens, app secrets or owner keys.
5. In **Performance**, select an account, **Request Instagram refresh**, wait, then **Refresh saved results**. The first action requests collection on the cloud; the second downloads saved observations to the desktop. Check last attempt/success/error and next background attempt. Missing access should give a reconnect/configuration message, never fabricated metrics.

The worker collects at most once per six hours per account automatically, with a five-minute manual cooldown and a database compare-and-swap claim. One account is checked per worker tick. Publishing is checked first. The existing signed Cron wake also starts a due analytics check. Collection only runs while Render is awake; a free sleeping service is not an always-on guarantee. No new Cron job is required.

## Analytics acceptance

- Compare a known published image and Reel against Instagram Insights, allowing for processing delays (up to 48 hours), capture time, organic versus promoted surfaces and metric definitions.
- Verify views, reach, likes, comments, saves and shares where returned; an unavailable metric must show **Unavailable**, while a returned zero stays **0**.
- Post metrics are lifetime totals at capture time. Date filters select posts by their publication date in UTC. Repeated daily snapshots must not inflate totals.
- Account views/reach/interactions cover the labelled completed UTC day. Followers are the count observed at capture time. Missing days are gaps, not zero. Account history starts with collection; no full historical backfill is implemented.
- Confirm brand/account filters, format means, posting-hour observations, per-post engagement calculation and CSV export. Post reach summed across posts is not deduplicated account reach. Incomplete inputs must produce an unavailable engagement rate.
- Collection covers the 20 most recent confirmed **Sniff-published** posts per account within 90 days. External/manual Instagram posts, Stories, carousels, ads, demographics and conversion attribution are not imported in this release.
- Daily snapshots retain prior days for up to a year, with an 8,000-observation/account cap. Same-day refresh replaces that day's observation. Expired tokens, unavailable metrics, rate limits and storage failures preserve previous successful data and show an error or missing value.
- Evidence-informed planning uses at most ten latest unique posts for the same brand, with captions, formats, capture/publication times and metrics. Small samples, different post ages and observational associations do not prove causation. Recommendations never modify approved content or publishing automatically.

## Automated verification

`npm run check`, `npm test`, and `python -m unittest discover -s tools -p 'test_*.py'` cover syntax, storage, billing, planner review/version checks, exact production handoff, local scheduling, private metric collection, missing data, throttling and report calculations. CI also runs `test/browser-smoke.cjs` and `test/phase4-browser.cjs` with isolated Playwright dependencies and mocked paid providers. Windows CI verifies the actual full ZIP, bundled runtimes, launcher, shortcuts, restart and overwrite preservation.

Automated tests do not spend provider credits or certify a live Instagram Insights permission grant. Real-account comparison, text quality, generation quality and publication remain owner acceptance checks.

References: [Meta Insights permissions](https://developers.facebook.com/documentation/instagram-platform/insights), [media metrics](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights), [account metrics](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights).
