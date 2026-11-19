# Content Research and Comments & messages · 0.4.6

This release extends the existing desktop app and existing Render/Supabase
services. It does not provision a new service, buy a subscription, send messages
automatically, or change existing publication schedules.

## Content Research

Choose a brand and connected Instagram account. Save up to five competitor
professional-account usernames and three industry hashtags, plus a research
focus and any visual observations you made yourself. Choose **Research now**.
Collection uses Meta Business Discovery and Hashtag Search, with a five-minute
cooldown per account. Hashtags require **Instagram Public Content Access** and
are subject to Meta's 30-unique-hashtags/account/rolling-seven-days limit, shared
with other apps. This is a sample of up to 25 posts per target, not a search of
all Instagram or a guarantee of finding viral content. No paid research-data
provider is connected. Discovery is requested on demand, not on a background
schedule.

Public likes/comments/views retain missing values as **Unavailable**. Views may
include paid distribution. Relative interactions divide likes + comments by the
median of at least three other sampled posts from the same source; the ratio is
unavailable with a zero/missing baseline. Post age and audience differ. Repeated
posts are deduplicated. Hashtag videos are labelled video when Meta does not
identify them specifically as Reels. No private competitor retention, saves,
reach or conversion data is available. The app does not download/watch third
party videos or infer unseen camera work, pacing or audio.

**Analyze patterns & draft experiments** queues one paid OpenAI/Claude request
using your configured model and existing text reservation/budget. It analyzes
captions, public metrics and your supplied observations, marks hypotheses and
proposes original experiments. Follow Activity, then **Refresh results**. Review
and edit the analysis. **Use research in new plan** opens a new plan form with
the bounded research snapshot and saved analysis attached. Choose a goal and
dates; all existing text/media approval and publishing safeguards still apply.
Changing the selected brand rejects unrelated research/account links. Collection
keeps the latest 30 research runs locally; created plans retain their own bounded
evidence snapshots. A failed collection never deletes prior runs.

## Comments & messages

Select an account. **Collect recent comments & messages** reads the latest 25
own posts (up to 50 comments each), and 20 conversations (up to 20 recent messages
each). A five-minute account cooldown prevents repeated collection. The saved
inbox shows the latest 500 records and matching reply records; this is not an
unlimited historical import. Errors and partial-collection warnings are visible.
**Refresh saved inbox** downloads stored data without requesting another import.

Inbound messages have conversation context, a manual reply editor and **Draft
suggested reply**. Drafting is a separate paid text request and sends the selected
message plus bounded conversation context and brand facts to the chosen AI
provider. It does not send a reply to Instagram. Drafts stay in Drafts & Review
and appear in the inbox after refreshing. Brand claim rules inform replies;
missing policies/prices must be clarified instead of invented.

**Save draft** saves without approval. **Save & approve reply** approves the exact
text/source version. **Send approved reply** requires a final recipient/text
confirmation. Editing disables Send until saved and approved again. Only inbound
items can receive replies. DM replies must be within the standard 24-hour inbound
window; ad-entry extensions, Human Agent tags, cold outreach and private
comment-to-DM replies are not automated. Reply limits are 1–1,000 characters.
The server rechecks approval, version, source text, account and window. An atomic
database claim prevents duplicate sends. A lost or invalid acknowledgement is
**uncertain** (or remains **sending** after a crash); neither is automatically
retried. Check native Instagram manually in that case.

**Mark for human follow-up**, **Mark handled**, and **Reopen** track owner actions
locally. Use the Human follow-up filter for complaints, refund requests and
sensitive questions. These controls do not send a message. Existing sent records
are retained. Inbox records/replies are stored only in private backend tables;
tokens remain encrypted in the existing account table and never reach the desktop
browser. Workspace backups can contain AI draft/source text and research; handle
them as your business records. Distribution ZIPs exclude all real user data.

## Existing cloud setup

1. Apply `db/engagement.sql` once to the existing project using migration
   management. It adds three private tables with RLS and no anon/authenticated
   grants; only service_role can access them. Preserve all account/publishing data.
2. Deploy merged `main` on the existing Render service. Preserve every existing
   secret and operational flag. Set **ENGAGEMENT_ENABLED=true** after migration.
   The existing Blueprint uses `sync: false` for operational flags.
3. In the existing Unified Login configuration, verify `instagram_basic`,
   `instagram_manage_comments`, and `instagram_manage_messages`. Hashtag Search
   additionally needs Instagram Public Content Access. Missing access produces
   an error/warning instead of fabricated data. Reconnect only if the token lacks
   required permissions. Third-party customers may require Advanced Access,
   business verification, Live mode and Meta App Review.
4. For notifications while the desktop is closed, configure the existing Meta
   app's Instagram Webhooks callback as
   `https://sniff-publishing.onrender.com/webhooks/instagram`. Obtain its verification
   token from the owner-authenticated cloud `/api/engagement/setup` endpoint; do
   not expose the owner key in a browser or share the token in chat. The token is
   derived separately from the app secret and does not grant inbox/API access.
   Configure the `comments` and `messages` fields and enable notifications for the
   connected account following Meta's setup guide. Do not replace another
   application's webhook subscription without checking its existing configuration.
5. GET verification checks mode/token/challenge. POST events require the exact
   raw-body `X-Hub-Signature-256` HMAC using the existing app secret, size limits,
   and connected-account matching. Duplicate events upsert by stable source ID;
   outbound echoes are ignored. Successful HTTP acknowledgement follows durable
   storage. Missing permission/app approval may prevent delivery. Manual recent
   collection remains available. The current free Render instance may sleep;
   always-on reception requires an appropriately provisioned existing service.

## Acceptance and verification

- Travel One is the first intended live test brand. Configure relevant industry
  hashtags/usernames in its watchlist; do not treat another account as a competitor
  solely because it appeared in a search sample.
- Collect public evidence, check original post links and missing metrics, request
  analysis, edit/save it, and create a plan with a future date. No publication or
  media generation may occur from those actions alone.
- From a separate Instagram account send a genuine test DM/comment. Collect it
  (or verify signed webhook delivery once subscribed), draft/edit a reply, approve
  it, and use Send only when you intend that exact reply to reach that recipient.
  Verify native Instagram receives one reply. Automated tests mock all sends.
- Test an edited approval, a closed DM window, another brand/account, denied
  permissions, a failed save, duplicate clicks and a lost acknowledgement. They
  must preserve records and prevent unintended sends.
- `test/engagement.test.mjs` verifies backend scoping, collection, null metrics,
  cooldown, signatures, approval/version/source checks, atomic send claims and
  uncertainty. `test/growth-browser.cjs` verifies research → AI → new plan and
  inbox → draft → approval → explicit mocked send, error preservation and mobile
  layout. CI and Windows full-ZIP verification include all new application files.

Primary API references:
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions
- https://developers.facebook.com/documentation/instagram-platform/comment-moderation
- https://developers.facebook.com/documentation/instagram-platform/webhooks/setup
- https://developers.facebook.com/documentation/instagram-platform/webhooks/fields
- https://developers.facebook.com/documentation/business-messaging/instagram-messaging/changelog/
