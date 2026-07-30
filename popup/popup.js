import { CAPTURE_MODE, MESSAGE } from "../shared/constants.js";
import { listSessions } from "../shared/db.js";
import { localizeDocument, message } from "../shared/i18n.js";
import { bytesToHumanSize } from "../shared/utils.js";

const elements = {
  capturePanel: document.querySelector("#capture-panel"),
  statusPanel: document.querySelector("#status-panel"),
  errorPanel: document.querySelector("#error-panel"),
  statusTitle: document.querySelector("#status-title"),
  statusDetail: document.querySelector("#status-detail"),
  progressBar: document.querySelector("#progress-bar"),
  cancelButton: document.querySelector("#cancel-button"),
  errorMessage: document.querySelector("#error-message"),
  recentCapture: document.querySelector("#recent-capture"),
  recentThumbnail: document.querySelector("#recent-thumbnail"),
  recentTitle: document.querySelector("#recent-title"),
  recentMeta: document.querySelector("#recent-meta"),
  emptyRecent: document.querySelector("#empty-recent"),
  settingsButton: document.querySelector("#settings-button")
};

let thumbnailUrl = null;

function detailForState(state) {
  if (state.status === "preparing") return message("preparing");
  if (state.status === "assembling") return message("assembling");
  if (state.status === "selecting") return message("regionHint");
  if (state.status === "capturing") {
    return message("scrolling", [String(state.step || 1), String(state.total || 1)]);
  }
  return message("capturing");
}

function errorCopy(error) {
  const codes = {
    RESTRICTED_PAGE: "restrictedPage",
    CAPTURE_IN_PROGRESS: "captureInProgress",
    TAB_NOT_ACTIVE: "tabNotActive",
    SCROLL_STUCK: "scrollStuck"
  };
  const key = codes[error?.code];
  return key ? message(key) : (error?.message || message("captureFailed"));
}

function renderState(state) {
  const busy = ["preparing", "capturing", "assembling", "selecting"].includes(state.status);
  elements.capturePanel.hidden = busy;
  elements.statusPanel.hidden = !busy;
  elements.errorPanel.hidden = state.status !== "error";

  if (busy) {
    elements.statusTitle.textContent = state.status === "assembling"
      ? message("assembling")
      : message("capturing");
    elements.statusDetail.textContent = detailForState(state);
    elements.progressBar.style.width = `${Math.max(4, Math.round((state.progress || 0) * 100))}%`;
  }
  if (state.status === "error") {
    elements.errorMessage.textContent = errorCopy(state.error);
  }
}

async function startCapture(mode) {
  elements.errorPanel.hidden = true;
  renderState({ status: mode === CAPTURE_MODE.REGION ? "selecting" : "preparing", progress: 0 });
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE.START_CAPTURE,
    mode
  });
  if (response?.error) {
    renderState({ status: "error", error: response.error });
    return;
  }
  setTimeout(() => window.close(), 180);
}

async function loadRecentCapture() {
  const sessions = await listSessions(1);
  const session = sessions[0];
  if (!session) return;

  elements.emptyRecent.hidden = true;
  elements.recentCapture.hidden = false;
  elements.recentTitle.textContent = session.title || message("editorTitle");
  elements.recentMeta.textContent = `${session.width} × ${session.height} · ${bytesToHumanSize(session.byteSize)}`;
  if (session.thumbnail) {
    thumbnailUrl = URL.createObjectURL(session.thumbnail);
    elements.recentThumbnail.src = thumbnailUrl;
  }
  elements.recentCapture.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`editor/editor.html?id=${encodeURIComponent(session.id)}`)
    });
  });
}

for (const button of document.querySelectorAll(".capture-action")) {
  button.addEventListener("click", () => startCapture(button.dataset.mode));
}

elements.cancelButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: MESSAGE.CANCEL_CAPTURE });
  window.close();
});

elements.settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request) => {
  if (request?.type === MESSAGE.STATE_CHANGED) {
    renderState(request.state);
  }
});

addEventListener("unload", () => {
  if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
});

localizeDocument();
const response = await chrome.runtime.sendMessage({ type: MESSAGE.GET_STATE }).catch(() => null);
renderState(response?.state || { status: "idle" });
await loadRecentCapture();
