# Phase 2 — Content Production (0.2.5)

## Update

Quit Sniff Solution from its tray icon. Extract the complete Windows app ZIP over the intended app folder. Run START_SNIFF.cmd there and confirm v0.2.5. Existing configuration and records are preserved. Windows packages include Node, Python, FFmpeg and FFprobe; source archives do not.

## Configure securely

Use the tray menu to edit local API settings. Keep secrets out of chat, exports and GitHub. Existing desktop configuration lives in %LOCALAPPDATA%\SniffSolution\.env and is not replaced by the ZIP. Add missing settings manually:

```
OPENAI_API_KEY=your-local-key
HF_API_KEY=the-complete-key-copied-from-Higgsfield
```

Restart after editing. In Image Studio, choose Higgsfield or OpenAI. For OpenAI, configure a default image model in Settings & Costs or load the account catalog in Image Studio. Text models and image models have separate settings. Higgsfield offers the documented image and video adapters; arbitrary provider endpoints are not supported. A Higgsfield website subscription does not establish API credit or model access.

On Vicente's desktop installation this file is `C:\Users\vicen\AppData\Local\SniffSolution\.env`. Press Windows+R and enter `%LOCALAPPDATA%\SniffSolution` to find it, or use the tray menu's **Edit API settings**. The preferred setting is now `HF_API_KEY`, copied whole from https://open.higgsfield.ai/api-keys; do not add a `Key ` prefix. Older `HF_API_KEY_ID` plus `HF_API_KEY_SECRET` settings still work when `HF_API_KEY` is blank. The complete copied credential is displayed only at creation; create a new key if only its visible ID was saved. Never send credentials in chat.

## Phase 2 completion status

Local processing is the accepted setup until go-live. **Render is the chosen future cloud processing provider.** Cloud provisioning is deferred. Publishing remains Phase 3.

Image generation/editing, batching, exact output formats, local rendering, thumbnails, dictation, review/download, installed fonts and cost controls have automated coverage. These checks use mock provider responses and real local media processing; they do not establish paid account access. **The owner has reported a completed live Higgsfield generation in Activity; playback/download and the new brief-preparation flow still need live acceptance.** Complete the Video Studio acceptance steps below before signing off that workflow. Keep the returned request ID and any Activity error if the live check fails.

## Daily cost totals and logo-only overlays (0.2.4)

1. Activity → **Record a daily total**. Choose the provider and UTC date, select only requests included in the provider's confirmed amount, enter that amount and confirm its scope. All brands are available in this dialog. The total counts once; selected jobs display **Included in daily total**, without fabricated individual prices. Local renders and already reconciled requests are excluded. For example, enter $0.34 only if that total belongs to the selected Sniff requests, not other activity sharing the API key.
2. Check Settings & Costs: selected reservations should be replaced by the one total. **Undo total** restores their reservations and retains an audit record. Reconcile individual requests separately only when their actual charges are known. Dates use queue time in UTC; verify provider periods for jobs spanning midnight.
3. Image Studio → Render an existing image → select the source and approved logo → enable approved brand overlays → uncheck **Include brand name / overlay text**. A logo and colour band render without requiring a font. This overlays a logo; removing a logo already baked into an image requires an AI edit first.
4. Monthly planning budgets support up to US$100,000. The limit is shown in Settings and in validation errors. These values do not change the provider's billing limits.

The default media reservation is US$5 per image or video request. Adjust it and the monthly budget before starting. A batch of four reserves four times the configured media amount. These are planning reservations, not quotes or hard provider caps. Media jobs stay unpriced until you reconcile the actual cost in Activity. No paid calls are made by automated tests.

## Image Studio

1. Create/select a brand. Upload a PNG logo in Media Library, preview it and save its review status as approved. For a custom brand font, upload its licensed TTF/OTF file and approve it too. Only approved logos/fonts appear in the studio overlay selectors. The Rendering font dropdown lists supported installed Windows fonts without requiring an upload.
2. Open Image Studio. Enter a title and brief, select a provider and model, and choose the model-supported generation options. Choose a finished output format and generate one image. Keep Sniff running. Activity should show generation and rendering phases, then completed. For Higgsfield, confirm the chosen resolution, ratio and quality on the saved request; the original remains at provider resolution.
3. Open Media Library. The finished PNG appears by default, marked needs review. Select Show saved originals to reveal its preserved original. Preview the finished asset and check its framing and dimensions.
4. Test a supported batch count (OpenAI and Kling allow 1–4, Soul 2 allows 1 or 4, other integrated Higgsfield models return one image per request). Verify numbered finished assets; Show saved originals reveals their recovery copies, not additional generations. If a provider returns fewer than requested, Activity should say incomplete.
5. Select an image as reference, describe an edit or variation, and generate. This sends the selected image to the selected provider; Higgsfield accepts one PNG/JPEG reference per Sniff request, up to 30 MiB. The original remains intact and the new result links back to it.
6. Test transparent background / background removal using a compatible OpenAI image model. Inspect downloaded PNG transparency in an image editor. Branding adds an opaque footer when enabled.
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

Open Media Library and scroll through image cards. Each image should display a small thumbnail without clicking Preview. Image thumbnails, transparent areas and unused preview space use a plain white background. Search, switch brands and toggle Show saved originals; the thumbnails should follow the visible cards. Preview and Download remain available. Thumbnail creation runs locally through bundled FFmpeg and never generates another AI image. MP4 videos show their first decoded frame, generated locally through FFmpeg. Documents keep their type icons.

## Existing-image rendering and format review (0.2.2)

Select a brand in the studio form, choose Render an existing image and select a source. The title fills automatically if empty. Choose the format and read Finished output for the exact target dimensions. Fit keeps the entire source with padding; Fill crops its edges. Local rendering does not use the creative brief or change the pictured scene. Use Generate / edit images with a reference for AI scene edits.

After completion in Activity, select Review assets. The result opens directly. Check the pixel dimensions below the image, its actual visible proportions and Download asset. Batch requests have an Output from this request selector. Expected PNG sizes: 1:1 = 1080×1080; 4:5 = 1080×1350; 9:16 = 1080×1920; 16:9 = 1920×1080. Tests verify real downloaded PNG bytes for all four formats from PNG/JPEG/WebP sources, plus the browser rendering/review/download flow.

## Installed Windows fonts (0.2.3)

1. Open Image Studio or Video Studio, select your brand, and open Rendering font. Installed on this PC lists fonts from C:\Windows\Fonts (or your configured Windows directory) and %LOCALAPPDATA%\Microsoft\Windows\Fonts. Supported files are TTF, OTF and TTC; collections expose their first face and variable fonts use the default instance.
2. Select a font, choose an image and approved logo, enable brand overlays, and render. No font upload is required. Review the output and Font label to confirm the choice. The font affects extra brand text; it does not alter the lettering inside the approved logo PNG.
3. Install another font using Windows, then select Refresh installed fonts. Your brief, title and asset choices should remain.
4. Approved uploaded TTF/OTF files remain listed under Approved uploaded fonts for the selected brand.
5. Installed font names/IDs are exposed to the local UI, but local paths and font file bytes are not. The font is copied to a temporary local render folder and removed after rendering. Fonts are not bundled into the app distribution or uploaded to AI providers. If a font is removed before a queued job renders, the job reports that it is unavailable.

Windows verification includes discovery of real fonts and a branded render using a font outside the previous six-font whitelist. Automated tests cover malformed files, stable IDs, private paths and rejection of unknown font selections.


## Video goal interpretation and elapsed time (0.2.5)

1. Configure an OpenAI or Claude text model in Settings & Costs, in addition to your Higgsfield credentials. Brief preparation uses a separate text request and the ordinary per-request reservation. Video generation uses the media reservation. Both appear separately in Activity; unknown fees remain unpriced.
2. Open Video Studio, select a brand, choose 5 or 10 seconds and a supported video format, and describe the outcome in your own words. Select **Prepare video brief**. This saves a text draft only; it does not submit a video to Higgsfield.
3. Review the **Prepared video brief**, which should turn your goal into feasible scenes, timing, camera direction and continuity. Edit it as needed. The original Creative brief remains unchanged. Select **Start production** only when ready to send that reviewed prompt to Higgsfield.
4. Changing the original description, brand, duration or format requires preparation again. You can leave while preparation runs: Activity and Drafts & Review retain the result. Return to Video Studio and select the prepared draft under Saved draft to restore its original description and video settings. Incomplete preparations cannot be used as completed briefs.
5. Check Activity while an image or video runs: **Elapsed** updates during work. After completion or failure, **Total elapsed** remains visible, formatted as seconds/minutes/hours and retained after refresh or restart. It measures submission to recorded finish, including queue wait, final rendering and any gaps before recovery; it is not an isolated provider computation timer. Older records without timestamps display Elapsed time unavailable.

Preparation preserves the user's intent and relevant brand rules without sending the entire saved brand research/history to the video model. It cannot guarantee moderation acceptance, precise generated app screens, readable interface text or a particular visual result. The new workflow is verified with mock AI responses and real FFmpeg rendering; no paid requests are made by automated checks. The owner's Activity screenshot shows a completed live Higgsfield generation; playback/download and the new preparation step still require live user acceptance.


## Video thumbnails and white preview backgrounds (0.2.5)

Open Media Library and scroll to a saved MP4. Its card should show the first video frame without selecting Preview; portrait and landscape videos keep their proportions. Image/video thumbnail backgrounds and preview backgrounds should be white, with no checkerboard. Existing MP4s get a thumbnail automatically when their cards come into view. Frame extraction runs locally, creates no AI job and preserves the original download. A failed decode shows Thumbnail unavailable with the Preview fallback.
