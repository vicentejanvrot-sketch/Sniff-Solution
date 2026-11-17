# Phase 2 — Content Production (0.2.2)

## Update

Quit Sniff Solution from its tray icon. Extract the complete Windows app ZIP over the intended app folder. Run START_SNIFF.cmd there and confirm v0.2.2. Existing configuration and records are preserved. Windows packages include Node, Python, FFmpeg and FFprobe; source archives do not.

## Configure securely

Use the tray menu to edit local API settings. Keep secrets out of chat, exports and GitHub. Existing desktop configuration lives in %LOCALAPPDATA%\SniffSolution\.env and is not replaced by the ZIP. Add missing settings manually:

```
OPENAI_API_KEY=your-local-key
HF_API_KEY_ID=your-local-higgsfield-api-key-id
HF_API_KEY_SECRET=your-local-higgsfield-api-key-secret
```

Restart after editing. Open Settings & Costs, set an image model available to your OpenAI account, and save. Text models and image models have separate settings. Video uses the documented Seedance 2.0 text-to-video adapter; arbitrary model endpoints are not supported. A Higgsfield website subscription does not establish API credit or model access.

The default media reservation is US$5 per image or video request. Adjust it and the monthly budget before starting. A batch of four reserves four times the configured media amount. These are planning reservations, not quotes or hard provider caps. Media jobs stay unpriced until you reconcile the actual cost in Activity. No paid calls are made by automated tests.

## Image Studio

1. Create/select a brand. Upload a PNG logo in Media Library, preview it and save its review status as approved. For a custom brand font, upload its licensed TTF/OTF file and approve it too. Only approved logos/fonts appear in the studio overlay selectors. Windows system fonts Arial, Georgia, Times New Roman, Segoe UI, Verdana and Tahoma can be used without upload.
2. Open Image Studio. Enter a title and brief, select a format and generate one image. Keep Sniff running. Activity should show generation and rendering phases, then completed.
3. Open Media Library. The finished PNG appears by default, marked needs review. Select Show saved originals to reveal its preserved original. Preview the finished asset and check its framing and dimensions.
4. Test a batch of two. Verify two finished assets by default, numbered image 1 and image 2. Show saved originals reveals their two recovery copies; those are not additional AI generations. If a provider returns fewer than requested, Activity should say incomplete.
5. Select an image as reference, describe an edit or variation, and generate. This sends the selected image to OpenAI. The original remains intact and the new result links back to it.
6. Test transparent background / background removal with a compatible image model. Inspect downloaded PNG transparency in an image editor. Branding adds an opaque footer when enabled.
7. Choose Render an existing image, select a source, enable brand overlays, choose the approved logo/font and enter overlay text. Rendering makes no AI call. Verify the footer colour, typography and logo. Fit adds padding; fill crops edges. Each render is a separate derived asset.
8. Optionally select a saved text draft to fill the brief and caption. Edit both before generation. The saved draft is unchanged.

## Video Studio

1. Generate a 5-second clip in 9:16 with a specific scene/movement brief. The adapter requests audio. Check the provider request ID and progress in Activity.
2. Preview the original MP4 and rendered MP4. Verify playback, duration, audio when returned, final dimensions, and branding if enabled.
3. Test 10 seconds and another supported ratio. Generation supports 1:1, 9:16 and 16:9. To produce 4:5, render an existing clip to that format.
4. Rendering an uploaded MP4 or image is also available. This does not generate video from a still image; a still remains a still PNG. This release does not include a multi-scene timeline, voiceover editor or image-to-video adapter.
5. If a submitted video is interrupted or its result cannot be downloaded, use Recover result in Activity. This polls the stored request ID and never submits a new generation. If an original is already saved, use Render existing instead. Do not regenerate merely to recover a billed request.

## Review, history and persistence

Preview an asset, edit its caption/notes, select approved and save. Reopen it and check review history. A stale save must be rejected. New edits/renders need their own approval. Downloads remain available before approval for review; no content is published automatically. Source and derived versions are separate immutable files; review history retains 25 prior metadata revisions. A source with derived assets cannot be deleted until those derivatives are removed. Assets used by active production jobs cannot be deleted.

Restart Sniff and verify assets, review status, request IDs and text drafts persist. Existing Phase 1 workflows must still work. In Supabase mode, verify media upload/download with the locally configured backend credentials. Storage remains private and capped at 100 MiB per file. Production records extend the existing workspace document; existing cloud projects also need the additive font MIME configuration in db/phase2_media.sql, applied once by the project administrator, never at app startup.

## Verification limits and architecture

Automated tests mock provider HTTP responses and verify request schemas, credentials, reservations, recovery and persistence. Real FFmpeg tests exercise image and video rendering when FFmpeg is available. Browser checks cover both studios and review controls. Live account acceptance needs your configured API accounts and incurs provider charges when you start generation.

The existing local Node queue is the background worker. It must stay running; this developer release does not deploy a cloud worker. Text and media requests share one persistent worker. Restart marks running jobs interrupted; billed requests are never replayed automatically. OpenAI image calls cannot recover an unknown result after a connection failure; check provider history/billing before an explicit new request. Video recovery requires a saved provider request ID.

Publishing remains Phase 3, analytics Phase 4, Autopilot Phase 5 and commercial expansion Phase 6. Sniff and Sniff Integration remain disabled. Original Instagram scoring sources are still unavailable; Phase 1 baseline tools are preserved.

API references: https://developers.openai.com/api/docs/guides/image-generation ; https://higgsfield.ai/higgsfield-api ; https://github.com/higgsfield-ai/higgsfield-client . FFmpeg build: https://www.gyan.dev/ffmpeg/builds/ (pinned 9.0.2 essentials, GPLv3; license and source reference included).

## Dictation and budget feedback (0.2.1)

In Image Studio or Video Studio, select Dictate next to Creative brief or Caption / production notes. Allow microphone access, speak in your browser language, then select Stop dictation. Final recognized text appends to existing text. Review it before starting production. Dictation uses the browser speech service, which may process audio online; browser support and microphone permission are required. Unsupported browsers show a Windows Win+H voice-typing fallback. Automated browser tests simulate speech results and permission failures; real microphone accuracy needs user acceptance testing.

The budget panel shows count × per-image reservation, remaining monthly budget and instructions before submission. If blocked, reduce the count, review Settings & Costs or reconcile previous requests in Activity. A blocked request makes no provider call. Your budget and reservation settings are preserved.

## Media Library thumbnails

Open Media Library and scroll through image cards. Each image should display a small thumbnail without clicking Preview. Transparent PNGs use a checkerboard background. Search, switch brands and toggle Show saved originals; the thumbnails should follow the visible cards. Preview and Download remain available. Thumbnail creation runs locally through bundled FFmpeg and never generates another AI image. Videos/documents keep their type icons.

## Existing-image rendering and format review (0.2.2)

Select a brand in the studio form, choose Render an existing image and select a source. The title fills automatically if empty. Choose the format and read Finished output for the exact target dimensions. Fit keeps the entire source with padding; Fill crops its edges. Local rendering does not use the creative brief or change the pictured scene. Use Generate / edit images with a reference for AI scene edits.

After completion in Activity, select Review assets. The result opens directly. Check the pixel dimensions below the image, its actual visible proportions and Download asset. Batch requests have an Output from this request selector. Expected PNG sizes: 1:1 = 1080×1080; 4:5 = 1080×1350; 9:16 = 1080×1920; 16:9 = 1920×1080. Tests verify real downloaded PNG bytes for all four formats from PNG/JPEG/WebP sources, plus the browser rendering/review/download flow.
