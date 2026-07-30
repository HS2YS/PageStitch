import { localizeDocument } from "../shared/i18n.js";
import { getSettings, setSettings } from "../shared/settings.js";

const form = document.querySelector("#settings-form");
const quality = document.querySelector("#jpeg-quality");
const qualityOutput = document.querySelector("#quality-output");
const toast = document.querySelector("#toast");
let toastTimer = null;

function showToast() {
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 1600);
}

function updateQualityOutput() {
  qualityOutput.textContent = `${Math.round(Number(quality.value) * 100)}%`;
}

async function save() {
  const values = Object.fromEntries(new FormData(form));
  await setSettings({
    format: values.format,
    jpegQuality: Number(values.jpegQuality),
    pdfFormat: values.pdfFormat,
    pdfOrientation: values.pdfOrientation,
    pdfMetadata: form.elements.pdfMetadata.checked,
    captureDelay: Number(values.captureDelay),
    fileNameTemplate: values.fileNameTemplate,
    keepHistory: Number(values.keepHistory),
    downloadSubfolder: values.downloadSubfolder,
    toolbarAction: values.toolbarAction,
    saveAs: form.elements.saveAs.checked,
    autoDownload: form.elements.autoDownload.checked
  });
  showToast();
}

localizeDocument();
const settings = await getSettings();
form.elements.format.value = settings.format;
form.elements.jpegQuality.value = settings.jpegQuality;
form.elements.pdfFormat.value = settings.pdfFormat;
form.elements.pdfOrientation.value = settings.pdfOrientation;
form.elements.pdfMetadata.checked = settings.pdfMetadata;
form.elements.captureDelay.value = String(settings.captureDelay);
form.elements.fileNameTemplate.value = settings.fileNameTemplate;
form.elements.keepHistory.value = String(settings.keepHistory);
form.elements.downloadSubfolder.value = settings.downloadSubfolder;
form.elements.toolbarAction.value = settings.toolbarAction;
form.elements.saveAs.checked = settings.saveAs;
form.elements.autoDownload.checked = settings.autoDownload;
updateQualityOutput();

form.addEventListener("change", save);
form.elements.fileNameTemplate.addEventListener("input", () => {
  clearTimeout(form.elements.fileNameTemplate.saveTimer);
  form.elements.fileNameTemplate.saveTimer = setTimeout(save, 350);
});
quality.addEventListener("input", updateQualityOutput);
document.querySelector("#shortcuts-button").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
document.querySelector("#privacy-details-button").addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("onboarding/onboarding.html?review=1")
  });
});
