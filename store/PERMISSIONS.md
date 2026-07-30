# Permission justifications

PageStitch requests no `host_permissions` and does not have persistent access to every website.

| Permission | Why it is required |
| --- | --- |
| `activeTab` | Temporarily accesses and captures only the tab on which the user explicitly invokes PageStitch. |
| `clipboardWrite` | Copies a user-requested screenshot or edited image to the system clipboard. |
| `contextMenus` | Adds user-invoked capture and library shortcuts to the page and extension-button context menus. |
| `downloads` | Saves PNG, JPEG, and PDF exports selected by the user. |
| `offscreen` | Creates a hidden local document that stitches captured viewport images with Canvas APIs under Manifest V3. |
| `scripting` | Injects the bundled capture script after a user action to measure/scroll the page, pause animation, hide repeated fixed elements, or select a region. |
| `storage` | Stores preferences and the first-use privacy choice in browser-managed extension storage. |
| `unlimitedStorage` | Prevents large or segmented local screenshots from failing because of the small default extension-storage quota. |

The extension does not use remote code or any network API. Page content access occurs only after the user requests a capture and is restored when the operation finishes.
