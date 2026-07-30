# Publication checklist

## Release package

- [ ] Run `npm run verify`.
- [ ] Run `npm run package`.
- [ ] Upload `dist/pagestitch-0.4.0-chrome.zip` to Chrome Web Store.
- [ ] Upload `dist/pagestitch-0.4.0-opera.zip` to Opera Add-ons.
- [ ] Confirm `manifest.json` is at each ZIP root.
- [ ] Confirm the Chrome manifest has `minimum_chrome_version: "109"`.
- [ ] Confirm the Opera manifest has `minimum_opera_version: "95"` and no Chrome-specific minimum field.
- [ ] Confirm no source maps, test fixtures, docs, packaging scripts, `.DS_Store`, remote code, or unused SVG are in either ZIP.

## Identity, privacy, and support

- [ ] Replace the placeholder contact paragraph in `PRIVACY.md`.
- [ ] Publish the final privacy policy at a stable public HTTPS URL.
- [ ] Use the same policy URL and data statements in both dashboards.
- [ ] Supply a monitored support email or relevant support-page URL.
- [ ] Use the PageStitch name and icon only; do not imply affiliation with another extension or browser vendor.
- [ ] Confirm the first-use disclosure appears before the first screenshot is processed.

## Chrome Web Store

- [ ] Category: **Productivity**.
- [ ] Single purpose: capture, locally edit, organize, and export screenshots of webpages explicitly selected by the user.
- [ ] Add the English and Russian detailed descriptions from `chrome/`.
- [ ] Upload the included 128×128 PNG icon.
- [ ] Upload at least one real 1280×800 or 640×400 screenshot; up to five may be supplied.
- [ ] Upload `store/assets/chrome-small-promo.png` as the 440×280 small promotional image.
- [ ] Complete Privacy practices using the declarations in `chrome/LISTING_EN.md`.
- [ ] Certify Limited Use.
- [ ] Paste permission justifications from `PERMISSIONS.md`.
- [ ] Complete Distribution and Test instructions.
- [ ] Do not claim the extension collects no data merely because processing is local; disclose website content, browsing activity (title/URL), and annotations.

## Opera Add-ons

- [ ] Category: **Productivity**.
- [ ] License: **MIT**.
- [ ] Add the English and Russian summary/description from `opera/`.
- [ ] Upload real Opera screenshots at 612×408 preferred and no larger than 800×600.
- [ ] Use a white-background page and Opera's default browser UI.
- [ ] Test the packaged build on current Opera for Windows and macOS.
- [ ] Describe the toolbar behavior, page interaction, and local background stitching accurately.
- [ ] Supply reviewer notes explaining that Offscreen Canvas processing is local and no network APIs are used.

## Manual regression

- [ ] Complete every applicable item in `docs/SMOKE_TEST.md` in Chrome.
- [ ] Repeat capture, export, library, first-use disclosure, and restricted-page tests in Opera.
- [ ] Test full-page, visible-area, and region capture.
- [ ] Test PNG, JPEG, PDF, clipboard, Save As, and automatic download.
- [ ] Test English and Russian UI.
- [ ] Verify uninstall/reinstall resets local consent and local capture history as expected.
