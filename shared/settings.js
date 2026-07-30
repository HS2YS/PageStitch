import { DEFAULT_SETTINGS } from "./constants.js";

function availableStorageAreas() {
  return [chrome.storage?.sync, chrome.storage?.local].filter(Boolean);
}

export async function getSettings() {
  for (const area of availableStorageAreas()) {
    try {
      const stored = await area.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch {
      // Opera versions without storage.sync fall back to local extension storage.
    }
  }
  return { ...DEFAULT_SETTINGS };
}

export async function setSettings(patch) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const next = Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowed.includes(key))
  );
  for (const area of availableStorageAreas()) {
    try {
      await area.set(next);
      const stored = await area.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch {
      // Try the next supported storage area.
    }
  }
  throw new Error("Extension settings storage is unavailable.");
}
