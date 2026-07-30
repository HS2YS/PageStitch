import {
  CAPTURE_MODE,
  MAX_SINGLE_CANVAS_AREA,
  MAX_SINGLE_CANVAS_HEIGHT
} from "../shared/constants.js";
import {
  deleteSession,
  getSegments,
  getSession,
  putSession
} from "../shared/db.js";
import {
  annotationBounds,
  drawAnnotations,
  rectanglesIntersect
} from "../shared/annotations.js";
import { localizeDocument, message } from "../shared/i18n.js";
import { buildPdfFromJpegs } from "../shared/pdf.js";
import { chooseLowEnergyRow } from "../shared/pagination.js";
import { getSettings } from "../shared/settings.js";
import {
  buildFilename,
  bytesToHumanSize,
  canvasToBlob,
  clamp,
  withDownloadSubfolder
} from "../shared/utils.js";

const elements = {
  workspace: document.querySelector("#workspace"),
  loading: document.querySelector("#loading-state"),
  missing: document.querySelector("#missing-state"),
  stage: document.querySelector("#stage-stack"),
  cropSelection: document.querySelector("#crop-selection"),
  cropSize: document.querySelector("#crop-size"),
  title: document.querySelector("#document-title"),
  meta: document.querySelector("#document-meta"),
  undo: document.querySelector("#undo-button"),
  redo: document.querySelector("#redo-button"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomFit: document.querySelector("#zoom-fit"),
  zoomIn: document.querySelector("#zoom-in"),
  drag: document.querySelector("#drag-button"),
  copy: document.querySelector("#copy-button"),
  export: document.querySelector("#export-button"),
  colorControl: document.querySelector("#color-control"),
  colorInput: document.querySelector("#color-input"),
  colorOutput: document.querySelector("#color-output"),
  strokeControl: document.querySelector("#stroke-control"),
  strokeInput: document.querySelector("#stroke-input"),
  strokeOutput: document.querySelector("#stroke-output"),
  activeToolLabel: document.querySelector("#active-tool-label"),
  resetCrop: document.querySelector("#reset-crop"),
  selectionActions: document.querySelector("#selection-actions"),
  selectionLabel: document.querySelector("#selection-label"),
  deleteAnnotation: document.querySelector("#delete-annotation"),
  emojiPalette: document.querySelector("#emoji-palette"),
  infoSize: document.querySelector("#info-size"),
  infoMode: document.querySelector("#info-mode"),
  infoSource: document.querySelector("#info-source"),
  newCapture: document.querySelector("#new-capture"),
  openLibrary: document.querySelector("#open-library"),
  deleteCapture: document.querySelector("#delete-capture"),
  exportDialog: document.querySelector("#export-dialog"),
  exportFormat: document.querySelector("#export-format"),
  exportQuality: document.querySelector("#export-quality"),
  exportQualityOutput: document.querySelector("#export-quality-output"),
  exportQualityRow: document.querySelector("#export-quality-row"),
  pdfFormat: document.querySelector("#pdf-format"),
  pdfOrientation: document.querySelector("#pdf-orientation"),
  pdfMetadata: document.querySelector("#pdf-metadata"),
  exportSummary: document.querySelector("#export-summary"),
  download: document.querySelector("#download-button"),
  textDialog: document.querySelector("#text-dialog"),
  textForm: document.querySelector("#text-form"),
  textInput: document.querySelector("#text-input"),
  toast: document.querySelector("#toast")
};

const state = {
  session: null,
  sources: [],
  annotations: [],
  crop: null,
  tool: "select",
  color: "#ef476f",
  strokeWidth: 4,
  emoji: "✨",
  zoom: 1,
  fitZoom: 1,
  draft: null,
  selectedIndex: -1,
  pointer: null,
  pendingTextPoint: null,
  history: [],
  historyIndex: -1,
  saveTimer: null,
  toastTimer: null,
  exporting: false,
  dragUrl: null,
  dragRevision: 0,
  dragTimer: null
};

const TOOL_LABEL_KEYS = {
  select: "selectTool",
  crop: "cropTool",
  pen: "penTool",
  highlight: "highlightTool",
  rectangle: "rectangleTool",
  arrow: "arrowTool",
  text: "textTool",
  blur: "blurTool",
  emoji: "emojiTool"
};

function normalRect(rect) {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  };
}

function getExportRegion() {
  if (!state.crop) {
    return { x: 0, y: 0, width: state.session.width, height: state.session.height };
  }
  const crop = normalRect(state.crop);
  return {
    x: clamp(Math.round(crop.x), 0, state.session.width - 1),
    y: clamp(Math.round(crop.y), 0, state.session.height - 1),
    width: clamp(Math.round(crop.width), 1, state.session.width - Math.max(0, crop.x)),
    height: clamp(Math.round(crop.height), 1, state.session.height - Math.max(0, crop.y))
  };
}

function showToast(copy) {
  elements.toast.textContent = copy;
  elements.toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2400);
}

function snapshot() {
  return JSON.stringify({
    annotations: state.annotations,
    crop: state.crop
  });
}

function updateHistoryButtons() {
  elements.undo.disabled = state.historyIndex <= 0;
  elements.redo.disabled = state.historyIndex >= state.history.length - 1;
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    state.session = {
      ...state.session,
      annotations: state.annotations,
      crop: state.crop
    };
    await putSession(state.session);
  }, 250);
  scheduleDragPreparation();
}

function scheduleDragPreparation() {
  clearTimeout(state.dragTimer);
  const revision = ++state.dragRevision;
  if (state.dragUrl) URL.revokeObjectURL(state.dragUrl);
  state.dragUrl = null;
  elements.drag.href = "#";
  elements.drag.setAttribute("aria-disabled", "true");
  state.dragTimer = setTimeout(() => prepareDragImage(revision), 600);
}

async function prepareDragImage(revision = ++state.dragRevision) {
  if (!state.session) return;
  const region = getExportRegion();
  if (
    region.height > maximumPartHeight(region.width) ||
    region.height > MAX_SINGLE_CANVAS_HEIGHT
  ) {
    elements.drag.setAttribute("aria-disabled", "true");
    elements.drag.title = message("dragTooLarge");
    return;
  }
  try {
    const settings = await getSettings();
    const canvas = await renderRegion(region);
    const blob = await canvasToBlob(canvas, "image/png");
    if (revision !== state.dragRevision) return;
    if (state.dragUrl) URL.revokeObjectURL(state.dragUrl);
    state.dragUrl = URL.createObjectURL(blob);
    elements.drag.href = state.dragUrl;
    elements.drag.download = buildFilename(settings.fileNameTemplate, state.session, "png");
    elements.drag.title = message("dragHint");
    elements.drag.setAttribute("aria-disabled", "false");
  } catch {
    elements.drag.setAttribute("aria-disabled", "true");
  }
}

function pushHistory() {
  const next = snapshot();
  if (state.history[state.historyIndex] === next) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(next);
  state.historyIndex = state.history.length - 1;
  updateHistoryButtons();
  scheduleSave();
}

function applyHistory(index) {
  if (index < 0 || index >= state.history.length) return;
  const saved = JSON.parse(state.history[index]);
  state.historyIndex = index;
  state.annotations = saved.annotations || [];
  state.crop = saved.crop || null;
  state.draft = null;
  state.selectedIndex = -1;
  renderAllSegments();
  renderCrop();
  updateSelectionInspector();
  updateHistoryButtons();
  scheduleSave();
}

function sourceViewport(source) {
  return {
    x: 0,
    y: source.top,
    width: state.session.width,
    height: source.height
  };
}

function renderSegment(index) {
  const source = state.sources[index];
  if (!source) return;
  const { context, canvas, bitmap } = source;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  context.restore();
  const annotations = state.draft
    ? [...state.annotations, state.draft]
    : state.annotations;
  drawAnnotations(context, annotations, {
    offset: { x: 0, y: source.top },
    viewport: sourceViewport(source),
    scale: 1
  });
  if (state.tool === "select" && state.selectedIndex >= 0) {
    const selected = state.annotations[state.selectedIndex];
    if (selected) {
      const bounds = annotationBounds(selected);
      if (rectanglesIntersect(bounds, sourceViewport(source))) {
        const localY = bounds.y - source.top;
        context.save();
        context.strokeStyle = "#6d4aff";
        context.fillStyle = "#ffffff";
        context.lineWidth = 2;
        context.setLineDash([7, 5]);
        context.strokeRect(bounds.x, localY, bounds.width, bounds.height);
        context.setLineDash([]);
        for (const [x, y] of [
          [bounds.x, localY],
          [bounds.x + bounds.width, localY],
          [bounds.x, localY + bounds.height],
          [bounds.x + bounds.width, localY + bounds.height]
        ]) {
          context.fillRect(x - 4, y - 4, 8, 8);
          context.strokeRect(x - 4, y - 4, 8, 8);
        }
        context.restore();
      }
    }
  }
}

function renderAllSegments() {
  for (let index = 0; index < state.sources.length; index += 1) {
    renderSegment(index);
  }
}

function impactedIndices(...annotations) {
  const bounds = annotations.filter(Boolean).map(annotationBounds);
  if (!bounds.length) return [];
  return state.sources
    .map((source, index) => (
      bounds.some((bound) => rectanglesIntersect(bound, sourceViewport(source)))
        ? index
        : -1
    ))
    .filter((index) => index >= 0);
}

function renderAffected(previousDraft, nextDraft) {
  for (const index of new Set(impactedIndices(previousDraft, nextDraft))) {
    renderSegment(index);
  }
}

function annotationAtPoint(point) {
  for (let index = state.annotations.length - 1; index >= 0; index -= 1) {
    const bounds = annotationBounds(state.annotations[index]);
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return index;
    }
  }
  return -1;
}

function moveAnnotation(annotation, deltaX, deltaY) {
  if (annotation.type === "pen" || annotation.type === "highlight") {
    for (const point of annotation.points) {
      point.x += deltaX;
      point.y += deltaY;
    }
  } else if (annotation.type === "arrow") {
    annotation.x1 += deltaX;
    annotation.y1 += deltaY;
    annotation.x2 += deltaX;
    annotation.y2 += deltaY;
  } else {
    annotation.x += deltaX;
    annotation.y += deltaY;
  }
}

function updateSelectionInspector() {
  const selected = state.annotations[state.selectedIndex];
  elements.selectionActions.hidden = state.tool !== "select" || !selected;
  if (selected) {
    elements.selectionLabel.textContent =
      `${message(TOOL_LABEL_KEYS[selected.type] || "selectTool")} · ${state.selectedIndex + 1}`;
  }
}

function deleteSelectedAnnotation() {
  if (state.selectedIndex < 0 || !state.annotations[state.selectedIndex]) return;
  const removed = state.annotations[state.selectedIndex];
  state.annotations.splice(state.selectedIndex, 1);
  state.selectedIndex = -1;
  renderAffected(removed, null);
  updateSelectionInspector();
  pushHistory();
}

function applyZoom(zoom, preserveCenter = true) {
  const oldZoom = state.zoom;
  const center = preserveCenter
    ? {
        x: (elements.workspace.scrollLeft + elements.workspace.clientWidth / 2) / oldZoom,
        y: (elements.workspace.scrollTop + elements.workspace.clientHeight / 2) / oldZoom
      }
    : null;

  state.zoom = clamp(zoom, 0.05, 2);
  elements.stage.style.width = `${state.session.width * state.zoom}px`;
  elements.stage.style.height = `${state.session.height * state.zoom}px`;
  for (const source of state.sources) {
    source.wrapper.style.height = `${source.height * state.zoom}px`;
  }
  elements.zoomFit.textContent = `${Math.round(state.zoom * 100)}%`;
  renderCrop();

  if (center) {
    elements.workspace.scrollLeft = center.x * state.zoom - elements.workspace.clientWidth / 2;
    elements.workspace.scrollTop = center.y * state.zoom - elements.workspace.clientHeight / 2;
  }
}

function fitToWidth() {
  const available = Math.max(160, elements.workspace.clientWidth - 96);
  state.fitZoom = clamp(available / state.session.width, 0.05, 1);
  applyZoom(state.fitZoom, false);
  elements.workspace.scrollLeft = Math.max(0, (elements.stage.offsetWidth - elements.workspace.clientWidth) / 2);
  elements.workspace.scrollTop = 0;
}

function renderCrop() {
  if (!state.crop) {
    elements.cropSelection.hidden = true;
    elements.resetCrop.hidden = true;
    return;
  }
  const crop = normalRect(state.crop);
  elements.cropSelection.hidden = false;
  elements.resetCrop.hidden = false;
  Object.assign(elements.cropSelection.style, {
    left: `${crop.x * state.zoom}px`,
    top: `${crop.y * state.zoom}px`,
    width: `${crop.width * state.zoom}px`,
    height: `${crop.height * state.zoom}px`
  });
  elements.cropSize.textContent = `${Math.round(crop.width)} × ${Math.round(crop.height)}`;
}

function pointFromEvent(event) {
  const rect = elements.stage.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) * (state.session.width / rect.width), 0, state.session.width),
    y: clamp((event.clientY - rect.top) * (state.session.height / rect.height), 0, state.session.height)
  };
}

function makeDraft(point) {
  const shared = {
    color: state.color,
    strokeWidth: state.strokeWidth
  };
  if (state.tool === "pen") {
    return { type: "pen", points: [point], ...shared };
  }
  if (state.tool === "highlight") {
    return {
      type: "highlight",
      points: [point],
      color: state.color,
      strokeWidth: Math.max(10, state.strokeWidth * 3)
    };
  }
  if (state.tool === "rectangle" || state.tool === "blur" || state.tool === "crop") {
    return {
      type: state.tool === "crop" ? "crop" : state.tool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      ...shared
    };
  }
  if (state.tool === "arrow") {
    return {
      type: "arrow",
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      ...shared
    };
  }
  return null;
}

function isUsefulDraft(draft) {
  if (!draft) return false;
  if (draft.type === "pen" || draft.type === "highlight") {
    return draft.points.length > 1;
  }
  if (draft.type === "arrow") {
    return Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 5;
  }
  const rect = normalRect(draft);
  return rect.width > 5 && rect.height > 5;
}

function updateDraft(point) {
  if (!state.draft) return;
  const previous = structuredClone(state.draft);
  if (state.draft.type === "pen" || state.draft.type === "highlight") {
    const last = state.draft.points.at(-1);
    if (Math.hypot(point.x - last.x, point.y - last.y) > 1.5 / state.zoom) {
      state.draft.points.push(point);
    }
  } else if (state.draft.type === "arrow") {
    state.draft.x2 = point.x;
    state.draft.y2 = point.y;
  } else {
    state.draft.width = point.x - state.draft.x;
    state.draft.height = point.y - state.draft.y;
  }
  renderAffected(previous, state.draft);
  if (state.draft.type === "crop") {
    state.crop = state.draft;
    renderCrop();
  }
}

function finishDraft() {
  const draft = state.draft;
  state.draft = null;
  if (!isUsefulDraft(draft)) {
    if (draft?.type === "crop") state.crop = null;
    renderAffected(draft, null);
    renderCrop();
    return;
  }

  if (draft.type === "crop") {
    state.crop = normalRect(draft);
    renderCrop();
  } else {
    state.annotations.push(draft);
    renderAffected(draft, null);
  }
  pushHistory();
}

function addPointAnnotation(type, point, text) {
  const annotation = {
    type,
    x: point.x,
    y: point.y,
    text,
    color: state.color,
    size: type === "emoji"
      ? 32 + state.strokeWidth * 2
      : 17 + state.strokeWidth * 2
  };
  state.annotations.push(annotation);
  renderAffected(null, annotation);
  pushHistory();
}

function setTool(tool) {
  const previousSelection = state.annotations[state.selectedIndex];
  state.tool = tool;
  state.draft = null;
  if (tool !== "select") state.selectedIndex = -1;
  for (const button of document.querySelectorAll(".tool-button")) {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  }
  elements.activeToolLabel.textContent = message(TOOL_LABEL_KEYS[tool]);
  elements.stage.classList.toggle("is-panning", tool === "select");
  elements.stage.classList.toggle("is-drawing", tool !== "select");
  elements.colorControl.hidden = ["select", "crop", "blur", "emoji"].includes(tool);
  elements.strokeControl.hidden = ["select", "crop", "blur"].includes(tool);
  elements.emojiPalette.hidden = tool !== "emoji";
  updateSelectionInspector();
  if (previousSelection) renderAffected(previousSelection, null);
}

function pointerDown(event) {
  if (event.button !== 0 || !state.session) return;
  event.preventDefault();
  elements.stage.setPointerCapture(event.pointerId);
  const point = pointFromEvent(event);
  state.pointer = {
    id: event.pointerId,
    startPoint: point,
    clientX: event.clientX,
    clientY: event.clientY,
    scrollLeft: elements.workspace.scrollLeft,
    scrollTop: elements.workspace.scrollTop
  };

  if (state.tool === "select") {
    const previousSelection = state.annotations[state.selectedIndex];
    const hitIndex = annotationAtPoint(point);
    state.selectedIndex = hitIndex;
    const nextSelection = state.annotations[state.selectedIndex];
    renderAffected(previousSelection, nextSelection);
    updateSelectionInspector();
    if (hitIndex >= 0) {
      state.pointer.movingAnnotation = true;
      state.pointer.originalAnnotation = structuredClone(nextSelection);
      state.pointer.lastPoint = point;
    } else {
      elements.stage.classList.add("is-dragging");
    }
    return;
  }
  if (state.tool === "text") {
    state.pendingTextPoint = point;
    state.pointer = null;
    elements.textInput.value = "";
    elements.textDialog.showModal();
    setTimeout(() => elements.textInput.focus(), 0);
    return;
  }
  if (state.tool === "emoji") {
    addPointAnnotation("emoji", point, state.emoji);
    state.pointer = null;
    return;
  }
  state.draft = makeDraft(point);
  if (state.draft?.type === "crop") {
    state.crop = state.draft;
    renderCrop();
  }
}

function pointerMove(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  event.preventDefault();
  if (state.tool === "select") {
    if (state.pointer.movingAnnotation) {
      const point = pointFromEvent(event);
      const annotation = state.annotations[state.selectedIndex];
      const previous = structuredClone(annotation);
      moveAnnotation(
        annotation,
        point.x - state.pointer.lastPoint.x,
        point.y - state.pointer.lastPoint.y
      );
      state.pointer.lastPoint = point;
      renderAffected(previous, annotation);
    } else {
      elements.workspace.scrollLeft =
        state.pointer.scrollLeft - (event.clientX - state.pointer.clientX);
      elements.workspace.scrollTop =
        state.pointer.scrollTop - (event.clientY - state.pointer.clientY);
    }
    return;
  }
  updateDraft(pointFromEvent(event));
}

function pointerUp(event) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  elements.stage.releasePointerCapture(event.pointerId);
  const pointer = state.pointer;
  state.pointer = null;
  elements.stage.classList.remove("is-dragging");
  if (state.tool !== "select") {
    finishDraft();
  } else if (
    pointer.movingAnnotation &&
    JSON.stringify(pointer.originalAnnotation) !==
      JSON.stringify(state.annotations[state.selectedIndex])
  ) {
    pushHistory();
  }
}

async function drawSourceRegion(context, region, destination) {
  const scaleX = destination.width / region.width;
  const scaleY = destination.height / region.height;
  for (const source of state.sources) {
    const intersectionTop = Math.max(region.y, source.top);
    const intersectionBottom = Math.min(region.y + region.height, source.top + source.height);
    if (intersectionBottom <= intersectionTop) continue;

    const sourceY = intersectionTop - source.top;
    const sourceHeight = intersectionBottom - intersectionTop;
    const destinationY = destination.y + (intersectionTop - region.y) * scaleY;
    context.drawImage(
      source.bitmap,
      region.x,
      sourceY,
      region.width,
      sourceHeight,
      destination.x,
      destinationY,
      destination.width,
      sourceHeight * scaleY
    );
  }
  return { scaleX, scaleY };
}

async function renderRegion(region, targetWidth = region.width) {
  const scale = targetWidth / region.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await drawSourceRegion(context, region, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
  });
  drawAnnotations(context, state.annotations, {
    offset: { x: region.x, y: region.y },
    viewport: region,
    scale
  });
  return canvas;
}

function maximumPartHeight(width) {
  return Math.max(
    1,
    Math.min(MAX_SINGLE_CANVAS_HEIGHT, Math.floor(MAX_SINGLE_CANVAS_AREA / width))
  );
}

async function downloadBlob(blob, filename, saveAs) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename,
    saveAs,
    conflictAction: "uniquify"
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportImage(format, quality) {
  const settings = await getSettings();
  const region = getExportRegion();
  const partHeight = maximumPartHeight(region.width);
  const partCount = Math.ceil(region.height / partHeight);
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const extension = format === "jpeg" ? "jpg" : "png";
  const baseFilename = buildFilename(settings.fileNameTemplate, state.session, extension);
  const stem = baseFilename.slice(0, -(extension.length + 1));

  for (let index = 0; index < partCount; index += 1) {
    const current = {
      x: region.x,
      y: region.y + index * partHeight,
      width: region.width,
      height: Math.min(partHeight, region.height - index * partHeight)
    };
    const canvas = await renderRegion(current);
    const blob = await canvasToBlob(canvas, mime, quality);
    const filename = partCount === 1
      ? baseFilename
      : `${stem}-${String(index + 1).padStart(2, "0")}.${extension}`;
    await downloadBlob(
      blob,
      withDownloadSubfolder(filename, settings.downloadSubfolder),
      settings.saveAs && partCount === 1
    );
  }

  showToast(partCount > 1
    ? message("exportParts", [String(partCount)])
    : message("exportReady"));
}

function pdfPageSize(format, orientation) {
  const sizes = {
    a4: { width: 595.28, height: 841.89 },
    letter: { width: 612, height: 792 }
  };
  const selected = { ...(sizes[format] || sizes.a4) };
  if (orientation === "landscape") {
    [selected.width, selected.height] = [selected.height, selected.width];
  }
  return selected;
}

function compactUrl(url, maximum = 88) {
  if (!url) return "";
  return url.length > maximum ? `${url.slice(0, maximum - 1)}…` : url;
}

async function findSmartPageBreak(region, pageStart, idealEnd) {
  const idealHeight = idealEnd - pageStart;
  const searchDepth = Math.round(clamp(idealHeight * 0.14, 72, 260));
  const searchStart = Math.max(
    pageStart + Math.round(idealHeight * 0.68),
    idealEnd - searchDepth
  );
  const searchHeight = Math.max(2, Math.round(idealEnd - searchStart));
  if (searchHeight < 8) return idealEnd;

  const sampleWidth = Math.min(480, region.width);
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = searchHeight;
  const context = sampleCanvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true
  });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  await drawSourceRegion(
    context,
    {
      x: region.x,
      y: searchStart,
      width: region.width,
      height: searchHeight
    },
    {
      x: 0,
      y: 0,
      width: sampleCanvas.width,
      height: sampleCanvas.height
    }
  );

  const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  const energies = new Array(sampleCanvas.height).fill(Number.POSITIVE_INFINITY);
  for (let y = 1; y < sampleCanvas.height; y += 1) {
    let energy = 0;
    let samples = 0;
    for (let x = 2; x < sampleCanvas.width; x += 4) {
      const index = (y * sampleCanvas.width + x) * 4;
      const above = index - sampleCanvas.width * 4;
      const left = index - 8;
      energy +=
        Math.abs(pixels[index] - pixels[above]) +
        Math.abs(pixels[index + 1] - pixels[above + 1]) +
        Math.abs(pixels[index + 2] - pixels[above + 2]) +
        Math.abs(pixels[index] - pixels[left]) +
        Math.abs(pixels[index + 1] - pixels[left + 1]) +
        Math.abs(pixels[index + 2] - pixels[left + 2]);
      samples += 1;
    }
    energies[y] = samples ? energy / samples : Number.POSITIVE_INFINITY;
  }

  const row = chooseLowEnergyRow(energies, {
    minimumRow: Math.round(sampleCanvas.height * 0.08),
    maximumRow: sampleCanvas.height - 2,
    targetRow: sampleCanvas.height - 2
  });
  return searchStart + row;
}

async function planPdfPageRegions(region, idealPageHeight) {
  const regions = [];
  const bottom = region.y + region.height;
  let pageStart = region.y;

  while (pageStart < bottom) {
    const idealEnd = Math.min(bottom, pageStart + idealPageHeight);
    let pageEnd = idealEnd;
    const remainingAfterIdeal = bottom - idealEnd;
    if (idealEnd < bottom && remainingAfterIdeal > idealPageHeight * 0.18) {
      pageEnd = await findSmartPageBreak(region, pageStart, idealEnd);
    }
    if (pageEnd - pageStart < idealPageHeight * 0.55) pageEnd = idealEnd;
    regions.push({
      x: region.x,
      y: pageStart,
      width: region.width,
      height: Math.max(1, pageEnd - pageStart)
    });
    pageStart = pageEnd;
  }
  return regions;
}

async function exportPdf(quality) {
  const settings = await getSettings();
  const region = getExportRegion();
  const pagePoints = pdfPageSize(elements.pdfFormat.value, elements.pdfOrientation.value);
  const pixelRatio = 2;
  const pageWidth = Math.round(pagePoints.width * pixelRatio);
  const pageHeight = Math.round(pagePoints.height * pixelRatio);
  const margin = Math.round(28 * pixelRatio);
  const includeMetadata = elements.pdfMetadata.checked;
  const headerHeight = includeMetadata ? Math.round(44 * pixelRatio) : 0;
  const contentWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - headerHeight;
  const imageScale = contentWidth / region.width;
  const sourcePageHeight = Math.max(1, Math.floor(availableHeight / imageScale));
  const pageRegions = await planPdfPageRegions(region, sourcePageHeight);
  const pageCount = pageRegions.length;
  const pages = [];

  for (let index = 0; index < pageCount; index += 1) {
    const currentRegion = pageRegions[index];
    const contentCanvas = await renderRegion(currentRegion, contentWidth);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = pageWidth;
    pageCanvas.height = pageHeight;
    const context = pageCanvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);

    if (includeMetadata) {
      context.fillStyle = "#172033";
      context.font = `700 ${12 * pixelRatio}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.fillText(state.session.title || "Capture", margin, margin + 12 * pixelRatio);
      context.fillStyle = "#667085";
      context.font = `${8 * pixelRatio}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      context.fillText(compactUrl(state.session.url), margin, margin + 27 * pixelRatio);
      context.textAlign = "right";
      context.fillText(
        new Date(state.session.createdAt).toLocaleString(),
        pageWidth - margin,
        margin + 12 * pixelRatio
      );
      context.textAlign = "left";
      context.strokeStyle = "#e4e7ec";
      context.beginPath();
      context.moveTo(margin, margin + 36 * pixelRatio);
      context.lineTo(pageWidth - margin, margin + 36 * pixelRatio);
      context.stroke();
    }

    context.drawImage(contentCanvas, margin, margin + headerHeight);
    context.fillStyle = "#98a2b3";
    context.font = `${7 * pixelRatio}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    context.textAlign = "center";
    context.fillText(`${index + 1} / ${pageCount}`, pageWidth / 2, pageHeight - 11 * pixelRatio);

    const blob = await canvasToBlob(pageCanvas, "image/jpeg", quality);
    pages.push({
      width: pageWidth,
      height: pageHeight,
      bytes: new Uint8Array(await blob.arrayBuffer())
    });
  }

  const pdf = buildPdfFromJpegs(pages, {
    pageWidth: pagePoints.width,
    pageHeight: pagePoints.height
  });
  const filename = withDownloadSubfolder(
    buildFilename(settings.fileNameTemplate, state.session, "pdf"),
    settings.downloadSubfolder
  );
  await downloadBlob(
    new Blob([pdf], { type: "application/pdf" }),
    filename,
    settings.saveAs
  );
  showToast(message("exportReady"));
}

async function copyCapture() {
  const region = getExportRegion();
  if (
    region.height > maximumPartHeight(region.width) ||
    region.height > MAX_SINGLE_CANVAS_HEIGHT
  ) {
    showToast(message("copyTooLarge"));
    return;
  }
  elements.copy.disabled = true;
  try {
    const canvas = await renderRegion(region);
    const blob = await canvasToBlob(canvas, "image/png");
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]);
    showToast(message("copied"));
  } catch (error) {
    showToast(error.message || message("captureFailed"));
  } finally {
    elements.copy.disabled = false;
  }
}

function updateExportVisibility() {
  const format = elements.exportFormat.value;
  for (const element of document.querySelectorAll(".pdf-only")) {
    element.hidden = format !== "pdf";
  }
  elements.exportQualityRow.hidden = format === "png";
  const region = getExportRegion();
  const formatName = format.toUpperCase().replace("JPEG", "JPG");
  elements.exportSummary.textContent = `${region.width} × ${region.height} px · ${formatName}`;
}

async function openExportDialog() {
  const settings = await getSettings();
  elements.exportFormat.value = settings.format;
  elements.exportQuality.value = settings.jpegQuality;
  elements.exportQualityOutput.value = `${Math.round(settings.jpegQuality * 100)}%`;
  elements.pdfFormat.value = settings.pdfFormat;
  elements.pdfOrientation.value = settings.pdfOrientation;
  elements.pdfMetadata.checked = settings.pdfMetadata;
  updateExportVisibility();
  elements.exportDialog.showModal();
}

async function performExport() {
  if (state.exporting) return;
  state.exporting = true;
  elements.download.disabled = true;
  const original = elements.download.innerHTML;
  elements.download.textContent = "…";
  try {
    const format = elements.exportFormat.value;
    const quality = Number(elements.exportQuality.value);
    if (format === "pdf") {
      await exportPdf(quality);
    } else {
      await exportImage(format, quality);
    }
    elements.exportDialog.close();
  } catch (error) {
    showToast(error.message || message("captureFailed"));
  } finally {
    state.exporting = false;
    elements.download.disabled = false;
    elements.download.innerHTML = original;
  }
}

function setupEventHandlers() {
  elements.stage.addEventListener("pointerdown", pointerDown);
  elements.stage.addEventListener("pointermove", pointerMove);
  elements.stage.addEventListener("pointerup", pointerUp);
  elements.stage.addEventListener("pointercancel", pointerUp);

  for (const button of document.querySelectorAll(".tool-button")) {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  }

  elements.colorInput.addEventListener("input", () => {
    state.color = elements.colorInput.value;
    elements.colorOutput.value = state.color.toUpperCase();
  });
  elements.strokeInput.addEventListener("input", () => {
    state.strokeWidth = Number(elements.strokeInput.value);
    elements.strokeOutput.value = `${state.strokeWidth} px`;
  });

  for (const button of elements.emojiPalette.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      state.emoji = button.textContent;
      for (const sibling of elements.emojiPalette.querySelectorAll("button")) {
        sibling.classList.toggle("is-active", sibling === button);
      }
    });
  }
  elements.emojiPalette.querySelector("button")?.classList.add("is-active");

  elements.undo.addEventListener("click", () => applyHistory(state.historyIndex - 1));
  elements.redo.addEventListener("click", () => applyHistory(state.historyIndex + 1));
  elements.zoomOut.addEventListener("click", () => applyZoom(state.zoom / 1.2));
  elements.zoomIn.addEventListener("click", () => applyZoom(state.zoom * 1.2));
  elements.zoomFit.addEventListener("click", fitToWidth);
  elements.resetCrop.addEventListener("click", () => {
    state.crop = null;
    renderCrop();
    pushHistory();
  });
  elements.deleteAnnotation.addEventListener("click", deleteSelectedAnnotation);
  elements.copy.addEventListener("click", copyCapture);
  elements.drag.addEventListener("click", (event) => {
    event.preventDefault();
    showToast(
      state.dragUrl
        ? message("dragHint")
        : message("dragPreparing")
    );
  });
  elements.drag.addEventListener("dragstart", (event) => {
    if (!state.dragUrl) {
      event.preventDefault();
      showToast(message("dragPreparing"));
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      "DownloadURL",
      `image/png:${elements.drag.download}:${state.dragUrl}`
    );
    event.dataTransfer.setData("text/uri-list", state.dragUrl);
  });
  elements.export.addEventListener("click", openExportDialog);
  elements.exportFormat.addEventListener("change", updateExportVisibility);
  elements.exportQuality.addEventListener("input", () => {
    elements.exportQualityOutput.value = `${Math.round(Number(elements.exportQuality.value) * 100)}%`;
  });
  elements.download.addEventListener("click", performExport);

  elements.textDialog.addEventListener("close", () => {
    if (
      elements.textDialog.returnValue === "default" &&
      elements.textInput.value.trim() &&
      state.pendingTextPoint
    ) {
      addPointAnnotation("text", state.pendingTextPoint, elements.textInput.value.trim());
    }
    state.pendingTextPoint = null;
  });
  elements.textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.textDialog.close("default");
    }
  });

  elements.newCapture.addEventListener("click", () => {
    if (state.session.url?.startsWith("http")) {
      chrome.tabs.create({ url: state.session.url });
    }
  });
  elements.openLibrary.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("library/library.html") });
  });
  elements.deleteCapture.addEventListener("click", async () => {
    if (!confirm(message("deleteConfirm"))) return;
    await deleteSession(state.session.id);
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
    } else {
      location.reload();
    }
  });

  addEventListener("keydown", (event) => {
    const activeElement = document.activeElement;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement?.tagName);
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      applyHistory(state.historyIndex + (event.shiftKey ? 1 : -1));
    } else if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      applyHistory(state.historyIndex + 1);
    } else if (event.key === "Escape" && state.draft) {
      const previous = state.draft;
      state.draft = null;
      renderAffected(previous, null);
    } else if (
      !isTyping &&
      state.tool === "select" &&
      (event.key === "Delete" || event.key === "Backspace") &&
      state.selectedIndex >= 0
    ) {
      event.preventDefault();
      deleteSelectedAnnotation();
    }
  });

  let resizeTimer = null;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.abs(state.zoom - state.fitZoom) < 0.01) fitToWidth();
    }, 120);
  });
  addEventListener("unload", () => {
    if (state.dragUrl) URL.revokeObjectURL(state.dragUrl);
    for (const source of state.sources) source.bitmap?.close?.();
  });
}

async function initialize() {
  localizeDocument();
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    elements.loading.hidden = true;
    elements.missing.hidden = false;
    return;
  }

  const [session, segments] = await Promise.all([
    getSession(id),
    getSegments(id)
  ]);
  if (!session || !segments.length) {
    elements.loading.hidden = true;
    elements.missing.hidden = false;
    return;
  }

  state.session = session;
  state.annotations = session.annotations || [];
  state.crop = session.crop || null;
  elements.title.textContent = session.title || message("editorTitle");
  elements.meta.textContent = `${session.width} × ${session.height} px · ${bytesToHumanSize(session.byteSize)}`;
  elements.infoSize.textContent = `${session.width} × ${session.height}`;
  elements.infoMode.textContent = {
    [CAPTURE_MODE.FULL]: "Full page",
    [CAPTURE_MODE.VISIBLE]: "Visible",
    [CAPTURE_MODE.REGION]: "Region"
  }[session.mode] || session.mode;
  try {
    elements.infoSource.textContent = new URL(session.url).hostname || "Local page";
  } catch {
    elements.infoSource.textContent = "Local page";
  }

  let top = 0;
  const bitmaps = await Promise.all(segments.map((record) => createImageBitmap(record.blob)));
  state.sources = segments.map((record, index) => {
    const bitmap = bitmaps[index];
    const wrapper = document.createElement("div");
    wrapper.className = "segment-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = record.width;
    canvas.height = record.height;
    wrapper.append(canvas);
    elements.stage.insertBefore(wrapper, elements.cropSelection);
    const source = {
      ...record,
      top,
      bitmap,
      wrapper,
      canvas,
      context: canvas.getContext("2d", { alpha: false })
    };
    top += record.height;
    return source;
  });

  state.history = [snapshot()];
  state.historyIndex = 0;
  updateHistoryButtons();
  setupEventHandlers();
  renderAllSegments();
  elements.loading.hidden = true;
  elements.stage.hidden = false;
  fitToWidth();
  renderCrop();
  setTool("select");
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => scheduleDragPreparation());
  } else {
    scheduleDragPreparation();
  }
  if (new URLSearchParams(location.search).get("auto") === "1") {
    const settings = await getSettings();
    const format = settings.format;
    if (format === "pdf") {
      elements.pdfFormat.value = settings.pdfFormat;
      elements.pdfOrientation.value = settings.pdfOrientation;
      elements.pdfMetadata.checked = settings.pdfMetadata;
      await exportPdf(settings.jpegQuality);
    } else {
      await exportImage(format, settings.jpegQuality);
    }
  }
}

initialize().catch((error) => {
  console.error(error);
  elements.loading.hidden = true;
  elements.missing.hidden = false;
});
