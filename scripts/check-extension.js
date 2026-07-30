import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function filesUnder(directory) {
  const output = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const relativePath = relative(root, path);
    if ([".git", "node_modules", "dist"].some((part) => relativePath.split("/").includes(part))) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      output.push(...filesUnder(path));
    } else {
      output.push(path);
    }
  }
  return output;
}

function parseJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${relative(root, path)}: ${error.message}`);
    return null;
  }
}

const files = filesUnder(root);
const manifest = parseJson(join(root, "manifest.json"));
const packageJson = parseJson(join(root, "package.json"));

for (const file of files.filter((path) => path.endsWith(".json"))) {
  parseJson(file);
}

for (const file of files.filter((path) => path.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${relative(root, file)}: ${result.stderr.trim()}`);
  }
}

if (manifest) {
  const referencedFiles = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ].filter(Boolean);
  for (const path of referencedFiles) {
    if (!existsSync(join(root, path))) fail(`manifest.json references missing file: ${path}`);
  }
  if (manifest.manifest_version !== 3) fail("manifest.json must use Manifest V3.");
  if (!manifest.permissions?.includes("activeTab")) fail("manifest.json must include activeTab.");
  if (manifest.host_permissions?.length) fail("Host permissions are intentionally not allowed.");
  if (packageJson && packageJson.version !== manifest.version) {
    fail("package.json and manifest.json versions differ.");
  }
}

const english = parseJson(join(root, "_locales/en/messages.json"));
const russian = parseJson(join(root, "_locales/ru/messages.json"));
if (english && russian) {
  const englishKeys = Object.keys(english).sort();
  const russianKeys = Object.keys(russian).sort();
  if (englishKeys.join("\n") !== russianKeys.join("\n")) {
    fail("English and Russian locale keys differ.");
  }
  for (const key of englishKeys) {
    const englishSlots = [...english[key].message.matchAll(/\$(\d+)/g)].map((match) => match[1]).sort();
    const russianSlots = [...russian[key].message.matchAll(/\$(\d+)/g)].map((match) => match[1]).sort();
    if (englishSlots.join(",") !== russianSlots.join(",")) {
      fail(`Locale substitution slots differ for "${key}".`);
    }
  }
  if (english.appName?.message.length > 75) fail("Localized extension name exceeds 75 characters.");
  if (english.appDescription?.message.length > 132) fail("Localized extension description exceeds 132 characters.");
}

for (const file of files.filter((path) => path.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html);
  if (inlineScript) fail(`${relative(root, file)} contains an inline script, which violates MV3 CSP.`);
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const reference = match[1];
    if (!reference || /^(?:#|https?:|data:|mailto:)/.test(reference)) continue;
    const target = resolve(file, "..", reference.split(/[?#]/)[0]);
    if (!existsSync(target)) {
      fail(`${relative(root, file)} references missing file: ${reference}`);
    }
  }
  if (english) {
    for (const match of html.matchAll(/\bdata-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"/g)) {
      if (!english[match[1]]) {
        fail(`${relative(root, file)} references missing locale key: ${match[1]}`);
      }
    }
  }
}

for (const file of files.filter((path) => path.endsWith(".js"))) {
  const source = readFileSync(file, "utf8");
  const relativeFile = relative(root, file);
  if (/\b(?:eval|Function)\s*\(/.test(source)) {
    fail(`${relativeFile} uses dynamic code execution.`);
  }
  if (/\bimport\s*\(\s*["']https?:/i.test(source)) {
    fail(`${relativeFile} imports remote code.`);
  }
  if (
    !relativeFile.startsWith("scripts/") &&
    !relativeFile.startsWith("test/") &&
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(source)
  ) {
    fail(`${relativeFile} contains a network API; captures must remain local.`);
  }
}

if (manifest && english) {
  for (const value of [manifest.name, manifest.description, manifest.action?.default_title]) {
    const match = /^__MSG_(.+)__$/.exec(value || "");
    if (match && !english[match[1]]) {
      fail(`manifest.json references missing locale key: ${match[1]}`);
    }
  }
  const allowedPermissions = new Set([
    "activeTab",
    "clipboardWrite",
    "contextMenus",
    "downloads",
    "offscreen",
    "scripting",
    "storage",
    "unlimitedStorage"
  ]);
  for (const permission of manifest.permissions || []) {
    if (!allowedPermissions.has(permission)) {
      fail(`manifest.json contains unexpected permission: ${permission}`);
    }
  }
}

if (failures.length) {
  console.error(`Extension check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Extension check passed (${files.length} files inspected).`);
