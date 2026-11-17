# Sniff Solution 0.1.6 — update and acceptance tests

This is a local, single-owner Phase 1 release. Run the checks below on your Windows PC after updating. Tests that generate AI content use your configured API account and may incur charges; manual drafts, previews and editorial tools do not make AI requests.

## What changed in 0.1.6

1. Perplexity requests explicitly enable `web_search`, including when you enter a direct provider/model ID instead of an effort preset. Existing Sonar-to-effort mappings are preserved.
2. Trend research offers only Perplexity. The backend also rejects OpenAI/Claude for this workflow before queuing or reserving money. Other workflows and website brand suggestions retain their existing provider choices.
3. A trend response with no returned search-source URLs is saved as a draft needing review. Its Activity request is `incomplete`, with a specific explanation. It is never labelled completed research just because text was returned. Source URLs establish provenance, not the truth or recency of every claim; review dates and evidence yourself.
4. The draft editor explains that drafts needing review may have missing sources or truncated output.
5. Regression tests cover explicit web-search configuration, provider restrictions, missing/supplied sources and generation through all thirteen workflows. This guide and AGENTS.md are included in the complete ZIP.

## 1. Update the correct app folder

1. Download the **Windows Full-App ZIP** from the latest GitHub Release. Do not choose the release's Source code archives or GitHub Code > Download ZIP.
2. Right-click Sniff Solution's tray icon beside the Windows clock and choose **Quit Sniff Solution**. Closing the browser does not stop it.
3. For a backup, copy `%LOCALAPPDATA%\SniffSolution` to a safe folder after quitting. If you previously ran from source, preserve that folder's `.env` and `.data` too; those are a separate profile.
4. Extract **all** ZIP contents over the intended application folder, replacing application files. Do not delete your data/configuration folders.
5. Run **START_SNIFF.cmd** from that folder. It updates the shortcuts to that exact location. If another copy is still running, follow the prompt identifying both copies.
6. Confirm **v0.1.6** in the header and Create a brand dialog. The sidebar build identifier must match `build-info.json`; `VERSION.txt` must say `0.1.6`.

Expected: your previous brands/drafts remain, the latest version is visible, and reopening through the shortcut opens this same copy.

## 2. Configure AI locally

1. Use the tray menu **Edit API settings** to open the desktop profile's `.env` file.
2. Enter your own key in the relevant existing field: `PERPLEXITY_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Do not send keys in chat or commit them to GitHub.
3. Save, quit the tray application and reopen it.
4. Open **Settings & Costs**. For Perplexity, enter an available effort preset such as `fast`, or a supported direct provider/model ID from your account's current documentation. Do not copy the fake IDs used in automated tests.
5. Enter supported model IDs for other providers you want to use. Save settings. Leave unknown token rates blank; do not invent prices.

Expected: configured providers show configured status. A configured key flag alone does not prove the account/model has credits or access; the following real request checks that.

## 3. Test website-assisted brand setup

1. Open **Brand Studio > Add brand**.
2. Enter `Travel One Test` and `www.travelone.ca`.
3. Choose a configured provider and click **Suggest from website**.
4. While it runs, enter your own tone: `Friendly, practical and concise.`
5. Wait for the result. Your tone must remain unchanged. Empty fields may fill, and default Arial may be replaced with an observed font candidate.
6. Review palette swatches, font preview, audience, goals, claims, source links and limitations. If a font is unavailable locally, the preview should explain its fallback. Some websites may block reads or provide little accessible HTML/CSS; that should produce a clear limitation or error.
7. Use **Use this suggestion** on a field. Edit its value again. Verify it remains editable.
8. Try **Use all suggestions** with populated fields; replacing values should require confirmation.
9. Click **Save brand**, reopen it and confirm the edited values persisted.

Expected: analysis alone never saves the brand. Website claims have matching captured excerpts where available. Styling is labelled as observed candidates, not definitive brand guidelines.

Optional: close the modal during a request. Activity should show the job; after completion, **Review suggestions** reopens it. Closing the modal does not cancel a request already sent to the provider.

## 4. Test the research fix

1. Select your test brand and open **Content Skills > Trend research**.
2. Confirm the provider selector offers **Perplexity only** and explains the web-search/source requirement.
3. Enter a title and brief, for example: `Find current travel-planning trends relevant to Canadian travellers. Cite source URLs and publication dates, distinguish evidence from ideas, and suggest five content angles.`
4. Generate once and follow the job in **Activity**.
5. Open the saved draft. Expand **Sources returned by the provider** and open the links. Check dates, relevance and support for the claims.

Expected: a response with source URLs can complete; a response without search-source URLs is marked **incomplete**, with its draft **needs review**. Truncated output also remains incomplete. A source list is not an automatic factual endorsement. Confirm useful content before approving.

For direct-model coverage, repeat with a supported direct Perplexity model ID from your account, if you use one. Both effort presets and direct models now request the search tool explicitly. Each run may be billed.

## 5. Test the other twelve workflows

These retain OpenAI, Claude and Perplexity choices. To test a provider account, start with one short **Caption studio** request, review Activity and the resulting draft, then repeat with another configured provider if desired. Do not use trend research to test OpenAI/Claude because this release intentionally restricts it to Perplexity.

Use the following inputs and check the corresponding output. Do not supply invented company facts as if they were established.

| Workflow | Input to provide | Output to review |
| --- | --- | --- |
| Reel workshop | One factual product feature and CTA | Three hooks, timed script, shot list and CTA |
| Caption studio | Product benefit and intended next step | Three caption variants with hooks and CTAs |
| Carousel builder | A useful topic and supporting facts | Seven numbered slides with concise copy and visual direction |
| Story planner | A topic and engagement goal | Five frames with interaction suggestions and CTA |
| Profile review | Paste your actual profile/bio text | Specific recommendations and limits on what can be assessed |
| Weekly planner | Audience, objective and available assets | Seven-day suggested content plan, not scheduled posts |
| Voice editor | An existing paragraph | Rewrite consistent with your brand, preserving facts |
| Comment drafter | Paste post text | Five specific draft comments; nothing sent |
| Reply assistant | Paste questions/comments | Classification and proposed replies; sensitive issues flagged |
| DM workshop | Recipient context and outreach purpose | Initial DM and follow-up drafts; nothing sent |
| Content repurposer | Paste a source article or draft | Reel, carousel, caption and story versions |
| Performance review | Paste real numbers and the date range | Calculations, missing-data notes and proposed experiments |

Expected: each successful request creates an editable draft for the selected brand. Source uploads/screenshots are not automatically read by these text workflows; paste the relevant text or metrics. AI output quality requires human acceptance; automated tests validate plumbing and constraints, not marketing effectiveness.

## 6. Test drafts, tools and media without AI calls

1. Select a brand, open **Drafts & Review**, create a manual draft and save it.
2. Edit it, save again and check **Version history** for the previous text.
3. Run **Editorial tools > Caption counts**. Compare the reported character count with your text. Try Hook checklist, Spoken timing, Phrase simplifier, Generic wording flags and Slide copy density.
4. Set a review status, save, copy the text and download Markdown.
5. Upload a small TXT or PNG in **Media Library**. Preview it, download it and compare it with the original. Test search by name/tag. Delete only your temporary test asset.
6. Quit and reopen the application. Confirm the saved records remain.

Expected: manual work requires no provider key. The six tools are transparent baseline heuristics, not engagement predictions or AI-authorship detection.

## 7. Check costs and failure handling

1. Inspect Activity after a real request: provider, model, status and token counts should be visible when returned by the provider.
2. Inspect **Settings & Costs**. Without configured rates, cost should say unpriced rather than invent a price.
3. Compare actual charges in your provider portal; use **Reconcile cost** for a finished request if needed. Token estimates may exclude search/tool fees.
4. A missing key/model or an unavailable account/model must produce an error, not a fake successful draft. Do not retry repeatedly before checking billing.

Expected: jobs are not automatically retried. Unknown or incomplete spend retains its reservation until reconciliation. Budgets are planning controls, not provider-enforced billing caps.

## 8. Optional Supabase acceptance

Stay in local mode if that is where your important records are. Switching modes does not import records.

The target project is `qmgvzvdqtpwipkgbpxyo`. Before this release, its existing workspace table permissions, RLS, private bucket and 100 MiB limit were checked through the project connection. Backend SQL insert/read/revision-update/stale-update rejection/delete passed inside a rolled-back transaction; no test workspace remained. This does not prove your PC's REST credentials or media upload configuration.

To test cloud mode from your PC, use a separately backed-up desktop profile, the documented server-only key and `STORAGE_MODE=supabase`, then restart. Create a clearly named test brand and upload/download a small test asset. Restart and confirm persistence. Confirm you can retrieve the test asset, then remove only that asset. Do not expose the server key or point the app at a public interface. Cloud failures should show an error rather than silently fall back to local records.

## Remaining external requirements

- The original Instagram skill package and scoring scripts have not been supplied or located. The app's thirteen workflows and six tools remain baseline implementations. Exact preservation/integration of the original package cannot be verified or completed without those files.
- Provider credentials are not available in the development/build environment. Provider tests use mocked responses; complete the real-account tests above locally with your keys. No live paid provider success is claimed for this release.
- Publishing, social account access, live analytics, image/video generation, commercial sign-in and Sniff integration are outside Phase 1.

If a test fails, record the visible version/build, screen, exact error and Activity status. Never include API keys or private client content in a bug report.
