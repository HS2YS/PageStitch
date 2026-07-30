# PageStitch privacy policy

Effective date: July 30, 2026

PageStitch is a browser extension whose single purpose is to capture, edit, organize, and export screenshots of web pages selected by the user. All screenshot processing is performed inside the user's Chrome, Chromium, or Opera browser.

## Data PageStitch handles

When the user starts a capture, PageStitch temporarily processes:

- the visible pixels and layout of the selected web page;
- the page title and URL;
- the area selected by the user, when region capture is used;
- annotations and crop choices created in the editor;
- export preferences and other extension settings.

This can qualify as website content, web browsing activity, and user-generated content under browser-store policies. PageStitch handles it only to provide the screenshot workflow the user explicitly starts.

## How data is used

PageStitch uses page pixels and layout to assemble the requested screenshot. The title and URL are used for local history, filenames, source links, and optional PDF metadata. Annotations and crop choices are used to create the user's edited export. Preferences are used to configure future captures and exports.

PageStitch does not use this data for advertising, analytics, profiling, credit decisions, or any purpose unrelated to its screenshot functionality.

## Storage, retention, and deletion

Captures, titles, URLs, thumbnails, and annotations are stored locally in the extension's IndexedDB database. They remain until the user deletes them or the configured history limit removes older captures. Uninstalling the extension instructs the browser to remove its extension storage.

Non-sensitive preferences may be stored in the browser's extension sync storage and may sync through the user's browser account if browser sync is enabled. On browsers where sync storage is unavailable, preferences stay in local extension storage. The first-use privacy choice is stored locally.

Users can delete individual captures or selected captures from the PageStitch library. They can also remove all extension data by uninstalling PageStitch or clearing its site/extension storage in the browser.

## Transmission and sharing

PageStitch has no account system, analytics, telemetry, advertising, upload server, or network-based screenshot service. It does not transmit or sell screenshots, page content, titles, URLs, annotations, or usage data to the PageStitch developer, data brokers, advertisers, or other third parties.

If the user's browser syncs preferences, that synchronization is provided and controlled by the browser vendor under the user's browser-account settings. PageStitch does not receive that synced data.

## Permissions

PageStitch uses temporary `activeTab` access only after an explicit toolbar, menu, context-menu, or keyboard action. It does not request persistent access to all websites. Other permissions are limited to local capture and page preparation, screenshot assembly, settings, history capacity, clipboard copy, context-menu actions, and saving exported files.

## Security and remote code

All executable code is included in the installed extension package. PageStitch does not download or execute remote code and does not expose captured data through a network API.

## Limited Use

PageStitch's use of information received from browser APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide or improve the user-facing screenshot functionality described in the store listing.

## Changes

If PageStitch's data practices materially change, this policy and the in-product disclosure will be updated before the new practice is introduced.

## Contact

Before publication, the publisher must replace this paragraph with a monitored support email address or support-page URL. The same contact destination should be supplied to the Chrome Web Store and Opera Add-ons dashboards.
