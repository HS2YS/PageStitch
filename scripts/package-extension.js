import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const sourceManifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outputDirectory = join(root, "dist");
const runtimePaths = [
  "LICENSE",
  "_locales",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon-128.png",
  "background",
  "content",
  "editor",
  "library",
  "offscreen",
  "onboarding",
  "options",
  "popup",
  "shared"
];
const allowedTargets = new Set(["chrome", "opera", "both"]);
const targetArgument = process.argv
  .find((argument) => argument.startsWith("--target="))
  ?.split("=")[1] || "both";

if (!allowedTargets.has(targetArgument)) {
  console.error("Use --target=chrome, --target=opera, or --target=both.");
  process.exit(1);
}

const targets = targetArgument === "both"
  ? ["chrome", "opera"]
  : [targetArgument];

function manifestFor(target) {
  const manifest = structuredClone(sourceManifest);
  if (target === "opera") {
    delete manifest.minimum_chrome_version;
    manifest.minimum_opera_version = "95";
  }
  return manifest;
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
      result.stdout?.trim() ||
      `${command} failed with exit code ${result.status}.`
    );
  }
  return result.stdout;
}

function auditArchive(archivePath, target) {
  run("unzip", ["-tq", archivePath], { cwd: root });
  const entries = run("unzip", ["-Z1", archivePath], { cwd: root })
    .split("\n")
    .filter(Boolean);

  if (!entries.includes("manifest.json")) {
    throw new Error(`${basename(archivePath)} does not contain manifest.json at its root.`);
  }
  const forbidden = entries.filter((entry) =>
    /(^|\/)(?:\.DS_Store|node_modules|test|tests|docs|scripts|store)(?:\/|$)/.test(entry) ||
    /(?:^|\/)(?:README|PRIVACY)(?:\.|$)/i.test(entry) ||
    entry.endsWith("icon.svg")
  );
  if (forbidden.length) {
    throw new Error(`${basename(archivePath)} contains non-runtime files: ${forbidden.join(", ")}`);
  }

  const archivedManifest = JSON.parse(
    run("unzip", ["-p", archivePath, "manifest.json"], { cwd: root })
  );
  if (target === "opera") {
    if (archivedManifest.minimum_opera_version !== "95") {
      throw new Error("Opera package must declare minimum_opera_version 95.");
    }
    if ("minimum_chrome_version" in archivedManifest) {
      throw new Error("Opera package must not declare minimum_chrome_version.");
    }
  } else {
    if (archivedManifest.minimum_chrome_version !== "109") {
      throw new Error("Chrome package must declare minimum_chrome_version 109.");
    }
    if ("minimum_opera_version" in archivedManifest) {
      throw new Error("Chrome package must not declare minimum_opera_version.");
    }
  }
}

mkdirSync(outputDirectory, { recursive: true });

for (const target of targets) {
  const stagingRoot = mkdtempSync(join(tmpdir(), `pagestitch-${target}-`));
  const archiveName = `pagestitch-${sourceManifest.version}-${target}.zip`;
  const archivePath = join(outputDirectory, archiveName);

  try {
    for (const relativePath of runtimePaths) {
      const sourcePath = join(root, relativePath);
      const destinationPath = join(stagingRoot, relativePath);
      mkdirSync(resolve(destinationPath, ".."), { recursive: true });
      cpSync(sourcePath, destinationPath, { recursive: true });
    }
    writeFileSync(
      join(stagingRoot, "manifest.json"),
      `${JSON.stringify(manifestFor(target), null, 2)}\n`
    );

    if (existsSync(archivePath)) rmSync(archivePath);
    run("zip", ["-qr", archivePath, "."], { cwd: stagingRoot });
    auditArchive(archivePath, target);
    console.log(`Created dist/${archiveName}`);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}
