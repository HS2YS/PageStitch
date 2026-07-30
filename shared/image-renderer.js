import {
  MAX_SINGLE_CANVAS_AREA,
  MAX_SINGLE_CANVAS_HEIGHT
} from "./constants.js";
import { drawAnnotations } from "./annotations.js";

export function normalizeRegion(region, width, height) {
  if (!region) return { x: 0, y: 0, width, height };
  const normalized = {
    x: region.width < 0 ? region.x + region.width : region.x,
    y: region.height < 0 ? region.y + region.height : region.y,
    width: Math.abs(region.width),
    height: Math.abs(region.height)
  };
  normalized.x = Math.max(0, Math.min(width - 1, Math.round(normalized.x)));
  normalized.y = Math.max(0, Math.min(height - 1, Math.round(normalized.y)));
  normalized.width = Math.max(1, Math.min(width - normalized.x, Math.round(normalized.width)));
  normalized.height = Math.max(1, Math.min(height - normalized.y, Math.round(normalized.height)));
  return normalized;
}

export function maximumPartHeight(width) {
  return Math.max(
    1,
    Math.min(MAX_SINGLE_CANVAS_HEIGHT, Math.floor(MAX_SINGLE_CANVAS_AREA / width))
  );
}

export async function decodeCaptureSources(records) {
  const bitmaps = await Promise.all(records.map((record) => createImageBitmap(record.blob)));
  let top = 0;
  return records.map((record, index) => {
    const source = {
      ...record,
      top,
      bitmap: bitmaps[index]
    };
    top += record.height;
    return source;
  });
}

export function closeCaptureSources(sources) {
  for (const source of sources) source.bitmap?.close?.();
}

export function drawSourceRegion(context, sources, region, destination) {
  const scaleY = destination.height / region.height;
  for (const source of sources) {
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
}

export function renderCaptureRegion({
  sources,
  annotations = [],
  region,
  targetWidth = region.width
}) {
  const scale = targetWidth / region.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawSourceRegion(context, sources, region, {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
  });
  drawAnnotations(context, annotations, {
    offset: { x: region.x, y: region.y },
    viewport: region,
    scale
  });
  return canvas;
}
