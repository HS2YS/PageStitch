import { DEFAULT_SETTINGS } from "./constants.js";

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(patch) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const next = Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowed.includes(key))
  );
  await chrome.storage.sync.set(next);
  return getSettings();
}
