export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createId(prefix = "capture") {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}

export function sanitizeFilename(value, fallback = "capture") {
  const safe = String(value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 120);
  return safe || fallback;
}

export function formatDateForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

export function buildFilename(template, metadata, extension) {
  let hostname = "page";
  try {
    hostname = new URL(metadata.url).hostname.replace(/^www\./, "") || "page";
  } catch {
    // Keep the safe fallback for browser-internal and malformed URLs.
  }

  const replacements = {
    "{title}": metadata.title || hostname,
    "{host}": hostname,
    "{date}": formatDateForFilename(metadata.createdAt ? new Date(metadata.createdAt) : new Date())
  };

  let result = template || "{title}-{date}";
  for (const [token, value] of Object.entries(replacements)) {
    result = result.split(token).join(value);
  }
  return `${sanitizeFilename(result)}.${extension}`;
}

export function sanitizeSubfolder(value) {
  return String(value || "")
    .split(/[\\/]+/)
    .map((part) => sanitizeFilename(part, ""))
    .filter((part) => part && part !== "." && part !== "..")
    .slice(0, 8)
    .join("/");
}

export function withDownloadSubfolder(filename, subfolder) {
  const safeFolder = sanitizeSubfolder(subfolder);
  return safeFolder ? `${safeFolder}/${filename}` : filename;
}

export function calculateCapturePositions(pageHeight, viewportHeight) {
  const safePageHeight = Math.max(1, Math.ceil(pageHeight));
  const safeViewportHeight = Math.max(1, Math.ceil(viewportHeight));
  if (safePageHeight <= safeViewportHeight) {
    return [0];
  }

  const maximumScroll = safePageHeight - safeViewportHeight;
  const positions = [];
  for (let position = 0; position < maximumScroll; position += safeViewportHeight) {
    positions.push(position);
  }
  if (positions.at(-1) !== maximumScroll) {
    positions.push(maximumScroll);
  }
  return positions;
}

export function makeSerializableError(error, fallbackCode = "UNKNOWN") {
  return {
    code: error?.code || fallbackCode,
    message: error?.message || String(error || "Unknown error")
  };
}

export function dataUrlToBlob(dataUrl) {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The browser could not encode the image."));
      }
    }, type, quality);
  });
}

export function bytesToHumanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
