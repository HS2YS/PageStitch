import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outputDirectory = join(root, "dist");
const archiveName = `pagestitch-${manifest.version}.zip`;
const archivePath = join(outputDirectory, archiveName);
const included = [
  "manifest.json",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "_locales",
  "assets",
  "background",
  "content",
  "docs",
  "editor",
  "library",
  "offscreen",
  "options",
  "popup",
  "shared"
];

mkdirSync(outputDirectory, { recursive: true });
if (existsSync(archivePath)) rmSync(archivePath);

const zip = spawnSync("zip", ["-qr", archivePath, ...included], {
  cwd: root,
  encoding: "utf8"
});
if (zip.status !== 0) {
  console.error(zip.stderr || "The zip command failed.");
  process.exit(zip.status || 1);
}

const integrity = spawnSync("unzip", ["-tq", archivePath], {
  cwd: root,
  encoding: "utf8"
});
if (integrity.status !== 0) {
  console.error(integrity.stdout || integrity.stderr || "Archive integrity check failed.");
  process.exit(integrity.status || 1);
}

console.log(`Created dist/${archiveName}`);
