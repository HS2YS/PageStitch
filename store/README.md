# Store publication kit

The generated Chrome and Opera ZIP files are technically prepared for their respective extension dashboards. They contain only extension runtime files and the required MIT license notice. The files in this directory provide the remaining listing copy and reviewer information; they are intentionally excluded from the ZIP files.

## Files

- `chrome/LISTING_EN.md` and `chrome/LISTING_RU.md`: Chrome Web Store copy and privacy declarations.
- `opera/LISTING_EN.md` and `opera/LISTING_RU.md`: Opera Add-ons summary and description.
- `PERMISSIONS.md`: permission-by-permission justification for reviewers.
- `PUBLISHING_CHECKLIST.md`: package, graphic asset, privacy, test, and submission steps.
- `SCREENSHOT_PLAN.md`: truthful screenshots that must be captured from the real extension.
- `assets/chrome-small-promo.png`: required 440×280 Chrome promotional tile, with an editable SVG source beside it.

## Publisher-owned fields still required

These values cannot be generated from source code and must be supplied by the publisher:

- legal or public developer name;
- monitored support email or relevant HTTPS support page;
- public HTTPS URL hosting the final `PRIVACY.md`;
- Chrome Web Store developer account and Opera Add-ons account;
- geographic distribution choices;
- real screenshots captured in Chrome and Opera;
- confirmation of manual testing on current Windows and macOS builds.

Do not submit the placeholder contact paragraph in `PRIVACY.md`. Replace it with real contact information, publish the policy at a stable HTTPS URL, and use that exact URL in both dashboards.
