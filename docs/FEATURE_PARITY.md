# PageStitch feature parity audit

This document tracks the user-visible capabilities advertised by current full-page capture tools and the evidence available in this repository. PageStitch is an original implementation; parity refers to workflow and capabilities, not branding or source-code identity.

## Capture

| Requirement | Status | Evidence |
| --- | --- | --- |
| One-click full-page capture | Implemented | The default toolbar action calls `beginCapture("full")`; users can switch the toolbar to the popup menu in settings. |
| `Alt+Shift+P` shortcut | Implemented | `capture-full-page` command in `manifest.json`. |
| Scroll and stitch an entire document | Implemented | `content/capture.js`, `background/service-worker.js`, and `offscreen/offscreen.js`. |
| Preserve browser zoom/device pixel ratio | Implemented by measurement | Output scale is derived from the actual captured bitmap and CSS viewport dimensions. |
| Restore original page position and styles | Implemented | Capture state records scroll position and inline styles and restores them in `finally`. |
| Fixed/sticky element handling | Implemented | Floating elements are shown at their natural first appearance and hidden from repeated frames. |
| Lazy-loaded/dynamically growing pages | Implemented with a safety cap | Page height is measured after every scroll; capture stops after 250 sections to avoid infinite feeds. |
| Inner scrollable applications | Implemented | The largest visible scroll container is detected when the document itself does not scroll. |
| Embedded same-origin iframe | Implemented | A fully visible scrolling iframe can be selected as the capture target. |
| Embedded cross-origin iframe | Platform-limited | Its visible pixels are captured, but `activeTab` does not authorize independently scrolling a foreign origin. PageStitch deliberately avoids broad persistent host permissions. |
| Visible-area capture | Implemented | Popup, context menu, and `Alt+Shift+V`. |
| Selected-region capture | Implemented | Shadow-DOM selection overlay and cropped offscreen assembly. |
| Very tall page splitting | Implemented | Adaptive memory-bounded IndexedDB segments, virtualized editor previews, and numbered image exports. |
| Cancel and progress feedback | Implemented | Page HUD, toolbar badge, popup state, and cancellation messaging. |

## Editor

| Requirement | Status | Evidence |
| --- | --- | --- |
| Crop | Implemented | Non-destructive crop used by preview and all exports. |
| Pen and highlighter | Implemented | Smoothed freehand paths with configurable color/width. |
| Rectangle and arrow | Implemented | Vector annotations. |
| Text and emoji | Implemented | Local canvas rendering; no external assets. |
| Blur/redaction | Implemented | Local pixelation applied before vector markup. |
| Select, move, and delete annotations | Implemented | Hit testing, selection handles, drag movement, keyboard/button deletion. |
| Undo/redo | Implemented | Persistent snapshot history for crop and annotations. |
| Zoom and fit | Implemented | 5%–200% viewport scaling. |
| Copy to clipboard | Implemented within canvas limits | Edited PNG is written through `ClipboardItem`. |
| Drag to desktop/file manager | Implemented within canvas limits | The editor prepares an edited PNG and exposes Chromium's `DownloadURL` drag payload. |

## Export and library

| Requirement | Status | Evidence |
| --- | --- | --- |
| PNG and JPEG | Implemented | Configurable JPEG quality and split output for oversized pages. |
| A4/Letter PDF | Implemented | Portrait/landscape, title/URL/date, page numbers, and JPEG image objects. |
| Smart PDF page breaks | Implemented | A low-edge-energy row is selected near each page boundary. |
| Auto-download | Implemented | Editor opens with `auto=1` and exports using saved defaults. |
| Save As preference | Implemented | Single-file exports honor the synchronized setting. |
| Downloads subfolder | Implemented | Sanitized relative path under the browser Downloads directory. |
| Local capture history | Implemented | IndexedDB library with thumbnails and storage totals. |
| Batch download/delete | Implemented | Selected captures can be rendered with saved edits and downloaded or deleted. PDF defaults fall back to PNG for batch export. |
| Configurable history limit | Implemented | 3, 10, 25, or 50 recent captures. |

## Privacy and platform

| Requirement | Status | Evidence |
| --- | --- | --- |
| No account, uploads, analytics, or remote code | Implemented | No networking code or remote imports; `PRIVACY.md`; automated verifier. |
| No persistent all-site host permission | Implemented | `activeTab` and `scripting`; no `host_permissions`. |
| Manifest V3 | Implemented | MV3 service worker and Offscreen API, minimum Chromium 109. |
| English and Russian UI | Implemented | Locale parity is checked automatically. |
| Chrome-family packaging | Implemented | Verified ZIP with the manifest at archive root. |
| Runtime smoke test in a user Chromium profile | Awaiting manual evidence | The available automated browser environment blocks local extension and `file://` URLs. Use the checklist in `docs/SMOKE_TEST.md`. |
