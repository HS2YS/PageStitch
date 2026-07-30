(() => {
  if (globalThis.__PAGESTITCH_CONTENT_VERSION__ === 1) {
    return;
  }
  globalThis.__PAGESTITCH_CONTENT_VERSION__ = 1;

  const MESSAGE = {
    CANCEL_CAPTURE: "capture:cancel",
    REGION_SELECTED: "capture:region-selected",
    REGION_CANCELLED: "capture:region-cancelled",
    CONTENT_PREPARE: "content:prepare",
    CONTENT_SCROLL: "content:scroll",
    CONTENT_STEP_DONE: "content:step-done",
    CONTENT_RESTORE: "content:restore",
    CONTENT_REGION: "content:select-region"
  };

  const captureState = {
    active: false,
    mode: null,
    target: null,
    targetFrame: null,
    targetMarkerValue: null,
    targetKind: "document",
    originalPosition: { x: 0, y: 0 },
    originalInlineStyles: new Map(),
    alteredElements: new Map(),
    fixedElements: [],
    pauseStyles: [],
    hudHost: null,
    hud: null,
    keydownHandler: null,
    delay: 450
  };

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const afterPaint = () => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  function getDocumentHeight() {
    const root = document.scrollingElement || document.documentElement;
    const body = document.body;
    return Math.max(
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      root?.clientHeight || 0,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      window.innerHeight
    );
  }

  function findScrollableTarget() {
    const documentTarget = document.scrollingElement || document.documentElement;
    const documentHeight = getDocumentHeight();
    const documentScrolls = documentHeight > window.innerHeight + 2;
    let winner = documentScrolls ? documentTarget : null;
    let winnerKind = documentScrolls ? "document" : "element";
    let winnerFrame = null;
    let winnerScore = documentScrolls
      ? window.innerWidth *
        window.innerHeight *
        Math.min(4, documentHeight / Math.max(1, window.innerHeight))
      : 0;
    const elements = document.body?.querySelectorAll("*") || [];
    for (const element of elements) {
      if (element.clientHeight < 100 || element.scrollHeight <= element.clientHeight + 2) continue;
      const style = getComputedStyle(element);
      if (!/(auto|scroll|overlay)/.test(style.overflowY)) continue;
      const rect = element.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      if (!visibleWidth || !visibleHeight) continue;
      const score = visibleWidth * visibleHeight * Math.min(4, element.scrollHeight / element.clientHeight);
      if (score > winnerScore) {
        winner = element;
        winnerKind = "element";
        winnerFrame = null;
        winnerScore = score;
      }
    }

    for (const frame of document.querySelectorAll("iframe, frame")) {
      try {
        const frameDocument = frame.contentDocument;
        const frameRoot = frameDocument?.scrollingElement || frameDocument?.documentElement;
        if (!frameRoot || frameRoot.scrollHeight <= frameRoot.clientHeight + 2) continue;
        const rect = frame.getBoundingClientRect();
        const isFullyVisible =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= innerHeight &&
          rect.right <= innerWidth &&
          rect.width >= 120 &&
          rect.height >= 120;
        if (!isFullyVisible) continue;
        const score =
          rect.width *
          rect.height *
          Math.min(4, frameRoot.scrollHeight / Math.max(1, frameRoot.clientHeight));
        if (score > winnerScore) {
          winner = frameRoot;
          winnerKind = "frame";
          winnerFrame = frame;
          winnerScore = score;
        }
      } catch {
        // Cross-origin frames remain visible in pixels but cannot be independently scrolled.
      }
    }

    return winner
      ? { target: winner, kind: winnerKind, frame: winnerFrame }
      : { target: documentTarget, kind: "document" };
  }

  function getPosition() {
    if (captureState.targetKind === "element" || captureState.targetKind === "frame") {
      return {
        x: captureState.target.scrollLeft,
        y: captureState.target.scrollTop
      };
    }
    return { x: window.scrollX, y: window.scrollY };
  }

  function setPosition(x, y) {
    if (captureState.targetKind === "element" || captureState.targetKind === "frame") {
      captureState.target.scrollTo(x, y);
    } else {
      window.scrollTo(x, y);
    }
  }

  function getMetrics() {
    if (captureState.targetKind === "frame") {
      const rect = captureState.targetFrame.getBoundingClientRect();
      const width = Math.min(captureState.target.clientWidth, captureState.targetFrame.clientWidth);
      const height = Math.min(captureState.target.clientHeight, captureState.targetFrame.clientHeight);
      return {
        pageWidth: captureState.target.scrollWidth,
        pageHeight: captureState.target.scrollHeight,
        viewportWidth: width,
        viewportHeight: height,
        windowViewportWidth: window.innerWidth,
        windowViewportHeight: window.innerHeight,
        captureRect: {
          x: Math.max(0, rect.left + captureState.targetFrame.clientLeft),
          y: Math.max(0, rect.top + captureState.targetFrame.clientTop),
          width,
          height
        },
        targetKind: "frame"
      };
    }

    if (captureState.targetKind === "element") {
      const rect = captureState.target.getBoundingClientRect();
      return {
        pageWidth: captureState.target.scrollWidth,
        pageHeight: captureState.target.scrollHeight,
        viewportWidth: captureState.target.clientWidth,
        viewportHeight: captureState.target.clientHeight,
        windowViewportWidth: window.innerWidth,
        windowViewportHeight: window.innerHeight,
        captureRect: {
          x: Math.max(0, rect.left + captureState.target.clientLeft),
          y: Math.max(0, rect.top + captureState.target.clientTop),
          width: captureState.target.clientWidth,
          height: captureState.target.clientHeight
        },
        targetKind: "element"
      };
    }

    return {
      pageWidth: window.innerWidth,
      pageHeight: getDocumentHeight(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      windowViewportWidth: window.innerWidth,
      windowViewportHeight: window.innerHeight,
      captureRect: null,
      targetKind: "document"
    };
  }

  function rememberStyle(element, property) {
    if (!captureState.originalInlineStyles.has(element)) {
      captureState.originalInlineStyles.set(element, new Map());
    }
    const styles = captureState.originalInlineStyles.get(element);
    if (!styles.has(property)) {
      styles.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      });
    }
  }

  function forceStyle(element, property, value) {
    rememberStyle(element, property);
    element.style.setProperty(property, value, "important");
  }

  function restoreRememberedStyles() {
    for (const [element, styles] of captureState.originalInlineStyles) {
      for (const [property, original] of styles) {
        if (original.value) {
          element.style.setProperty(property, original.value, original.priority);
        } else {
          element.style.removeProperty(property);
        }
      }
    }
    captureState.originalInlineStyles.clear();
  }

  function collectFloatingElements() {
    const floating = [];
    const scopeDocument = captureState.targetKind === "frame"
      ? captureState.target.ownerDocument
      : document;
    const elements = scopeDocument.body?.querySelectorAll("*") || [];
    const view = scopeDocument.defaultView || window;
    const scrollPosition = getPosition().y;
    const targetRect = captureState.targetKind === "element"
      ? captureState.target.getBoundingClientRect()
      : null;
    for (const element of elements) {
      if (element === captureState.hudHost) continue;
      const style = view.getComputedStyle(element);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      floating.push({
        element,
        position: style.position,
        documentTop: targetRect
          ? rect.top - targetRect.top + scrollPosition
          : rect.top + scrollPosition
      });
    }
    captureState.fixedElements = floating;
  }

  function updateFloatingElements(scrollPosition) {
    for (const item of captureState.fixedElements) {
      const shouldHide = item.position === "fixed"
        ? scrollPosition > 0
        : scrollPosition > item.documentTop + 1;
      if (shouldHide && !captureState.alteredElements.has(item.element)) {
        captureState.alteredElements.set(item.element, {
          value: item.element.style.getPropertyValue("visibility"),
          priority: item.element.style.getPropertyPriority("visibility")
        });
        item.element.style.setProperty("visibility", "hidden", "important");
      } else if (!shouldHide && captureState.alteredElements.has(item.element)) {
        const original = captureState.alteredElements.get(item.element);
        if (original.value) {
          item.element.style.setProperty("visibility", original.value, original.priority);
        } else {
          item.element.style.removeProperty("visibility");
        }
        captureState.alteredElements.delete(item.element);
      }
    }
  }

  function restoreFloatingElements() {
    for (const [element, original] of captureState.alteredElements) {
      if (original.value) {
        element.style.setProperty("visibility", original.value, original.priority);
      } else {
        element.style.removeProperty("visibility");
      }
    }
    captureState.alteredElements.clear();
    captureState.fixedElements = [];
  }

  function createHud() {
    const host = document.createElement("div");
    host.dataset.pagestitchUi = "capture-hud";
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "inset: 18px 18px auto auto",
      "z-index: 2147483647"
    ].join(";");

    const root = host.attachShadow({ mode: "closed" });
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <style>
        :host { all: initial; }
        .hud {
          width: 250px;
          padding: 13px 14px;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 14px;
          background: rgba(17, 24, 39, .94);
          box-shadow: 0 18px 50px rgba(15, 23, 42, .32);
          color: #f8fafc;
          font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          backdrop-filter: blur(16px);
        }
        .row { display: flex; align-items: center; gap: 10px; }
        .mark {
          display: grid; place-items: center; flex: 0 0 32px; height: 32px;
          border-radius: 9px; background: linear-gradient(135deg, #7c3aed, #06b6d4);
          font-size: 16px; font-weight: 800;
        }
        .copy { min-width: 0; flex: 1; }
        .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .detail { margin-top: 2px; color: #a5b4fc; font-size: 11px; }
        button {
          border: 0; border-radius: 8px; padding: 7px 9px; cursor: pointer;
          color: #e2e8f0; background: rgba(255,255,255,.08);
          font: inherit; font-size: 11px;
        }
        button:hover { background: rgba(255,255,255,.14); }
        .track {
          height: 3px; margin-top: 11px; overflow: hidden;
          border-radius: 99px; background: rgba(255,255,255,.11);
        }
        .bar {
          width: 4%; height: 100%; border-radius: inherit;
          background: linear-gradient(90deg, #8b5cf6, #22d3ee);
          transition: width .22s ease;
        }
      </style>
      <div class="hud" role="status" aria-live="polite">
        <div class="row">
          <div class="mark" aria-hidden="true">P</div>
          <div class="copy">
            <div class="title"></div>
            <div class="detail"></div>
          </div>
          <button type="button"></button>
        </div>
        <div class="track"><div class="bar"></div></div>
      </div>
    `;
    root.append(wrapper);
    document.documentElement.append(host);

    const hud = {
      title: wrapper.querySelector(".title"),
      detail: wrapper.querySelector(".detail"),
      bar: wrapper.querySelector(".bar"),
      button: wrapper.querySelector("button")
    };
    hud.title.textContent = chrome.i18n.getMessage("capturing") || "Capturing…";
    hud.detail.textContent = chrome.i18n.getMessage("preparing") || "Preparing page…";
    hud.button.textContent = chrome.i18n.getMessage("cancel") || "Cancel";
    hud.button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: MESSAGE.CANCEL_CAPTURE });
    });

    captureState.hudHost = host;
    captureState.hud = hud;
  }

  function showHud(progress, step, total) {
    if (!captureState.hudHost) return;
    captureState.hudHost.style.visibility = "visible";
    const template = chrome.i18n.getMessage("scrolling", [String(step), String(total)]);
    captureState.hud.detail.textContent = template || `Capturing section ${step} of ${total}`;
    captureState.hud.bar.style.width = `${Math.max(3, Math.min(100, progress * 100))}%`;
  }

  function hideHud() {
    if (captureState.hudHost) captureState.hudHost.style.visibility = "hidden";
  }

  async function prepare(options) {
    if (captureState.active) {
      await restore();
    }

    captureState.mode = options.mode;
    captureState.delay = Number(options.delay) || 450;
    const selected = findScrollableTarget();
    captureState.target = selected.target;
    captureState.targetFrame = selected.frame || null;
    captureState.targetKind = selected.kind;
    captureState.targetMarkerValue =
      captureState.target.getAttribute("data-pagestitch-capture-target");
    captureState.target.setAttribute("data-pagestitch-capture-target", "true");
    captureState.originalPosition = getPosition();
    captureState.active = true;

    for (const element of new Set([
      document.documentElement,
      document.body,
      captureState.target
    ].filter(Boolean))) {
      forceStyle(element, "scroll-behavior", "auto");
      forceStyle(element, "scroll-snap-type", "none");
      forceStyle(element, "overflow-anchor", "none");
    }

    captureState.pauseStyles = [];
    for (const targetDocument of new Set([
      document,
      captureState.target?.ownerDocument
    ].filter(Boolean))) {
      const pauseStyle = targetDocument.createElement("style");
      pauseStyle.dataset.pagestitchStyle = "capture";
      pauseStyle.textContent = `
        *, *::before, *::after {
          animation-play-state: paused !important;
          caret-color: transparent !important;
          scroll-behavior: auto !important;
          transition-delay: 0s !important;
          transition-duration: 0s !important;
        }
        html::-webkit-scrollbar,
        body::-webkit-scrollbar,
        [data-pagestitch-capture-target="true"]::-webkit-scrollbar {
          display: none !important;
        }
        [data-pagestitch-capture-target="true"] {
          scrollbar-width: none !important;
        }
      `;
      targetDocument.documentElement.append(pauseStyle);
      captureState.pauseStyles.push(pauseStyle);
    }

    setPosition(0, 0);
    await wait(Math.min(captureState.delay, 250));
    await afterPaint();
    collectFloatingElements();
    createHud();

    captureState.keydownHandler = (event) => {
      if (event.key === "Escape") {
        chrome.runtime.sendMessage({ type: MESSAGE.CANCEL_CAPTURE });
      }
    };
    addEventListener("keydown", captureState.keydownHandler, true);

    return {
      ...getMetrics(),
      originalPosition: captureState.originalPosition,
      title: document.title,
      url: location.href
    };
  }

  async function scrollForCapture(options) {
    if (!captureState.active) {
      throw new Error("Capture state was lost. Please start again.");
    }

    const targetPosition = Math.max(0, Number(options.position) || 0);
    hideHud();
    setPosition(0, targetPosition);
    await wait(Number(options.delay) || captureState.delay);
    await afterPaint();

    const actualPosition = getPosition();
    updateFloatingElements(actualPosition.y);
    await afterPaint();

    return {
      ...getMetrics(),
      actualX: actualPosition.x,
      actualY: actualPosition.y
    };
  }

  async function stepDone(options) {
    showHud(options.progress, options.step, options.total);
    return { ok: true };
  }

  async function restore() {
    if (!captureState.active) return { ok: true };

    restoreFloatingElements();
    for (const pauseStyle of captureState.pauseStyles) pauseStyle.remove();
    captureState.pauseStyles = [];
    captureState.hudHost?.remove();
    captureState.hudHost = null;
    captureState.hud = null;

    if (captureState.keydownHandler) {
      removeEventListener("keydown", captureState.keydownHandler, true);
      captureState.keydownHandler = null;
    }

    setPosition(captureState.originalPosition.x, captureState.originalPosition.y);
    restoreRememberedStyles();
    if (captureState.targetMarkerValue === null) {
      captureState.target.removeAttribute("data-pagestitch-capture-target");
    } else {
      captureState.target.setAttribute(
        "data-pagestitch-capture-target",
        captureState.targetMarkerValue
      );
    }
    captureState.active = false;
    captureState.target = null;
    captureState.targetFrame = null;
    captureState.targetMarkerValue = null;
    await afterPaint();
    return { ok: true };
  }

  async function selectRegion() {
    const previous = document.querySelector("[data-pagestitch-region-host]");
    previous?.remove();

    const host = document.createElement("div");
    host.dataset.pagestitchRegionHost = "true";
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647"
    ].join(";");
    const root = host.attachShadow({ mode: "closed" });
    const overlay = document.createElement("div");
    overlay.innerHTML = `
      <style>
        :host { all: initial; }
        .surface {
          position: fixed; inset: 0; cursor: crosshair; touch-action: none;
          background: rgba(15, 23, 42, .32);
          font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .hint {
          position: fixed; left: 50%; top: 20px; transform: translateX(-50%);
          padding: 9px 13px; border: 1px solid rgba(255,255,255,.18);
          border-radius: 10px; color: white; background: rgba(15,23,42,.9);
          box-shadow: 0 10px 30px rgba(15,23,42,.25); pointer-events: none;
        }
        .selection {
          position: fixed; display: none; box-sizing: border-box;
          border: 2px solid #67e8f9; background: rgba(34,211,238,.09);
          box-shadow: 0 0 0 99999px rgba(15,23,42,.46);
        }
        .size {
          position: absolute; right: -2px; bottom: -30px; padding: 4px 7px;
          border-radius: 6px; color: white; background: #0f172a; white-space: nowrap;
          font-size: 11px;
        }
      </style>
      <div class="surface">
        <div class="hint"></div>
        <div class="selection"><span class="size"></span></div>
      </div>
    `;
    root.append(overlay);
    document.documentElement.append(host);

    const surface = overlay.querySelector(".surface");
    const selection = overlay.querySelector(".selection");
    const size = overlay.querySelector(".size");
    overlay.querySelector(".hint").textContent =
      chrome.i18n.getMessage("regionHint") || "Drag to select an area · Esc to cancel";

    let start = null;
    let currentRect = null;

    const cancel = () => {
      cleanup();
      chrome.runtime.sendMessage({ type: MESSAGE.REGION_CANCELLED });
    };

    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };

    const cleanup = () => {
      removeEventListener("keydown", keydown, true);
      host.remove();
    };

    surface.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      surface.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY };
      currentRect = null;
      selection.style.display = "block";
    });

    surface.addEventListener("pointermove", (event) => {
      if (!start) return;
      const left = Math.max(0, Math.min(start.x, event.clientX));
      const top = Math.max(0, Math.min(start.y, event.clientY));
      const right = Math.min(innerWidth, Math.max(start.x, event.clientX));
      const bottom = Math.min(innerHeight, Math.max(start.y, event.clientY));
      currentRect = {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top)
      };
      Object.assign(selection.style, {
        left: `${currentRect.x}px`,
        top: `${currentRect.y}px`,
        width: `${currentRect.width}px`,
        height: `${currentRect.height}px`
      });
      size.textContent = `${currentRect.width} × ${currentRect.height}`;
    });

    surface.addEventListener("pointerup", async (event) => {
      if (!start) return;
      surface.releasePointerCapture(event.pointerId);
      start = null;
      if (!currentRect || currentRect.width < 4 || currentRect.height < 4) {
        selection.style.display = "none";
        return;
      }
      const rect = currentRect;
      cleanup();
      await afterPaint();
      await wait(80);
      chrome.runtime.sendMessage({
        type: MESSAGE.REGION_SELECTED,
        rect,
        viewport: { width: innerWidth, height: innerHeight },
        title: document.title,
        url: location.href
      });
    });

    addEventListener("keydown", keydown, true);
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    const handlers = {
      [MESSAGE.CONTENT_PREPARE]: () => prepare(request),
      [MESSAGE.CONTENT_SCROLL]: () => scrollForCapture(request),
      [MESSAGE.CONTENT_STEP_DONE]: () => stepDone(request),
      [MESSAGE.CONTENT_RESTORE]: () => restore(),
      [MESSAGE.CONTENT_REGION]: () => selectRegion()
    };
    const handler = handlers[request?.type];
    if (!handler) return undefined;

    handler()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ error: error.message || String(error) }));
    return true;
  });
})();
