# Chrome Web Store — English

## Name

PageStitch — Full Page Capture

## Category

Productivity

## Single purpose

Capture, locally edit, organize, and export screenshots of webpages explicitly selected by the user.

## Detailed description

Capture an entire webpage, the visible area, or a selected region, then edit and export the result without uploading it.

PageStitch scrolls the page you choose, captures each visible section, and stitches the sections together inside your browser. A focused editor lets you crop, draw, highlight, add rectangles, arrows, text, emoji, and pixelated blur, then export to PNG, JPEG, or multi-page PDF.

Use the toolbar button for a full-page capture, or switch the toolbar action to a compact menu for full-page, visible-area, and region modes. Capture progress and cancellation remain visible while PageStitch works. Recent captures are available in a local library for reopening, batch download, or deletion.

Privacy is part of the workflow:

- Screenshot pixels, page title, URL, and annotations are processed locally.
- Captures remain in browser-local history until you delete them or the history limit removes them.
- PageStitch has no account, analytics, ads, telemetry, upload server, or remote code.
- PageStitch does not sell or share captured data.
- Non-sensitive preferences may use browser sync when available.

PageStitch requests temporary access only to the tab where you invoke it. It does not request persistent access to every website.

## Privacy practices

Disclose that the extension handles:

- **Website content:** visible page pixels and layout needed to create a requested screenshot.
- **Web browsing activity:** the URL and title of the page the user explicitly captures.
- **User-generated content:** annotations, crop choices, and exported screenshot content.

State that all three categories are used only for the extension's screenshot purpose. They are processed/stored locally, are not transmitted to the developer or third parties, are not sold, are not used for advertising or credit decisions, and are not used for purposes unrelated to the single purpose.

Certify compliance with the Chrome Web Store User Data Policy, including Limited Use. Enter the public HTTPS URL of the final `PRIVACY.md`.

## Reviewer test instructions

1. Install the packaged extension and open a normal HTTP or HTTPS page.
2. Click PageStitch. On first use, review the data-handling disclosure and choose **Enable PageStitch**.
3. Return to the page and click PageStitch again. The page scrolls while the badge shows progress.
4. The local editor opens when assembly completes.
5. Add an annotation and export PNG or PDF.
6. Open extension options, change **Toolbar click** to **Show capture menu**, and test visible-area and region modes.
7. Open the PageStitch library and delete the capture.

The extension intentionally fails on browser-internal and extension-store pages because browsers do not allow content-script access there.
