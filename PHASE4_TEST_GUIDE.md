# Phase 4 · v0.4.7

## Install the complete Windows update

Use the GitHub Release asset **Sniff-Solution-Windows-Full-App-0.4.7-&lt;commit&gt;.zip**. The source archive is not the runnable distribution.

1. Quit Sniff Solution from its tray menu. Closing the browser leaves the old server running. Let active work finish.
2. Extract **all** ZIP contents over the existing app folder and replace application files.
3. Run **START_SNIFF.cmd** from that folder. It refreshes the desktop and Start menu shortcuts to that exact copy.
4. Confirm **v0.4.7** in the header/sidebar and the build commit against build-info.json. Reopen through the refreshed shortcut.

The ZIP contains the launcher, app, Node.js, Python, FFmpeg and FFprobe. Real `.env`, `.data`, API keys and user files are excluded. Overwriting app files preserves desktop records/settings in `%LOCALAPPDATA%\SniffSolution` and existing checkout `.env`/`.data`. Retain the same publishing owner key, encryption key, workspace and cloud service.

## Daily planning acceptance

1. Open **Content Planner → New content plan**. Choose a brand, title, goal, IANA time zone and one to seven explicit posting dates/times. Choose image or Reel for each day; Reels support one 5 or 10 second clip. Save. This makes no paid call or publication.
2. Configure an existing OpenAI or Claude text model/key. Select the text model and **Prepare unfinished days**. Confirm the stated number of text requests/reservations. Follow Activity or **Refresh results**. Each day gets its own title, purpose, creative brief, optional single-line on-screen text and actual Instagram caption.
3. Edit a day and **Save for review**, or **Save & approve day** after checking claims, caption, scenes and timing. **Regenerate this day** makes one new paid text request; earlier versions remain in **Previous versions**. Active requests and publication-linked days reject edits. Malformed/truncated outputs never replace saved text and retain billing reservations for reconciliation. No billed request is automatically retried.
4. Open the approved day's **Image Studio** or **Video Studio**. Check the carried brief, caption, aspect ratio and Reel duration. Planner video briefs skip the separate text-preparation step. Edit content in the planner and reapprove it; the studio protects those saved fields. Optional overlay text is loaded separately, with brand overlays enabled when present; review the rendering font/options before generation.
5. Select **Start production** to make a separate paid media request. Approve the finished asset in **Media Library** after checking the actual result. The planner approval does not approve generated media.
6. Return to the plan and refresh. Select an approved finished output and connected account (sole valid options are selected automatically). Review the saved caption, time and time zone, then choose **Schedule & activate**, or **Schedule & activate ready posts** for the ready days in this plan. This authorizes automatic public Instagram publishing at the saved times; it creates the schedule and activates it in the cloud without another calendar step.
7. Confirm the planner reports **scheduled for automatic publishing**. Existing local schedules from older versions can be activated here without repeating the dates or creating duplicates. Already activated posts are disabled and excluded from the ready-post action. **Refresh results** checks cloud status for activated posts. Use Publishing Calendar for changes/history if needed; no visit there is required for normal planner scheduling.
8. Refresh planner progress to follow generation, media review, scheduling and publication. Editing a day creates a new version. Changes to date/time, working title or internal purpose preserve compatible earlier outputs; actual creative-copy changes still require matching reviewed media. Cancel a local schedule before editing its day. Published/history records remain protected.
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

Live setup verification on November 18, 2026: the existing Supabase project received
`phase4_private_instagram_insights`; RLS is enabled, anon/authenticated access is
revoked, and only the backend role has data access. The existing Render service
now deploys `main` with `INSIGHTS_ENABLED=true`. The existing account connection
successfully collected one account-day and seven published-post observations
without permission errors or warnings. No new service, credentials or account
permission grant was needed. These initial post metrics were returned as zero;
they are observations, not proof that Instagram has finished processing them.
Compare later captures with the same posts in native Instagram Insights.

The Blueprint follows `main` and tests Insights alongside publishing. Operational
flags use `sync: false` so later Blueprint syncs preserve values set in Render.
For a fresh service only, set those flags deliberately after its setup checks.

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


## Speech-to-text acceptance (0.4.1)

In Content Planner → New content plan, type part of a campaign goal, select **Dictate**, speak and select **Stop dictation**. Confirm speech appends to your original words. Repeat for a saved day's creative brief and caption; only that day's field may change. Check Brand Studio long-text fields, a Content Skill brief, Drafts & Review content, prepared video briefs, media review captions and Publishing Calendar captions. Read-only/locked fields must have no usable Dictate control. Speech must stop on navigation, form submission, dialog closure or field locking. Denied microphone access must leave your text intact and explain how to recover. Unsupported browsers should offer Win+H. Speech follows your browser language; language translation is not included. Test on your real microphone/browser after updating; automated browser tests use simulated recognition and never record real audio.


## Model choice and saved-output recovery (0.4.2)

- In Video Studio, choose **Generation model** before Start production. The integrated Higgsfield production adapters are Seedance 2.0, Seedance 2.5, Kling 4.0, Kling 3.0 Standard, Kling 3.0 Pro and Kling 2.6 Pro. All app adapters currently expose reviewed 5/10-second clips in 1:1, 9:16 or 16:9. Native provider capabilities may be wider. The model details show requested resolution and audio behavior; Kling 3.0/2.6 use their native defaults. Access and actual charges depend on your API account. This is a documented compatibility list, not live account entitlement verification or the entire Higgsfield website catalog.
- In Image Studio, the provider is OpenAI. **Load models from OpenAI** reads the account's /v1/models catalog and filters GPT Image IDs. Select the desired model before production. The previously configured model remains selectable if discovery fails or omits it. Listing a model does not guarantee permissions for every operation. No Higgsfield image adapter was added. Discovery makes no generation request.
- Both choices are saved in each Activity request. Settings retains the default image model and lets you select a default supported video model. Verify the correct provider/model in Activity after submitting a test; automated adapter tests use mocked services, not billed live generations.
- Calibri includes bitmap glyphs at some small sizes. FFmpeg now requests outline glyphs explicitly, fixing the reproduced branded-video failure without changing the font, overlay text, original video or other brand options. Real Calibri regression runs where that Windows font and FFmpeg are present; user fonts are never packaged.
- For a failed/interrupted rendering job with a saved original, choose **Activity → Finish saved output**. It queues one unfinished original at a time as a new **local / FFmpeg** job with zero reservation/provider cost. Existing paid billing records, request IDs and originals remain intact; no new provider request is made. Review and approve the new final output. Planner links are carried forward under their original version. Active duplicates and already finished originals are rejected. If a batch has multiple unfinished originals, repeat after each local render completes.

Model schemas verified against the [Higgsfield production catalog](https://open.higgsfield.ai/explore/video) and each integrated model's API reference on 2026-11-18; account model discovery follows the [OpenAI model-list endpoint](https://developers.openai.com/api/reference/resources/models/methods/list). Actual provider acceptance, output quality and billing remain real-account checks.


## Direct scheduling and activation (0.4.3)

The new planner action reuses saved local time, IANA time zone, approved caption and media version. No new service, cloud deployment, API key or generation is required; it uses the existing publishing staging/enqueue API. Only a deliberate Schedule & activate action sends posts to cloud publishing. Merely saving or approving a plan or installing the update never activates it. Existing Calendar-only scheduling and activation still work.

- Test three approved days (two Reels and an image). Verify a single ready-post action activates them all with the saved times/accounts and leaves the user in Content Planner. Multiple media/account choices require an explicit selection; only sole valid choices are automatic. Unsaved changes must be saved and approved before scheduling.
- Test schedules created by an older version: reuse their exact IDs and publication snapshots. Do not create replacements or reset posting dates. Requests are serialized locally; concurrent/double submissions cannot stage the same post twice.
- Each post has an individual result. A partial batch keeps successful activations and reports failures; active/uncertain posts are excluded from subsequent ready-post actions. If activation acknowledgement is uncertain, choose **Check activation status**. This reads the existing cloud queue without restaging or enqueuing again. A missing cloud record does not authorize a blind retry.
- Cloud/network failures preserve the schedule and show an error instead of claiming success. A local media-conversion failure before cloud contact leaves the post local and retryable after fixing the media/renderer. Validate media approval/version, brand/account ownership, future time and plan revision before activation.
- Confirm no public posting occurs during automated testing. Integration and browser tests mock the publishing service; real-account publication is the owner's acceptance check.


## Preserve media after posting-time edits (0.4.4)

Earlier builds matched generated media only by the plan's numeric version. Saving a different posting time increased that version and made already-approved files disappear from the output selector. The files and approvals were still stored. This release uses the retained approved-day history and immutable production snapshot to verify compatible content instead. The browser and scheduling API apply the same matching rule.

- Produce and approve an image/video, change only the posting date/time, then Save & approve day. The existing approved output must remain selectable, retain its media approval and schedule at the new time without another generation/render job. Older records are handled on read; no data rewrite or approval reset occurs.
- Working-title/internal-purpose edits do not alter pixels. Changes to the actual creative brief, public caption, on-screen text, aspect, duration or media format must not silently reuse incompatible outputs. Brand, plan and day ownership remain checked.
- An approved provider original is not a finished rendered output. A failed render with its original saved offers **Finish saved output** directly in the planner. This queues local rendering, preserves the original/provider billing record and keeps the day link. Review and approve the new final output; it then appears in Approved output.
- If a planned time has already passed, choose a future time at least two minutes ahead and save/approve the change before activation. The compatible media remains available. Existing activated schedules remain immutable through the plan editor; use the existing cancellation/editing policy.

## Content research and reviewed inbox (0.4.6)

See [RESEARCH_INBOX_GUIDE.md](RESEARCH_INBOX_GUIDE.md) for competitor/hashtag collection, bounded AI analysis, new-plan handoff, comments/DM collection, exact reply approval/send, human follow-up, Meta permissions and signed webhook setup.
