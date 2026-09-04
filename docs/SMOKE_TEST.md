# Chrome and Opera smoke-test checklist

Use disposable Chrome and Opera profiles if possible. Complete the full checklist in both packaged builds before store submission.

## Install

1. Open `chrome://extensions` in Chrome or `opera://extensions` in Opera.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose the PageStitch repository folder.
4. Confirm the extension loads without manifest or service-worker errors.
5. Pin PageStitch to the toolbar.

## First-use privacy disclosure

1. With fresh extension storage, click PageStitch on a normal webpage.
2. Confirm no screenshot starts and the privacy setup page opens.
3. Confirm the page names the processed data, local retention, optional browser settings sync, and lack of network sharing.
4. Choose **Not now**, invoke PageStitch again, and confirm the disclosure still blocks capture.
5. Choose **Enable PageStitch**, return to the source page, and invoke the capture again.
6. Confirm the disclosure can be reopened from the Privacy section in Settings.

## Full-page capture

1. Serve `test/fixtures` from a local HTTP server or open any long public page.
2. Click the PageStitch icon once.
3. Confirm the page scrolls, the HUD/badge updates, and the original scroll position is restored.
4. Confirm the editor opens and the sticky header appears only once.
5. Inspect every join between sections for gaps, duplicated strips, and scale changes.

## Same-origin iframe

1. Open `test/fixtures/frame-host.html` from a local HTTP server.
2. Capture the full page.
3. Confirm all four iframe sections appear and its sticky header is not repeated.

## Inner scroll container

1. Open `test/fixtures/scroll-container.html` from a local HTTP server.
2. Capture the full page.
3. Confirm PageStitch chooses the large inner container despite the fixture's small outer-page scroll.
4. Confirm all four container sections appear, the outer dark page is cropped away, and the sticky header appears only once.

## Editor and export

1. Add a pen stroke, highlighter, rectangle, arrow, text, emoji, and blur region.
2. Select an annotation, move it, delete it, then use undo/redo.
3. Crop the result.
4. Export PNG, JPEG, A4 portrait PDF, and Letter landscape PDF.
5. Open each file and verify dimensions, annotations, crop, PDF page count, metadata, and final-page content.
6. Copy a normal-sized capture to the clipboard.

## Long-page and library behavior

1. Capture a page tall enough to create multiple internal segments.
2. Scroll through the editor, zoom from fit view to 100%, and confirm segments appear continuously without permanent blank bands.
3. In the browser's task manager, confirm editor memory does not grow with every segment after scrolling away from it.
4. Export the capture and confirm numbered files are produced where required.
5. Open the capture library from the editor or extension action context menu.
6. Select several captures, batch-download them, then batch-delete test captures.
7. Change the history limit and confirm old captures are trimmed.

## Interrupted capture

1. Start a full-page capture, then navigate the source tab before it finishes.
2. Confirm the capture stops and no incomplete item is added to the library.
3. Start again, close the source tab during capture, and confirm no orphaned progress state remains.
4. Click PageStitch on a restricted `chrome://` or `opera://` page and confirm a temporary error badge/title appears.

## Settings and privacy

1. Switch toolbar behavior between immediate capture and popup menu.
2. Test automatic download, Save As on/off, JPEG quality, and a Downloads subfolder.
3. Inspect the browser's extensions page and confirm PageStitch has no persistent access to all sites.
4. Inspect the service-worker console for uncaught errors after all scenarios.

## Packaged builds and locales

1. Load the unpacked contents of the generated Chrome ZIP in Chrome and the Opera ZIP in Opera.
2. Confirm the Chrome package requires Chrome 109 and the Opera package requires Opera 95.
3. Repeat capture, editor, export, library, and privacy-disclosure checks with browser language set to English and Russian.
4. Run the Windows and macOS matrix on current stable browser versions and record the tested versions and dates in the release notes.
