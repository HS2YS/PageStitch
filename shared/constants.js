export const DB_NAME = "pagestitch";
export const DB_VERSION = 1;
export const SESSION_STORE = "sessions";
export const SEGMENT_STORE = "segments";

export const MESSAGE = Object.freeze({
  START_CAPTURE: "capture:start",
  START_REGION: "capture:start-region",
  REGION_SELECTED: "capture:region-selected",
  REGION_CANCELLED: "capture:region-cancelled",
  CANCEL_CAPTURE: "capture:cancel",
  GET_STATE: "capture:get-state",
  STATE_CHANGED: "capture:state-changed",
  CONTENT_PREPARE: "content:prepare",
  CONTENT_SCROLL: "content:scroll",
  CONTENT_STEP_DONE: "content:step-done",
  CONTENT_RESTORE: "content:restore",
  CONTENT_REGION: "content:select-region",
  OFFSCREEN_START: "offscreen:start",
  OFFSCREEN_ADD_SLICE: "offscreen:add-slice",
  OFFSCREEN_FINISH: "offscreen:finish",
  OFFSCREEN_ABORT: "offscreen:abort"
});

export const CAPTURE_MODE = Object.freeze({
  FULL: "full",
  VISIBLE: "visible",
  REGION: "region"
});

export const DEFAULT_SETTINGS = Object.freeze({
  format: "png",
  jpegQuality: 0.92,
  captureDelay: 450,
  fileNameTemplate: "{title}-{date}",
  pdfFormat: "a4",
  pdfOrientation: "portrait",
  pdfMetadata: true,
  keepHistory: 10,
  theme: "system",
  toolbarAction: "capture",
  autoDownload: false,
  saveAs: true,
  downloadSubfolder: ""
});

export const MAX_CAPTURE_CALLS_PER_SECOND = 2;
export const MIN_CAPTURE_INTERVAL_MS = 550;
export const SEGMENT_HEIGHT_PX = 6000;
export const MAX_SEGMENT_CANVAS_AREA = 24_000_000;
export const MAX_SINGLE_CANVAS_HEIGHT = 30000;
export const MAX_SINGLE_CANVAS_AREA = 24_000_000;
export const MAX_CAPTURE_STEPS = 250;
