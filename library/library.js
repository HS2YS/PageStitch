import { CAPTURE_MODE } from "../shared/constants.js";
import {
  deleteSession,
  getSegments,
  listSessions
} from "../shared/db.js";
import {
  maximumPartHeight,
  normalizeRegion,
  renderCaptureRegionFromRecords
} from "../shared/image-renderer.js";
import { localizeDocument, message } from "../shared/i18n.js";
import { getSettings } from "../shared/settings.js";
import {
  buildFilename,
  bytesToHumanSize,
  canvasToBlob,
  withDownloadSubfolder
} from "../shared/utils.js";

const elements = {
  grid: document.querySelector("#capture-grid"),
  loading: document.querySelector("#loading"),
  empty: document.querySelector("#empty-state"),
  template: document.querySelector("#capture-card-template"),
  selectAll: document.querySelector("#select-all"),
  batchBar: document.querySelector("#batch-bar"),
  selectionCount: document.querySelector("#selection-count"),
  batchDownload: document.querySelector("#batch-download"),
  batchDelete: document.querySelector("#batch-delete"),
  storageSummary: document.querySelector("#storage-summary"),
  settings: document.querySelector("#settings-button"),
  toast: document.querySelector("#toast")
};

let sessions = [];
const selected = new Set();
const thumbnailUrls = new Map();
let toastTimer = null;

function showToast(copy) {
  elements.toast.textContent = copy;
  elements.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

function openCapture(id) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`editor/editor.html?id=${encodeURIComponent(id)}`)
  });
}

function updateBatchState() {
  const count = selected.size;
  elements.batchBar.hidden = count === 0;
  elements.selectionCount.textContent = message("selectedCount", [String(count)]);
  elements.selectAll.checked = count > 0 && count === sessions.length;
  elements.selectAll.indeterminate = count > 0 && count < sessions.length;
  for (const card of elements.grid.querySelectorAll(".capture-card")) {
    const isSelected = selected.has(card.dataset.id);
    card.classList.toggle("is-selected", isSelected);
    card.querySelector(".card-select input").checked = isSelected;
  }
}

function sourceLabel(url) {
  try {
    return new URL(url).hostname || message("localPage");
  } catch {
    return message("localPage");
  }
}

function modeLabel(mode) {
  return {
    [CAPTURE_MODE.FULL]: message("fullPageMode"),
    [CAPTURE_MODE.VISIBLE]: message("visibleMode"),
    [CAPTURE_MODE.REGION]: message("regionMode")
  }[mode] || mode;
}

function createCard(session) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  card.dataset.id = session.id;
  card.querySelector(".card-copy strong").textContent = session.title || message("editorTitle");
  card.querySelector(".source").textContent = sourceLabel(session.url);
  card.querySelector(".card-meta").textContent =
    `${session.width} × ${session.height} px · ${bytesToHumanSize(session.byteSize)} · ` +
    new Date(session.createdAt).toLocaleDateString();
  card.querySelector(".mode-badge").textContent =
    `${modeLabel(session.mode)}${session.truncated ? ` · ${message("truncated")}` : ""}`;

  const thumbnail = card.querySelector(".thumbnail img");
  if (session.thumbnail) {
    const url = URL.createObjectURL(session.thumbnail);
    thumbnailUrls.set(session.id, url);
    thumbnail.src = url;
  }

  card.querySelector(".card-open").addEventListener("click", () => openCapture(session.id));
  card.querySelector(".open-action").addEventListener("click", () => openCapture(session.id));
  card.querySelector(".card-select input").addEventListener("change", (event) => {
    if (event.target.checked) selected.add(session.id);
    else selected.delete(session.id);
    updateBatchState();
  });
  card.querySelector(".delete-action").addEventListener("click", async () => {
    if (!confirm(message("deleteConfirm"))) return;
    await deleteSession(session.id);
    selected.delete(session.id);
    await refresh();
  });
  return card;
}

async function refresh() {
  for (const url of thumbnailUrls.values()) URL.revokeObjectURL(url);
  thumbnailUrls.clear();
  elements.grid.replaceChildren();
  sessions = await listSessions(1000);
  selected.forEach((id) => {
    if (!sessions.some((session) => session.id === id)) selected.delete(id);
  });

  const totalBytes = sessions.reduce((sum, session) => sum + (session.byteSize || 0), 0);
  elements.storageSummary.textContent = message("librarySummary", [
    String(sessions.length),
    bytesToHumanSize(totalBytes)
  ]);
  elements.loading.hidden = true;
  elements.empty.hidden = sessions.length !== 0;
  elements.grid.hidden = sessions.length === 0;
  for (const session of sessions) elements.grid.append(createCard(session));
  updateBatchState();
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportCapture(session, settings) {
  const records = await getSegments(session.id);
  const region = normalizeRegion(session.crop, session.width, session.height);
  const partHeight = maximumPartHeight(region.width);
  const partCount = Math.ceil(region.height / partHeight);
  const format = settings.format === "jpeg" ? "jpeg" : "png";
  const extension = format === "jpeg" ? "jpg" : "png";
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const base = buildFilename(settings.fileNameTemplate, session, extension);
  const stem = base.slice(0, -(extension.length + 1));

  for (let index = 0; index < partCount; index += 1) {
    const currentRegion = {
      x: region.x,
      y: region.y + index * partHeight,
      width: region.width,
      height: Math.min(partHeight, region.height - index * partHeight)
    };
    const canvas = await renderCaptureRegionFromRecords({
      records,
      annotations: session.annotations || [],
      region: currentRegion
    });
    const blob = await canvasToBlob(canvas, mime, settings.jpegQuality);
    const filename = partCount === 1
      ? base
      : `${stem}-${String(index + 1).padStart(2, "0")}.${extension}`;
    await downloadBlob(
      blob,
      withDownloadSubfolder(filename, settings.downloadSubfolder)
    );
  }
}

async function downloadSelected() {
  elements.batchDownload.disabled = true;
  elements.batchDelete.disabled = true;
  try {
    const settings = await getSettings();
    const chosen = sessions.filter((session) => selected.has(session.id));
    for (let index = 0; index < chosen.length; index += 1) {
      elements.selectionCount.textContent = message("batchProgress", [
        String(index + 1),
        String(chosen.length)
      ]);
      await exportCapture(chosen[index], settings);
    }
    if (settings.format === "pdf") {
      showToast(message("batchPdfFallback"));
    } else {
      showToast(message("batchDownloaded", [String(chosen.length)]));
    }
  } catch (error) {
    showToast(error.message || message("captureFailed"));
  } finally {
    elements.batchDownload.disabled = false;
    elements.batchDelete.disabled = false;
    updateBatchState();
  }
}

async function deleteSelected() {
  if (!confirm(message("deleteSelectedConfirm", [String(selected.size)]))) return;
  elements.batchDownload.disabled = true;
  elements.batchDelete.disabled = true;
  try {
    await Promise.all([...selected].map((id) => deleteSession(id)));
    selected.clear();
    await refresh();
  } finally {
    elements.batchDownload.disabled = false;
    elements.batchDelete.disabled = false;
  }
}

elements.selectAll.addEventListener("change", () => {
  if (elements.selectAll.checked) {
    for (const session of sessions) selected.add(session.id);
  } else {
    selected.clear();
  }
  updateBatchState();
});
elements.batchDownload.addEventListener("click", downloadSelected);
elements.batchDelete.addEventListener("click", deleteSelected);
elements.settings.addEventListener("click", () => chrome.runtime.openOptionsPage());
addEventListener("unload", () => {
  for (const url of thumbnailUrls.values()) URL.revokeObjectURL(url);
});

localizeDocument();
await refresh();
