# Sniff Solution 0.3.0-beta.2 — Publishing Calendar

**This beta only schedules locally. It does not publish to Instagram. Keep `PUBLISHING_ENABLED=false` in Render.**

## First-time setup
1. Install the complete Windows beta ZIP by closing the Sniff Solution tray app and extracting the full ZIP over the app directory. Do not replace the user's local AppData storage or .env.
2. Verify version `v0.3.0-beta.2`, and that the previously connected `@travelonepro` remains visible in **Social Accounts**.
3. Select **Travel One** as the active brand.
4. In **Media Library**, choose a suitable JPG, PNG or MP4 and mark it **Approved** in Preview. Approval is required. Optionally approve a text draft in **Drafts & Review**.

## Calendar acceptance checklist
1. Open **Publishing Calendar** and switch Month → Week → Day.
2. Use the previous/next arrows and Today button; switch between brands using the top header.
3. Select **Schedule post**, choose Travel One, the connected `@travelonepro` account, an approved media asset, and optionally an approved draft.
4. Set a future time (e.g., tomorrow 10:30), time zone `America/Edmonton`, caption and relevant hashtags. Save the post.
5. Verify the publication appears in the correct calendar day and the queue with **Scheduled** status.
6. Restart Sniff Solution; verify it persists.
7. Open the publication, edit its caption and schedule. Verify the changed date and text.
8. Confirm that a scheduled media asset cannot be re-reviewed or deleted in Media Library, and a scheduled approved draft cannot be edited/deleted, until the publication is cancelled.
9. Cancel the publication with confirmation. Verify its status is **Cancelled** and that its media review can be edited again.
10. Open **Settings & Costs → Backup** and verify the exported JSON has a `schedules` array.

## Safety and known limitations
- This release does not send media, schedule cloud jobs, or start the Instagram publishing worker.
- No posting will occur even if the scheduled time passes; scheduled records remain scheduled until a later, separately tested release enables publishing.
- Calendar uses browser-rendered local dates from schedule records. The time zone is saved with every item and validated on the server; DST gap/overlap times are refused.
- Assets must be approved JPEG, PNG or MP4 from the same brand. Rejected/unapproved assets cannot be scheduled.
- Connecting/disconnecting accounts happens in Social Accounts, not this calendar.
- If the account list fails to load, check the local `PUBLISHING_OWNER_KEY` and Render authorization status without exposing any secrets.
- Render can remain on its existing plan; only local scheduling is implemented.
