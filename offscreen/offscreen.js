import {
  MAX_SEGMENT_CANVAS_AREA,
  MESSAGE,
  SEGMENT_HEIGHT_PX
} from "../shared/constants.js";
import {
  deleteSession,
  putSegment,
  putSession
} from "../shared/db.js";
import { canvasToBlob } from "../shared/utils.js";
import {
  maximumSegmentHeight,
  splitRangeAcrossSegments
} from "../shared/segments.js";

const sessions = new Map();

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A captured frame could not be decoded."));
    image.src = dataUrl;
  });
}

function createSegmentCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
  });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function createThumbnail(canvas) {
  const width = 320;
  const height = Math.max(80, Math.min(200, Math.round(canvas.height * (width / canvas.width))));
  const thumbnail = document.createElement("canvas");
  thumbnail.width = width;
  thumbnail.height = height;
  const context = thumbnail.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    Math.min(canvas.height, Math.round(height * (canvas.width / width))),
    0,
    0,
    width,
    height
  );
  return canvasToBlob(thumbnail, "image/jpeg", 0.78);
}

async function finalizeCurrentSegment(state, requestedHeight = state.segmentHeight) {
  if (!state.current) return;
  const height = Math.max(
    1,
    Math.min(state.segmentHeight, Math.round(requestedHeight))
  );
  let outputCanvas = state.current.canvas;

  if (height !== outputCanvas.height) {
    const trimmed = document.createElement("canvas");
    trimmed.width = outputCanvas.width;
    trimmed.height = height;
    const context = trimmed.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, trimmed.width, trimmed.height);
    context.drawImage(outputCanvas, 0, 0, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
    outputCanvas = trimmed;
  }

  const blob = await canvasToBlob(outputCanvas, "image/png");
  if (state.currentIndex === 0 && !state.thumbnail) {
    state.thumbnail = await createThumbnail(outputCanvas);
  }
  await putSegment({
    sessionId: state.id,
    index: state.currentIndex,
    width: outputCanvas.width,
    height: outputCanvas.height,
    byteSize: blob.size,
    blob
  });
  state.segmentCount += 1;
  state.totalBytes += blob.size;
  state.current = null;
}

function makeState(metadata) {
  return {
    ...metadata,
    current: null,
    currentIndex: 0,
    outputWidth: 0,
    outputHeight: 0,
    scaleX: 1,
    scaleY: 1,
    segmentHeight: SEGMENT_HEIGHT_PX,
    segmentCount: 0,
    totalBytes: 0,
    thumbnail: null,
    lastPageHeight: metadata.pageHeight
  };
}

async function startSession(metadata) {
  await deleteSession(metadata.id).catch(() => {});
  sessions.set(metadata.id, makeState(metadata));
  return { ok: true };
}

async function ensureSegment(state, index) {
  if (state.current && state.currentIndex === index) return;
  if (state.current && index > state.currentIndex) {
    await finalizeCurrentSegment(state);
    state.currentIndex += 1;
  }
  while (state.currentIndex < index) {
    state.currentIndex += 1;
  }
  if (!state.current) {
    state.current = createSegmentCanvas(state.outputWidth, state.segmentHeight);
  }
}

async function addSlice(request) {
  const state = sessions.get(request.id);
  if (!state) throw new Error("The image assembly session no longer exists.");

  const image = await loadImage(request.dataUrl);
  const sourceRect = request.sourceRect || {
    x: 0,
    y: 0,
    width: request.viewportWidth,
    height: request.viewportHeight
  };

  if (!state.outputWidth) {
    state.scaleX = image.naturalWidth / request.windowViewportWidth;
    state.scaleY = image.naturalHeight / request.windowViewportHeight;
    state.outputWidth = Math.max(1, Math.round(sourceRect.width * state.scaleX));
    state.segmentHeight = maximumSegmentHeight(
      state.outputWidth,
      SEGMENT_HEIGHT_PX,
      MAX_SEGMENT_CANVAS_AREA
    );
  }

  state.lastPageHeight = Math.max(state.lastPageHeight || 0, request.pageHeight || 0);
  state.outputHeight = Math.max(
    state.outputHeight,
    Math.round(state.lastPageHeight * state.scaleY)
  );

  const sliceTop = Math.max(0, Math.round(request.actualY * state.scaleY));
  const sliceHeight = Math.round(sourceRect.height * state.scaleY);
  const pageBottom = Math.round(state.lastPageHeight * state.scaleY);
  const sliceBottom = Math.min(pageBottom, sliceTop + sliceHeight);
  const sourceX = Math.round(sourceRect.x * state.scaleX);
  const sourceYBase = Math.round(sourceRect.y * state.scaleY);
  const sourceWidth = Math.round(sourceRect.width * state.scaleX);

  const parts = splitRangeAcrossSegments(sliceTop, sliceBottom, state.segmentHeight);
  for (const part of parts) {
    await ensureSegment(state, part.index);
    const segmentTop = part.index * state.segmentHeight;

    state.current.context.drawImage(
      image,
      sourceX,
      sourceYBase + part.sourceOffset,
      sourceWidth,
      part.length,
      0,
      part.globalStart - segmentTop,
      state.outputWidth,
      part.length
    );
  }

  image.src = "";
  return {
    ok: true,
    outputWidth: state.outputWidth,
    outputHeight: state.outputHeight
  };
}

async function finishSession(request) {
  const state = sessions.get(request.id);
  if (!state) throw new Error("The image assembly session no longer exists.");

  state.lastPageHeight = Math.max(1, request.pageHeight || state.lastPageHeight || 1);
  state.outputHeight = Math.max(1, Math.round(state.lastPageHeight * state.scaleY));
  const currentSegmentTop = state.currentIndex * state.segmentHeight;
  const remainingHeight = state.outputHeight - currentSegmentTop;
  await finalizeCurrentSegment(state, remainingHeight);

  const session = {
    id: state.id,
    createdAt: state.createdAt,
    mode: state.mode,
    status: "complete",
    title: state.title,
    url: state.url,
    width: state.outputWidth,
    height: state.outputHeight,
    segmentCount: state.segmentCount,
    byteSize: state.totalBytes,
    thumbnail: state.thumbnail,
    truncated: Boolean(request.truncated),
    annotations: [],
    crop: null
  };
  await putSession(session);
  sessions.delete(request.id);
  return { ok: true, session };
}

async function abortSession(request) {
  sessions.delete(request.id);
  await deleteSession(request.id).catch(() => {});
  return { ok: true };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.target !== "offscreen") return undefined;

  const handlers = {
    [MESSAGE.OFFSCREEN_START]: () => startSession(request.metadata),
    [MESSAGE.OFFSCREEN_ADD_SLICE]: () => addSlice(request),
    [MESSAGE.OFFSCREEN_FINISH]: () => finishSession(request),
    [MESSAGE.OFFSCREEN_ABORT]: () => abortSession(request)
  };
  const handler = handlers[request.type];
  if (!handler) return undefined;

  handler()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ error: error.message || String(error) }));
  return true;
});
