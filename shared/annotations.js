import { clamp } from "./utils.js";

function normalizeRect(annotation) {
  const x = annotation.width < 0 ? annotation.x + annotation.width : annotation.x;
  const y = annotation.height < 0 ? annotation.y + annotation.height : annotation.y;
  return {
    x,
    y,
    width: Math.abs(annotation.width),
    height: Math.abs(annotation.height)
  };
}

// The head length drives both the drawn triangle and the dirty rect that
// bounds it, so the two must read it from the same place.
function arrowHeadLength(annotation) {
  return Math.max(12, (annotation.strokeWidth || 4) * 3.2);
}

export function annotationBounds(annotation) {
  const padding = Math.max(12, annotation.strokeWidth || annotation.size || 0);
  if (annotation.type === "pen" || annotation.type === "highlight") {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    return {
      x: Math.min(...xs) - padding,
      y: Math.min(...ys) - padding,
      width: Math.max(...xs) - Math.min(...xs) + padding * 2,
      height: Math.max(...ys) - Math.min(...ys) + padding * 2
    };
  }
  if (annotation.type === "arrow") {
    // The head reaches further from the shaft than the stroke width does.
    const reach = Math.max(padding, arrowHeadLength(annotation));
    return {
      x: Math.min(annotation.x1, annotation.x2) - reach,
      y: Math.min(annotation.y1, annotation.y2) - reach,
      width: Math.abs(annotation.x2 - annotation.x1) + reach * 2,
      height: Math.abs(annotation.y2 - annotation.y1) + reach * 2
    };
  }
  if (annotation.type === "text" || annotation.type === "emoji") {
    const size = annotation.size || 28;
    return {
      x: annotation.x - padding,
      y: annotation.y - size - padding,
      width: Math.max(size, (annotation.text?.length || 1) * size * 0.7) + padding * 2,
      height: size * 1.4 + padding * 2
    };
  }
  const rect = normalizeRect(annotation);
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

export function rectanglesIntersect(left, right) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function findTopmostAnnotationAtPoint(annotations, point) {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const bounds = annotationBounds(annotations[index]);
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

export function translateAnnotation(annotation, deltaX, deltaY) {
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
  return annotation;
}

function setupStroke(context, annotation, offset, scale) {
  context.strokeStyle = annotation.color || "#ef476f";
  context.fillStyle = annotation.color || "#ef476f";
  context.lineWidth = (annotation.strokeWidth || 4) * scale;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.translate(-offset.x * scale, -offset.y * scale);
}

function drawPath(context, annotation, offset, scale, alpha = 1) {
  if (!annotation.points?.length) return;
  context.save();
  setupStroke(context, annotation, offset, scale);
  context.globalAlpha = alpha;
  context.beginPath();
  const first = annotation.points[0];
  context.moveTo(first.x * scale, first.y * scale);
  for (let index = 1; index < annotation.points.length; index += 1) {
    const point = annotation.points[index];
    const previous = annotation.points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    const controlY = (previous.y + point.y) / 2;
    context.quadraticCurveTo(
      previous.x * scale,
      previous.y * scale,
      controlX * scale,
      controlY * scale
    );
  }
  const last = annotation.points.at(-1);
  context.lineTo(last.x * scale, last.y * scale);
  context.stroke();
  context.restore();
}

function drawRectangle(context, annotation, offset, scale) {
  const rect = normalizeRect(annotation);
  context.save();
  setupStroke(context, annotation, offset, scale);
  context.strokeRect(
    rect.x * scale,
    rect.y * scale,
    rect.width * scale,
    rect.height * scale
  );
  context.restore();
}

function drawArrow(context, annotation, offset, scale) {
  const x1 = annotation.x1 * scale;
  const y1 = annotation.y1 * scale;
  const x2 = annotation.x2 * scale;
  const y2 = annotation.y2 * scale;
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 0.5) return;

  const strokeWidth = (annotation.strokeWidth || 4) * scale;
  const headLength = Math.min(arrowHeadLength(annotation) * scale, length * 0.9);
  // Keep the head visibly wider than the shaft it terminates.
  const headWidth = Math.max(headLength * 0.5, strokeWidth * 1.5);
  const unitX = (x2 - x1) / length;
  const unitY = (y2 - y1) / length;
  const baseX = x2 - unitX * headLength;
  const baseY = y2 - unitY * headLength;

  context.save();
  setupStroke(context, annotation, offset, scale);
  // The shaft stops inside the head so its round cap is hidden by the fill
  // instead of bulging past the tip.
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2 - unitX * headLength * 0.75, y2 - unitY * headLength * 0.75);
  context.stroke();
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(baseX - unitY * headWidth, baseY + unitX * headWidth);
  context.lineTo(baseX + unitY * headWidth, baseY - unitX * headWidth);
  context.closePath();
  context.fill();
  context.restore();
}

function drawText(context, annotation, offset, scale) {
  context.save();
  context.translate(-offset.x * scale, -offset.y * scale);
  context.fillStyle = annotation.color || "#ef476f";
  context.font = `700 ${(annotation.size || 28) * scale}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(255,255,255,.75)";
  context.shadowBlur = 2 * scale;
  context.fillText(annotation.text || "", annotation.x * scale, annotation.y * scale);
  context.restore();
}

function drawEmoji(context, annotation, offset, scale) {
  context.save();
  context.translate(-offset.x * scale, -offset.y * scale);
  context.font = `${(annotation.size || 42) * scale}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(annotation.text || "✨", annotation.x * scale, annotation.y * scale);
  context.restore();
}

function drawBlur(context, annotation, offset, scale) {
  const rect = normalizeRect(annotation);
  const local = {
    x: Math.round((rect.x - offset.x) * scale),
    y: Math.round((rect.y - offset.y) * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale)
  };
  const clipped = {
    x: clamp(local.x, 0, context.canvas.width),
    y: clamp(local.y, 0, context.canvas.height),
    width: 0,
    height: 0
  };
  clipped.width = Math.min(local.x + local.width, context.canvas.width) - clipped.x;
  clipped.height = Math.min(local.y + local.height, context.canvas.height) - clipped.y;
  if (clipped.width < 2 || clipped.height < 2) return;

  const reduction = Math.max(5, Math.round(10 * scale));
  const pixelCanvas = document.createElement("canvas");
  pixelCanvas.width = Math.max(1, Math.ceil(clipped.width / reduction));
  pixelCanvas.height = Math.max(1, Math.ceil(clipped.height / reduction));
  const pixelContext = pixelCanvas.getContext("2d");
  pixelContext.drawImage(
    context.canvas,
    clipped.x,
    clipped.y,
    clipped.width,
    clipped.height,
    0,
    0,
    pixelCanvas.width,
    pixelCanvas.height
  );
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(
    pixelCanvas,
    0,
    0,
    pixelCanvas.width,
    pixelCanvas.height,
    clipped.x,
    clipped.y,
    clipped.width,
    clipped.height
  );
  context.restore();
}

export function drawAnnotations(context, annotations, options = {}) {
  const offset = options.offset || { x: 0, y: 0 };
  const scale = options.scale || 1;
  const viewport = options.viewport || {
    x: offset.x,
    y: offset.y,
    width: context.canvas.width / scale,
    height: context.canvas.height / scale
  };

  const visible = annotations.filter((annotation) =>
    rectanglesIntersect(annotationBounds(annotation), viewport)
  );

  // Redactions must be applied before vector markup so later annotations stay crisp.
  for (const annotation of visible) {
    if (annotation.type === "blur") {
      drawBlur(context, annotation, offset, scale);
    }
  }

  for (const annotation of visible) {
    if (annotation.type === "pen") {
      drawPath(context, annotation, offset, scale);
    } else if (annotation.type === "highlight") {
      drawPath(context, annotation, offset, scale, 0.3);
    } else if (annotation.type === "rectangle") {
      drawRectangle(context, annotation, offset, scale);
    } else if (annotation.type === "arrow") {
      drawArrow(context, annotation, offset, scale);
    } else if (annotation.type === "text") {
      drawText(context, annotation, offset, scale);
    } else if (annotation.type === "emoji") {
      drawEmoji(context, annotation, offset, scale);
    }
  }
}
