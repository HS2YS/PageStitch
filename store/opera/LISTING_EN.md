# Opera Add-ons — English

## Name

PageStitch — Full Page Capture

## Summary

PageStitch captures, locally edits, and exports complete webpages without accounts, uploads, or paid feature locks.

## Category

Productivity

## License

MIT

## Description

PageStitch creates a screenshot of an entire webpage, the visible area, or a region selected by the user. It is designed for saving long articles, documentation, receipts, issue reports, and other pages that do not fit in one viewport.

Click the PageStitch toolbar button to start a full-page capture. If you prefer to choose each time, open Settings and change the toolbar action to the capture menu. The compact menu offers full-page, visible-area, and region modes and shows capture progress with a cancel control.

During a full-page capture, PageStitch temporarily pauses page animation, scrolls the active page, captures its visible sections, and restores the original page position. A local offscreen document stitches the sections into memory-bounded segments. This background action runs only after the user requests a capture; PageStitch does not monitor browsing in the background.

The finished screenshot opens in a clean editor with crop, pen, highlighter, rectangle, arrow, text, emoji, and pixelated-blur tools. Users can undo or redo changes and export PNG, JPEG, or multi-page PDF. A local library keeps a configurable number of recent captures for reopening, batch download, or deletion.

Screenshot pixels, page titles, URLs, and annotations stay inside the browser. PageStitch has no account, analytics, advertising, telemetry, upload server, data sale, or remote code. Preferences use browser sync when supported and local extension storage otherwise.

PageStitch requests temporary access only to the page where the user invokes it and does not request persistent access to all websites.

## Reviewer notes

Use the reviewer instructions in `store/chrome/LISTING_EN.md`. The Opera ZIP requires Opera 95 or newer because the extension's local image assembly uses the Offscreen API available from the Chromium 109 base. No network API is called.
