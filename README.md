# Sniff Solution · Phase 2

A single-developer AI Marketing Studio: brand profiles, thirteen Instagram content workflows, persistent drafts and editorial review, a private media library, provider jobs, usage estimates and module gates.

## Complete ZIP updates (preferred)

Every change is delivered as a **complete ready-to-run app ZIP**, including all current source files, the Windows launcher, Node.js and Python. Each push to `main` publishes it on the [latest GitHub Release](../../releases/latest) as **Sniff-Solution-Windows-Full-App-&lt;version&gt;-&lt;commit&gt;.zip** (also as `Sniff-Solution-Windows-Full-App.zip`). The same ZIP is attached to the Windows workflow run as a fallback artifact; artifacts need a GitHub sign-in and expire after 90 days. GitHub's **Code › Download ZIP** and the release's **Source code** archives are source only, not the runnable app.

Quit the existing app from its tray icon, extract all files over your app folder, then run **START_SNIFF.cmd** once. It repoints the desktop/Start menu shortcuts to that exact folder, reports any other running or installed Sniff copy, and launches the new copy.

The version is shown in the header, the sidebar (with the build commit) and the **Create a brand** dialog, and in VERSION.txt/build-info.json. If you open a copy while a different copy or version is still running in the tray, SniffSolution.exe names both folders and versions and offers to close the running copy (its server finishes in-flight work first); it never reopens the old one silently. Application files alone cannot replace code already running in memory.

The ZIP never includes a real .env or user-data directory. Existing files in the target folder remain untouched unless they are application files of the same name. Desktop data/configuration remain in %LOCALAPPDATA%\SniffSolution. Existing source-checkout .env/.data files are preserved, but they are not silently imported into the desktop profile.

## Windows desktop installer

The [Windows installer workflow](../../actions/workflows/windows-desktop.yml) builds a per-user setup executable with desktop and Start menu shortcuts. The setup executable is also attached to each GitHub Release. It installs to %LOCALAPPDATA%\Programs\Sniff Solution. Use either the installer or the complete ZIP folder, not both: an old installed copy keeps its own files until it is updated or uninstalled.

Node.js, Python, FFmpeg and FFprobe are bundled. The shortcut starts a hidden local server and opens the app in your normal browser. Its tray menu can reopen the app, edit API settings, open the data folder and quit. There is no application sign-in.

Desktop data, configuration and logs are stored in **%LOCALAPPDATA%\SniffSolution**, separate from installed binaries. Reinstall and uninstall preserve this folder. Source-checkout .data folders are not automatically imported. Existing API keys are never included in build artifacts.

This development build is unsigned; see the included SHA256SUMS.txt and INSTALL.txt. The installer is tested on a Windows runner for shortcut creation, bundled runtimes/Python checks, persistence across reinstall/restart, interrupted desktop-lock recovery and retained user files after uninstall.

## Run it from source

Install **Node.js 22 or newer** and **Python 3** (Python enables the six editorial tools). Download this branch from GitHub using **Code → Download ZIP**, extract it, and open a terminal in that folder.

1. Copy `.env.example` to `.env`.
2. Run `npm start`.
3. Open **http://127.0.0.1:3080**.

No package installation or application sign-in is needed. It binds only to the loopback interface and rejects foreign Host/Origin requests. This is a local owner workspace, not a public SaaS deployment. Do not publish it behind a proxy or expose the port. Commercial identity, tenant isolation, subscription billing and multiple-user roles are not enabled yet.

On Windows, if Python is available as `python` instead of `python3`, add `PYTHON=python` to your .env file.

## Suggest a brand from its website

In **Brand Studio → Add brand**, enter the **brand name** and **website**, then choose **Suggest from website**. Bare domains and www addresses are normalized to HTTPS. Automatic provider selection prefers Perplexity, then OpenAI, then Claude, using providers with both a configured key and model. You can also select a provider explicitly.

The app reads the public homepage, up to two same-site feature/about pages and up to four stylesheets. It extracts colour and font-family candidates from accessible HTML/CSS, then asks the selected AI for tone, audience, goals, source-backed claims and proposed phrases to avoid. It does not render JavaScript pages or measure computed styles. Unused stylesheet rules, fallback fonts, blocked pages and client-rendered sites can limit the results.

Only empty fields (and the default Arial value on a new brand) are filled automatically. Existing text and edits made while analysis runs are preserved. Each field has **View suggestion** and **Use this suggestion** controls. **Use all suggestions** asks before replacing existing values. You can edit everything before **Save brand**; analysis alone never creates or updates a brand.

The evidence panel shows captured pages/styles, observed CSS declarations, assumptions and timestamps. Claim excerpts must match captured page text; unsupported proposed claims are omitted. A matching quote supports provenance, not a factual or legal endorsement. Suggested prohibited phrases are recommendations, not discovered company policies.

Website analysis uses the same job queue, module gates, reservations and cost tracking as other AI tasks. It is visible in **Activity**, where completed results can be reopened. A website failure before the AI request makes no paid call and releases that reservation. Closing the dialog does not cancel a request that is already running. The save button waits while analysis is active; closing the dialog remains available.

Outbound website reads use public DNS checks and pinned addresses, reject local/private targets and nonstandard ports, revalidate every redirect, limit response/decompression sizes and use no browser cookies or provider credentials.

## Phase 1 research verification (0.1.6)

Perplexity requests explicitly enable `web_search` for both direct models and effort presets. **Trend research requires Perplexity**, enforced in the UI and backend before a job is queued. Other providers remain available for the other twelve workflows and for brand suggestions based on captured website content. A trend response without returned search-source URLs is saved as `needs-review` with an `incomplete` Activity job; text alone does not count as completed research. Source presence does not establish that every claim is true or current.

See [PHASE1_TEST_GUIDE.md](PHASE1_TEST_GUIDE.md) for update instructions, real-account acceptance tests, expected results for all thirteen workflows and current verification limits. It is included in the complete Windows ZIP. Automated tests do not use paid provider credentials.

## First use

1. Open **Brand Studio** and create your brand, including voice, audience, goals, palette, font and claim rules.
2. To use AI, set your own provider keys in the ignored server `.env` file, then restart the app. Keys never enter frontend bundles, browser storage, GitHub or saved workspace documents.
3. In **Settings & Costs**, enter a model ID available to each API account. No model is silently selected and no live paid calls were made during automated tests.
4. Optionally enter current input/output USD prices per million tokens. Leave unknown prices blank; these stay explicitly unpriced. Provider search, tool, cache and other fees are not fully calculated.
5. Open a content workflow, enter your brief and run it. Follow **Activity**, then edit and approve the saved draft. Manual drafts work without any provider key.
6. Upload reference media and download it again from **Media Library**. Text AI workflows do not automatically read uploaded files.
7. Use **Editorial tools** inside a draft for the Python checks.

## What works in this release

- Dashboard with live counts and module tiles.
- Multiple brand profiles, editable with conflict detection.
- All 13 graphical text workflows: Reel, trend research, caption, carousel, story, profile audit, weekly plan, voice edit, comments, replies, direct messages, repurposing and performance audit.
- OpenAI Responses, Anthropic Messages and Perplexity Agent API (`POST /v1/agent`) HTTP adapters. Model IDs are configurable. For Perplexity, enter an effort preset (fast, low, medium, high, xhigh) or a provider/model ID; former Sonar IDs map to Perplexity's documented presets (sonar and sonar-pro → fast, sonar-reasoning-pro → low, sonar-deep-research → high). Sonar Chat Completions support ended on 2026-09-27. Only Perplexity is wired to a web-grounded research API; other providers receive supplied context without browsing tools.
- Single-worker persistent job queue, visible failures, partial-output handling, interrupted-job detection, no automatic billed retries.
- Draft editing, status review, 25 prior saved versions, copy and Markdown export.
- Local or Supabase persistence; private media up to 100 MiB.
- USD token-cost estimates, monthly reservation controls, manual billing reconciliation and audit history.
- Six transparent Python editorial utilities: hook rubric, spoken timing, caption counts, phrase simplification, generic wording flags and slide copy-density review.
- Server-side marketing module gate. Sniff and Sniff Integration remain explicitly disabled, regardless of which tiles are visible.

**Original skill source is still required.** The original Instagram skill package and scoring scripts were not present in the supplied repository. The thirteen workflows and Python tools here are new baseline implementations, not a claim that the original code was preserved or its scores reproduced. Provide that package to integrate its original instructions and utilities faithfully. Generic wording checks cannot establish AI authorship, and editorial rubrics do not predict engagement.

Phase 2 adds Image Studio and Video Studio, OpenAI image generation/edits/batches, Higgsfield Seedance 2.0 text-to-video, and local FFmpeg rendering with approved logo/font/colour overlays. Generated originals are preserved separately from final outputs. Media has review status, caption history and source/derived versions. See [PHASE2_TEST_GUIDE.md](PHASE2_TEST_GUIDE.md) for configuration, testing and limitations.

Image and video provider fees stay unpriced until reconciled. Each image reserves the configured media amount; a batch multiplies that reservation. Local rendering costs zero provider credits. The existing persistent local worker performs production while Sniff is open; a cloud worker is not deployed. Video requests with stored request IDs can be recovered without resubmitting generation. No social connection, scheduled publishing, live analytics, Autopilot or Sniff integration is enabled.

## Supabase storage

The target project is `qmgvzvdqtpwipkgbpxyo`. The tracked SQL snapshot is in [db/phase1_foundation.sql](db/phase1_foundation.sql); it is applied once via Supabase migration management, not automatically at server startup.

Phase 2 adds `font/ttf` and `font/otf` to the private media bucket using [db/phase2_media.sql](db/phase2_media.sql). Apply that additive configuration once for existing cloud projects. It preserves bucket visibility, limits, other MIME types and all records.

After its schema is installed, set these **server-only** values in .env:
```dotenv
STORAGE_MODE=supabase
SUPABASE_URL=https://qmgvzvdqtpwipkgbpxyo.supabase.co
SUPABASE_SECRET_KEY=your-server-side-secret
WORKSPACE_ID=developer
```

Find the secret key in your Supabase project's API key settings. Never paste it into chat or commit it. A publishable/anon key cannot access this backend-only schema.

Workspace snapshots use revision checks to reject concurrent cloud writes; assets use the private `marketing-media` bucket. Public/anonymous and authenticated browser roles have no access. Existing tables are preserved. Selecting cloud mode does not import local data; choose a mode before creating important records. Cloud failures fail closed and never silently switch to local storage.

The developer JSON snapshot is intentional for this first local release. Before commercial multi-user deployment, replace it with tenant-scoped entities, membership/entitlement authorization and server-side identity validation.

## Budget and reliability

Monthly budgets are **planning controls, not guaranteed provider billing caps**. Each queued request reserves the configured amount. Known completed token-cost estimates replace the reservation; unknown, failed, incomplete or interrupted requests retain it. You can reconcile a finished request in Activity against provider billing. Configure provider-side limits separately.

Jobs run only while the Node server is running. Queued jobs resume on startup; a previously running request is marked interrupted and never automatically replayed. Ten pending jobs maximum, one provider call at a time, with a three-minute provider timeout. A timed-out provider may still bill you.

Only one server may use a given data folder. After an unclean crash, ensure no Sniff process is running before removing the stale `.data/workspace.lock` file. A deleted or disconnected local folder is not a cloud backup.

## Backups and verification

Settings exports JSON text, records and metadata. Download media separately. In local mode, stop the app and copy the complete .data folder for a full backup. A UI restore importer is not included.

Run `npm run check`, `npm test`, and `python3 -m unittest discover -s tools -p 'test_*.py'`. GitHub Actions runs the same checks. Integration tests use local HTTP servers, temporary folders and mocked external providers; they do not spend API credits or claim live-provider verification.

The repository does not contain a hosted deployment. The local developer app is ready for review after checks; a hosted application needs a separate access-controlled deployment environment.

## Provider references

- [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses/create)
- [Anthropic Messages](https://docs.anthropic.com/en/api/messages)
- [Perplexity Agent API migration reference](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to)
- [Supabase data security](https://supabase.com/docs/guides/database/secure-data)


## 0.2.1 production usability update

Studios provide browser dictation for creative briefs and captions/production notes. Speech appends to typed text and requires browser support and microphone permission; the browser service may process audio online. Final outputs appear by default in source selectors and Media Library; Show saved originals reveals preserved recovery files. Batch filenames are numbered. Budget feedback shows required reservations and remaining monthly budget before submission without changing owner settings.

Media Library image cards show private, lazily loaded thumbnails. Small PNG previews are cached in the local data folder, including in Supabase mode, and deleted when their asset is removed. No external AI request is made for thumbnails.

## 0.2.2 existing-image review and formats

Activity → Review assets opens that request’s saved output directly, with a selector for batches. Previews preserve actual image proportions and display decoded pixel dimensions. Studios show the selected final dimensions and explain fit (padding) versus fill (cropping). Existing-image rendering fills a default title, uses assets from the form’s selected brand and hides the AI brief, since local rendering changes framing/branding rather than scene content. The original provider output is no longer labelled with the requested final aspect ratio.

## 0.2.3 installed Windows fonts

Image Studio and Video Studio → Rendering font now list supported TTF, OTF and TTC font files from Windows Fonts and the current user’s installed-font folder. Friendly names come from OpenType metadata. Refresh installed fonts rescans those folders without losing the brief or other choices. Approved uploaded fonts remain available in a separate group. Matching brand fonts are selected automatically when available. The renderer reads the selected local file; no installed font files or absolute paths are sent to the browser, AI providers or app ZIP. Collections expose their first face and variable fonts use their default instance. Existing records and client assets are preserved.


## 0.2.4 local Phase 2 completion

Local processing is accepted until go-live; Render is the chosen future cloud processing provider. No cloud service is required for this phase. Real video generation/playback with the owner's Higgsfield account remains an acceptance check; automated checks mock paid API calls.

- Activity can record one confirmed daily provider total against selected finished requests, counting it once without guessing per-request prices. Undo restores reservations and preserves the record. Select only requests included in that total; other apps sharing a key must be excluded. Dates use UTC queue time.
- Approved logo overlays can omit brand text, removing the font requirement. Overlays do not erase logos already baked into an image; use an AI edit first to remove those.
- Higgsfield accepts `HF_API_KEY` containing the complete credential copied from https://open.higgsfield.ai/api-keys. Existing ID/secret pairs remain supported when that setting is blank. Desktop settings are in `%LOCALAPPDATA%\SniffSolution\.env`; use the tray menu's Edit API settings, save and restart. Credentials stay local and are excluded from workspace exports.
- Settings now show the US$100,000 maximum monthly planning budget and explain that limit when validation fails.

See PHASE2_TEST_GUIDE.md for live acceptance steps and update instructions.


## 0.2.5 video briefs and production timing

Video Studio interprets a conversational goal through the configured OpenAI or Claude text model before generating a video. Prepare video brief saves an editable draft with scenes, timing and camera direction while preserving the original goal. The user reviews it and selects Start production to submit the reviewed prompt to Higgsfield. Text preparation and media generation are separate requests with separate reservations and billing records. Relevant brand direction informs preparation; brand research/history is not appended to reviewed video prompts. Moderation acceptance is not guaranteed.

Activity keeps a formatted elapsed time after completion or failure. This covers submission to the recorded finish, including queue wait, rendering and recovery gaps. Saved timestamps support existing records; missing timestamps are shown honestly as unavailable. See PHASE2_TEST_GUIDE.md for testing and update instructions.
