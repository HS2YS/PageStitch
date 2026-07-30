export function localizeDocument(root = document) {
  const language = chrome.i18n.getUILanguage?.();
  if (language && root.documentElement) {
    root.documentElement.lang = language;
  }

  for (const element of root.querySelectorAll("[data-i18n]")) {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  }

  for (const element of root.querySelectorAll("[data-i18n-title]")) {
    const message = chrome.i18n.getMessage(element.dataset.i18nTitle);
    if (message) {
      element.title = message;
      element.setAttribute("aria-label", message);
    }
  }

  for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
    const message = chrome.i18n.getMessage(element.dataset.i18nPlaceholder);
    if (message) element.placeholder = message;
  }

  for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
    const message = chrome.i18n.getMessage(element.dataset.i18nAriaLabel);
    if (message) element.setAttribute("aria-label", message);
  }
}

export function message(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}
