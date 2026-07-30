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

export function captureRecordIntersections(records, region) {
  const intersections = [];
  let sourceTop = 0;
  for (const record of records) {
    const intersectionTop = Math.max(region.y, sourceTop);
    const intersectionBottom = Math.min(
      region.y + region.height,
      sourceTop + record.height
    );
    if (intersectionBottom > intersectionTop) {
      intersections.push({
        record,
        sourceY: intersectionTop - sourceTop,
        sourceHeight: intersectionBottom - intersectionTop,
        destinationOffsetY: intersectionTop - region.y
      });
    }
    sourceTop += record.height;
  }
  return intersections;
}

export async function renderCaptureRegionFromRecords({
  records,
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

  for (const intersection of captureRecordIntersections(records, region)) {
    const bitmap = await createImageBitmap(intersection.record.blob);
    try {
      context.drawImage(
        bitmap,
        region.x,
        intersection.sourceY,
        region.width,
        intersection.sourceHeight,
        0,
        intersection.destinationOffsetY * scale,
        canvas.width,
        intersection.sourceHeight * scale
      );
    } finally {
      bitmap.close?.();
    }
  }

  drawAnnotations(context, annotations, {
    offset: { x: region.x, y: region.y },
    viewport: region,
    scale
  });
  return canvas;
}
