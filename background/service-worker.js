import {
  CAPTURE_MODE,
  MAX_CAPTURE_STEPS,
  MESSAGE,
  MIN_CAPTURE_INTERVAL_MS,
  PRIVACY_CONSENT_KEY,
  PRIVACY_CONSENT_VERSION
} from "../shared/constants.js";
import { trimHistory } from "../shared/db.js";
import { getSettings } from "../shared/settings.js";
import {
  createId,
  makeSerializableError,
  sleep
} from "../shared/utils.js";

let activeCapture = null;
let offscreenCreating = null;
let lastCaptureCallAt = 0;

function currentState() {
  if (!activeCapture) {
    return { status: "idle", progress: 0 };
  }
  return {
    tabId: activeCapture.tabId,
    mode: activeCapture.mode,
    status: activeCapture.status,
    progress: activeCapture.progress || 0,
    step: activeCapture.step || 0,
    total: activeCapture.total || 0,
    error: activeCapture.error || null
  };
}

async function broadcastState() {
  const state = currentState();
  chrome.runtime.sendMessage({
    type: MESSAGE.STATE_CHANGED,
    state
  }).catch(() => {});

  if (activeCapture?.tabId) {
    const text = activeCapture.status === "capturing"
      ? `${Math.round((activeCapture.progress || 0) * 100)}`
      : "";
    await chrome.action.setBadgeText({ tabId: activeCapture.tabId, text }).catch(() => {});
    if (text) {
      await chrome.action.setBadgeBackgroundColor({
        tabId: activeCapture.tabId,
        color: "#7c3aed"
      }).catch(() => {});
    }
  }
}

function errorMessageForCode(error) {
  const keyByCode = {
    RESTRICTED_PAGE: "restrictedPage",
    CAPTURE_IN_PROGRESS: "captureInProgress",
    TAB_NOT_ACTIVE: "tabNotActive",
    SCROLL_STUCK: "scrollStuck"
  };
  const key = keyByCode[error?.code];
  return key
    ? chrome.i18n.getMessage(key)
    : (error?.message || chrome.i18n.getMessage("captureFailed"));
}

async function showActionError(error, tabId) {
  if (!Number.isInteger(tabId)) return;
  await chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: "#c73758"
  }).catch(() => {});
  await chrome.action.setTitle({
    tabId,
    title: errorMessageForCode(error)
  }).catch(() => {});
  setTimeout(() => {
    const captureIsRunning =
      activeCapture?.tabId === tabId &&
      !["error", "cancelled", "complete"].includes(activeCapture.status);
    if (captureIsRunning) return;
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.action.setTitle({
      tabId,
      title: chrome.i18n.getMessage("captureFullPage")
    }).catch(() => {});
  }, 5000);
}

async function setCaptureState(patch) {
  if (!activeCapture) return;
  Object.assign(activeCapture, patch);
  await broadcastState();
}

async function ensureOffscreenDocument() {
  if (offscreenCreating) return offscreenCreating;

  offscreenCreating = (async () => {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL("offscreen/offscreen.html")]
      });
      if (contexts.length > 0) return;
    }

    try {
      await chrome.offscreen.createDocument({
        url: "offscreen/offscreen.html",
        reasons: ["BLOBS"],
        justification: "Stitch captured viewport images into local screenshot segments."
      });
    } catch (error) {
      if (!/single offscreen|already exists/i.test(error.message || "")) {
        throw error;
      }
    }
  })();

  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function sendOffscreen(message) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    ...message,
    target: "offscreen"
  });
  if (response?.error) throw new Error(response.error);
  return response;
}

async function injectCaptureScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/capture.js"]
  });
}

async function sendTab(tabId, message) {
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (response?.error) throw new Error(response.error);
  return response;
}

function assertCapturableTab(tab) {
  if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
    const error = new Error("No active browser tab was found.");
    error.code = "NO_ACTIVE_TAB";
    throw error;
  }
  const protocol = (() => {
    try {
      return new URL(tab.url || "").protocol;
    } catch {
      return "";
    }
  })();
  if (!["http:", "https:", "file:", "ftp:"].includes(protocol)) {
    const error = new Error("The browser does not allow scripts on this page.");
    error.code = "RESTRICTED_PAGE";
    throw error;
  }
}

async function hasPrivacyConsent() {
  const stored = await chrome.storage.local.get(PRIVACY_CONSENT_KEY);
  return stored[PRIVACY_CONSENT_KEY] === PRIVACY_CONSENT_VERSION;
}

async function openPrivacySetup() {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("onboarding/onboarding.html"),
    active: true
  });
}

async function throttledVisibleCapture(windowId) {
  const elapsed = Date.now() - lastCaptureCallAt;
  if (elapsed < MIN_CAPTURE_INTERVAL_MS) {
    await sleep(MIN_CAPTURE_INTERVAL_MS - elapsed);
  }
  const result = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  lastCaptureCallAt = Date.now();
  return result;
}

function assertStillActive(capture, tab) {
  if (capture.cancelled) {
    const error = new Error("Capture cancelled.");
    error.code = "CANCELLED";
    throw error;
  }
  if (!tab?.active || tab.windowId !== capture.windowId) {
    const error = new Error("Keep the page tab active until the capture is complete.");
    error.code = "TAB_NOT_ACTIVE";
    throw error;
  }
}

async function startImageSession(capture, metadata) {
  await sendOffscreen({
    type: MESSAGE.OFFSCREEN_START,
    metadata: {
      id: capture.id,
      createdAt: capture.createdAt,
      mode: capture.mode,
      title: metadata.title || capture.title || "Capture",
      url: metadata.url || capture.url || "",
      pageWidth: metadata.pageWidth,
      pageHeight: metadata.pageHeight
    }
  });
}

async function finishCapture(capture, pageHeight) {
  await setCaptureState({ status: "assembling", progress: 1 });
  const result = await sendOffscreen({
    type: MESSAGE.OFFSCREEN_FINISH,
    id: capture.id,
    pageHeight,
    truncated: Boolean(capture.truncated)
  });
  const settings = await getSettings();
  await trimHistory(settings.keepHistory).catch(() => {});
  await setCaptureState({ status: "complete", progress: 1 });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(
      `editor/editor.html?id=${encodeURIComponent(capture.id)}${settings.autoDownload ? "&auto=1" : ""}`
    ),
    active: true
  });
  return result.session;
}

async function captureFullPage(capture) {
  const settings = await getSettings();
  await injectCaptureScript(capture.tabId);
  capture.prepared = true;

  let metrics = await sendTab(capture.tabId, {
    type: MESSAGE.CONTENT_PREPARE,
    mode: CAPTURE_MODE.FULL,
    delay: settings.captureDelay
  });
  capture.title = metrics.title || capture.title;
  capture.url = metrics.url || capture.url;

  await startImageSession(capture, metrics);
  let nextPosition = 0;
  let step = 0;
  let lastActualPosition = -1;

  while (step < MAX_CAPTURE_STEPS) {
    const tab = await chrome.tabs.get(capture.tabId);
    assertStillActive(capture, tab);

    const maximumScroll = Math.max(0, metrics.pageHeight - metrics.viewportHeight);
    const targetPosition = Math.min(nextPosition, maximumScroll);
    const estimatedTotal = Math.max(1, Math.ceil(metrics.pageHeight / metrics.viewportHeight));
    step += 1;
    await setCaptureState({
      status: "capturing",
      step,
      total: Math.max(step, estimatedTotal),
      progress: Math.min(0.98, targetPosition / Math.max(1, maximumScroll))
    });

    const scrolled = await sendTab(capture.tabId, {
      type: MESSAGE.CONTENT_SCROLL,
      position: targetPosition,
      delay: settings.captureDelay
    });
    metrics = { ...metrics, ...scrolled };
    if (metrics.actualY === lastActualPosition && step > 1) {
      const error = new Error("The page stopped scrolling before the browser reached its bottom.");
      error.code = "SCROLL_STUCK";
      throw error;
    }
    lastActualPosition = metrics.actualY;

    const dataUrl = await throttledVisibleCapture(capture.windowId);
    await sendOffscreen({
      type: MESSAGE.OFFSCREEN_ADD_SLICE,
      id: capture.id,
      dataUrl,
      actualY: metrics.actualY,
      pageHeight: metrics.pageHeight,
      viewportWidth: metrics.viewportWidth,
      viewportHeight: metrics.viewportHeight,
      windowViewportWidth: metrics.windowViewportWidth || metrics.viewportWidth,
      windowViewportHeight: metrics.windowViewportHeight || metrics.viewportHeight,
      sourceRect: metrics.captureRect
    });

    const currentMaximum = Math.max(0, metrics.pageHeight - metrics.viewportHeight);
    const isComplete = metrics.actualY >= currentMaximum - 1;
    await sendTab(capture.tabId, {
      type: MESSAGE.CONTENT_STEP_DONE,
      step,
      total: Math.max(step, Math.ceil(metrics.pageHeight / metrics.viewportHeight)),
      progress: isComplete ? 1 : metrics.actualY / Math.max(1, currentMaximum)
    }).catch(() => {});
    if (isComplete) break;

    nextPosition = Math.min(currentMaximum, metrics.actualY + metrics.viewportHeight);
  }

  const capturedHeight = Math.min(
    metrics.pageHeight,
    Math.max(metrics.viewportHeight, metrics.actualY + metrics.viewportHeight)
  );
  const remainingScroll = Math.max(
    0,
    metrics.pageHeight - metrics.viewportHeight - metrics.actualY
  );
  capture.truncated = step >= MAX_CAPTURE_STEPS && remainingScroll > 1;
  return finishCapture(capture, capturedHeight);
}

async function captureVisibleOrRegion(capture, regionRequest = null) {
  const tab = await chrome.tabs.get(capture.tabId);
  assertStillActive(capture, tab);
  await setCaptureState({ status: "capturing", step: 1, total: 1, progress: 0.5 });

  let viewport = regionRequest?.viewport;
  if (!viewport) {
    try {
      await injectCaptureScript(capture.tabId);
      const result = await chrome.scripting.executeScript({
        target: { tabId: capture.tabId },
        func: () => ({ width: innerWidth, height: innerHeight, title: document.title, url: location.href })
      });
      viewport = result[0]?.result;
    } catch {
      viewport = {
        width: tab.width,
        height: tab.height,
        title: tab.title,
        url: tab.url
      };
    }
  }

  const sourceRect = regionRequest?.rect || null;
  const pageWidth = sourceRect?.width || viewport.width;
  const pageHeight = sourceRect?.height || viewport.height;
  await startImageSession(capture, {
    pageWidth,
    pageHeight,
    title: regionRequest?.title || viewport.title || tab.title,
    url: regionRequest?.url || viewport.url || tab.url
  });

  const dataUrl = await throttledVisibleCapture(capture.windowId);
  await sendOffscreen({
    type: MESSAGE.OFFSCREEN_ADD_SLICE,
    id: capture.id,
    dataUrl,
    actualY: 0,
    pageHeight,
    viewportWidth: pageWidth,
    viewportHeight: pageHeight,
    windowViewportWidth: viewport.width,
    windowViewportHeight: viewport.height,
    sourceRect
  });
  return finishCapture(capture, pageHeight);
}

async function runCapture(capture, regionRequest = null) {
  try {
    if (capture.mode === CAPTURE_MODE.FULL) {
      await captureFullPage(capture);
    } else {
      await captureVisibleOrRegion(capture, regionRequest);
    }
  } catch (error) {
    const serialized = capture.cancelled
      ? { code: "CANCELLED", message: "Capture cancelled." }
      : makeSerializableError(error);
    if (activeCapture?.id === capture.id) {
      await setCaptureState({
        status: serialized.code === "CANCELLED" ? "cancelled" : "error",
        error: serialized
      });
      if (serialized.code !== "CANCELLED") {
        await chrome.action.setBadgeText({ tabId: capture.tabId, text: "!" }).catch(() => {});
        await chrome.action.setBadgeBackgroundColor({
          tabId: capture.tabId,
          color: "#c73758"
        }).catch(() => {});
        await chrome.action.setTitle({
          tabId: capture.tabId,
          title: errorMessageForCode(serialized)
        }).catch(() => {});
      }
    }
    await sendOffscreen({
      type: MESSAGE.OFFSCREEN_ABORT,
      id: capture.id
    }).catch(() => {});
  } finally {
    if (capture.prepared) {
      await sendTab(capture.tabId, { type: MESSAGE.CONTENT_RESTORE }).catch(() => {});
    }
    if (activeCapture?.status !== "error") {
      await chrome.action.setBadgeText({ tabId: capture.tabId, text: "" }).catch(() => {});
    }
    if (activeCapture?.id === capture.id) {
      const finalState = currentState();
      setTimeout(() => {
        if (activeCapture?.id === capture.id) {
          activeCapture = null;
          broadcastState();
          chrome.action.setBadgeText({ tabId: capture.tabId, text: "" }).catch(() => {});
          chrome.action.setTitle({
            tabId: capture.tabId,
            title: chrome.i18n.getMessage("captureFullPage")
          }).catch(() => {});
        }
      }, finalState.status === "error" ? 5000 : 1200);
    }
  }
}

async function beginCapture(mode, tabOverride = null) {
  if (activeCapture && !["error", "cancelled", "complete"].includes(activeCapture.status)) {
    const error = new Error("A capture is already running.");
    error.code = "CAPTURE_IN_PROGRESS";
    throw error;
  }

  const tab = tabOverride || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
    const error = new Error("No active browser tab was found.");
    error.code = "NO_ACTIVE_TAB";
    throw error;
  }
  if (mode !== CAPTURE_MODE.VISIBLE) {
    assertCapturableTab(tab);
  }
  if (!(await hasPrivacyConsent())) {
    await openPrivacySetup();
    return { consentRequired: true };
  }

  const capture = {
    id: createId(),
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || "Capture",
    url: tab.url || "",
    mode,
    createdAt: new Date().toISOString(),
    status: mode === CAPTURE_MODE.REGION ? "selecting" : "preparing",
    progress: 0,
    cancelled: false,
    prepared: false
  };
  activeCapture = capture;
  await chrome.action.setTitle({
    tabId: tab.id,
    title: chrome.i18n.getMessage("captureFullPage")
  }).catch(() => {});
  await broadcastState();

  if (mode === CAPTURE_MODE.REGION) {
    try {
      await injectCaptureScript(tab.id);
      await sendTab(tab.id, { type: MESSAGE.CONTENT_REGION });
    } catch (error) {
      const serialized = makeSerializableError(error);
      await setCaptureState({ status: "error", error: serialized });
      const captureId = capture.id;
      setTimeout(() => {
        if (activeCapture?.id === captureId) {
          activeCapture = null;
          broadcastState();
        }
      }, 5000);
      throw error;
    }
    return capture;
  }

  runCapture(capture);
  return capture;
}

async function handleRegionSelected(request, sender) {
  if (
    !activeCapture ||
    activeCapture.mode !== CAPTURE_MODE.REGION ||
    activeCapture.tabId !== sender.tab?.id
  ) {
    return;
  }
  activeCapture.status = "preparing";
  await broadcastState();
  runCapture(activeCapture, request);
}

function cancelActiveCapture(senderTabId = null) {
  if (!activeCapture) return false;
  if (senderTabId && activeCapture.tabId !== senderTabId) return false;
  activeCapture.cancelled = true;
  if (activeCapture.status === "selecting") {
    activeCapture.status = "cancelled";
    broadcastState();
    const captureId = activeCapture.id;
    setTimeout(() => {
      if (activeCapture?.id === captureId) {
        activeCapture = null;
        broadcastState();
      }
    }, 800);
  }
  return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request?.type || request.target === "offscreen") return undefined;

  if (request.type === MESSAGE.GET_STATE) {
    sendResponse({ state: currentState() });
    return false;
  }

  if (request.type === MESSAGE.CANCEL_CAPTURE) {
    sendResponse({ ok: cancelActiveCapture(sender.tab?.id || request.tabId) });
    return false;
  }

  if (request.type === MESSAGE.REGION_CANCELLED) {
    cancelActiveCapture(sender.tab?.id);
    sendResponse({ ok: true });
    return false;
  }

  if (request.type === MESSAGE.REGION_SELECTED) {
    handleRegionSelected(request, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ error: makeSerializableError(error) }));
    return true;
  }

  if (request.type === MESSAGE.START_CAPTURE) {
    beginCapture(request.mode)
      .then((capture) => sendResponse({
        ok: true,
        id: capture.id || null,
        consentRequired: Boolean(capture.consentRequired)
      }))
      .catch((error) => sendResponse({ error: makeSerializableError(error) }));
    return true;
  }

  return undefined;
});

chrome.commands.onCommand.addListener((command) => {
  const mode = command === "capture-visible-area"
    ? CAPTURE_MODE.VISIBLE
    : CAPTURE_MODE.FULL;
  chrome.tabs.query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => beginCapture(mode, tab).catch((error) => {
      showActionError(error, tab?.id);
    }))
    .catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  applyToolbarBehavior();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "pagestitch-full",
      title: chrome.i18n.getMessage("captureFullPage"),
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "pagestitch-visible",
      title: chrome.i18n.getMessage("captureVisible"),
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "pagestitch-region",
      title: chrome.i18n.getMessage("captureRegion"),
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "pagestitch-library",
      title: chrome.i18n.getMessage("openLibrary"),
      contexts: ["action"]
    });
  });
});

async function applyToolbarBehavior() {
  const settings = await getSettings();
  await chrome.action.setPopup({
    popup: settings.toolbarAction === "menu" ? "popup/popup.html" : ""
  });
}

chrome.runtime.onStartup.addListener(() => {
  applyToolbarBehavior();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (["sync", "local"].includes(areaName) && changes.toolbarAction) {
    applyToolbarBehavior();
  }
});

chrome.action.onClicked.addListener((tab) => {
  beginCapture(CAPTURE_MODE.FULL, tab).catch((error) => {
    showActionError(error, tab?.id);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cancelActiveCapture(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    cancelActiveCapture(tabId);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const modeById = {
    "pagestitch-full": CAPTURE_MODE.FULL,
    "pagestitch-visible": CAPTURE_MODE.VISIBLE,
    "pagestitch-region": CAPTURE_MODE.REGION
  };
  const mode = modeById[info.menuItemId];
  if (mode) {
    beginCapture(mode, tab).catch((error) => {
      showActionError(error, tab?.id);
    });
  } else if (info.menuItemId === "pagestitch-library") {
    chrome.tabs.create({ url: chrome.runtime.getURL("library/library.html") });
  }
});
