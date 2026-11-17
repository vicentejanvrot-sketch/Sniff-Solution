# Sniff Solution · Phase 1

A single-developer AI Marketing Studio: brand profiles, thirteen Instagram content workflows, persistent drafts and editorial review, a private media library, provider jobs, usage estimates and module gates.

## Windows desktop installer

The [Windows installer workflow](../../actions/workflows/windows-desktop.yml) builds a per-user setup executable with desktop and Start menu shortcuts. Download **Sniff-Solution-Windows-Installer** from a successful run's Artifacts section, extract it and run **Sniff-Solution-Setup-0.1.1-x64.exe**.

Node.js and Python are bundled. The shortcut starts a hidden local server and opens the app in your normal browser. Its tray menu can reopen the app, edit API settings, open the data folder and quit. There is no application sign-in.

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
- OpenAI Responses, Anthropic Messages and Perplexity Sonar HTTP adapters. Model IDs are configurable. Only Perplexity is wired to a web-grounded research API; other providers receive supplied context without browsing tools.
- Single-worker persistent job queue, visible failures, partial-output handling, interrupted-job detection, no automatic billed retries.
- Draft editing, status review, 25 prior saved versions, copy and Markdown export.
- Local or Supabase persistence; private media up to 100 MiB.
- USD token-cost estimates, monthly reservation controls, manual billing reconciliation and audit history.
- Six transparent Python editorial utilities: hook rubric, spoken timing, caption counts, phrase simplification, generic wording flags and slide copy-density review.
- Server-side marketing module gate. Sniff and Sniff Integration remain explicitly disabled, regardless of which tiles are visible.

**Original skill source is still required.** The original Instagram skill package and scoring scripts were not present in the supplied repository. The thirteen workflows and Python tools here are new baseline implementations, not a claim that the original code was preserved or its scores reproduced. Provide that package to integrate its original instructions and utilities faithfully. Generic wording checks cannot establish AI authorship, and editorial rubrics do not predict engagement.

There is no image/video generation, final branded rendering, social account connection, scheduled publishing, social analytics or AI Autopilot in Phase 1. Palette and font are stored as brand direction; precise overlays arrive with Phase 2.

## Supabase storage

The target project is `qmgvzvdqtpwipkgbpxyo`. The tracked SQL snapshot is in [db/phase1_foundation.sql](db/phase1_foundation.sql); it is applied once via Supabase migration management, not automatically at server startup.

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
- [Perplexity Sonar and migration reference](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to)
- [Supabase data security](https://supabase.com/docs/guides/database/secure-data)

