# PageStitch

PageStitch is a privacy-first Chrome and Opera extension for capturing, editing, and exporting complete web pages. It is an original implementation with no accounts, uploads, analytics, or paid feature gates.

## Features

- Full-page scroll-and-stitch capture with progress and cancellation
- One-click toolbar capture, with an optional three-mode popup menu
- Visible-area and selected-region capture
- Handles document scrolling and detects large inner scroll containers
- Pauses CSS animations, neutralizes smooth scrolling, and restores the original page position
- Hides repeated fixed and sticky elements after their first natural appearance
- Segmented image assembly for pages that exceed the browser's single-canvas limit
- Local capture history in IndexedDB
- Capture library with selection, batch download, and batch deletion
- Crop, pen, highlighter, rectangle, arrow, text, emoji, and pixelated blur tools
- Undo and redo
- Zoom and fit-to-width preview
- PNG, JPEG, and multi-page A4/Letter PDF export
- Smart PDF page boundaries that look for low-detail horizontal gaps
- Direct clipboard copy for images within canvas limits
- Drag-to-desktop PNG for captures within single-canvas limits
- Auto-download, Save As, Downloads subfolder, and configurable history
- English and Russian interface
- Keyboard shortcuts and page context-menu actions

## Install an unpacked development build

1. Open `chrome://extensions` in Chrome/Chromium or `opera://extensions` in Opera.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Pin **PageStitch** to the toolbar.

The primary shortcut is `Alt+Shift+P`. Shortcut assignments can be changed from the browser's extensions shortcut page.

## Development and store packages

PageStitch uses plain Manifest V3 JavaScript and has no runtime or build dependencies.

```sh
npm run verify
npm run package
```

`npm run package` creates two minimal, integrity-checked archives:

- `dist/pagestitch-<version>-chrome.zip`
- `dist/pagestitch-<version>-opera.zip`

Use `npm run package:chrome` or `npm run package:opera` to build one target. The Opera archive replaces Chrome's minimum-version field with `minimum_opera_version: "95"`. Store archives contain runtime files and the required MIT license notice; source documentation, tests, and packaging scripts are excluded.

The verification command validates the manifest, localized metadata limits, locale parity, CSP-safe HTML, JavaScript syntax, permission allowlist, and unit tests.

For a manual capture test, open `test/fixtures/tall-page.html` through a local HTTP server or a regular `file://` tab with file access enabled for the extension.

The full manual verification matrix is in [`docs/SMOKE_TEST.md`](docs/SMOKE_TEST.md). Publication copy, permission justifications, and the release checklist are in [`store/README.md`](store/README.md).

## Architecture

- `background/service-worker.js` coordinates scrolling, throttles `captureVisibleTab`, and opens the editor.
- `content/capture.js` prepares and scrolls the page, manages region selection, and restores page state.
- `offscreen/offscreen.js` stitches viewport images into adaptive, memory-bounded segments and stores them locally.
- `editor/` virtualizes capture segments, applies non-destructive annotations, and exports files.
- `shared/db.js` owns the IndexedDB session and segment stores.

Captured page data never leaves the browser.

## Browser support

The Chrome manifest targets Chrome/Chromium 109 or newer. The Opera store package targets Opera 95 or newer; Opera 95 is Chromium 109-based and supports the required Manifest V3 Offscreen API. Settings use sync storage when the browser supports it and automatically fall back to local extension storage.

Other Chromium-based browsers may work but are not store targets in this repository.

## Known platform limits

- Browsers do not permit content scripts on internal pages such as `chrome://extensions`, `opera://extensions`, or extension-store pages.
- The source tab must remain active during a full-page capture because `captureVisibleTab` captures the active tab in its window.
- Very long images are exported as numbered PNG/JPEG parts; PDF export remains multi-page.
- Cross-origin iframe contents are captured as pixels, but PageStitch cannot inspect or independently scroll a cross-origin frame.
- Sites that continuously append content can keep changing their height; PageStitch caps a capture at 250 sections and marks the saved result as truncated.

## License

MIT. See [LICENSE](LICENSE).
