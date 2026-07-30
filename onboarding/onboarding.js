import {
  PRIVACY_CONSENT_KEY,
  PRIVACY_CONSENT_VERSION
} from "../shared/constants.js";
import { localizeDocument, message } from "../shared/i18n.js";

const enableButton = document.querySelector("#enable-button");
const closeButton = document.querySelector("#close-button");
const status = document.querySelector("#status");

async function closeCurrentTab() {
  const tab = await chrome.tabs.getCurrent();
  if (Number.isInteger(tab?.id)) {
    await chrome.tabs.remove(tab.id);
  } else {
    window.close();
  }
}

async function renderConsentState() {
  const stored = await chrome.storage.local.get(PRIVACY_CONSENT_KEY);
  const enabled = stored[PRIVACY_CONSENT_KEY] === PRIVACY_CONSENT_VERSION;
  enableButton.disabled = enabled;
  status.hidden = !enabled;
  if (enabled) {
    enableButton.textContent = message("pageStitchEnabled");
    closeButton.textContent = message("close");
  }
}

enableButton.addEventListener("click", async () => {
  enableButton.disabled = true;
  await chrome.storage.local.set({
    [PRIVACY_CONSENT_KEY]: PRIVACY_CONSENT_VERSION
  });
  await renderConsentState();
  closeButton.focus();
});

closeButton.addEventListener("click", () => {
  closeCurrentTab().catch(() => window.close());
});

localizeDocument();
await renderConsentState();
