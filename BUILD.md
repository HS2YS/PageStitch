# PageStitch build instructions

This document describes how to verify the supplied source files and create the
Chrome and Opera release archives from the command line.

## Reference build environment

The following environment was used to validate these instructions:

| Component | Version | Required for the build |
| --- | --- | --- |
| Operating system | macOS 26.5.2, build 25F84 (Apple silicon/ARM64) | Reference platform |
| Shell | zsh 5.9 | Any POSIX-compatible shell is suitable |
| Node.js | 24.18.0 | Yes; `package.json` declares Node.js 20 or newer |
| npm | 11.16.0 | Yes; supplied with Node.js |
| Info-ZIP `zip` | 3.0 (Apple-provided build) | Yes |
| Info-ZIP `unzip` | 6.00 (Apple-provided build) | Yes |
| Git | 2.50.1 (Apple Git-155) | Optional; only needed when obtaining the sources from Git |
| Yarn | Not used or installed | No |
| Grunt | Not used or installed | No |

Use Node.js 24.18.0 and npm 11.16.0 when an exact reproduction of the reference
environment is required. The project has no third-party npm dependencies, no
`node_modules` requirement, and no lock file. Therefore, do not run `npm ci`;
no dependency-installation step is needed.

The packaging script calls the `zip` and `unzip` executables directly. Both are
included with the reference macOS version. On another operating system, install
Info-ZIP and ensure both commands are available on `PATH`. On Windows, use a
POSIX environment such as WSL with Node.js, `zip`, and `unzip` installed inside
that environment.

## 1. Prepare the environment

Install Node.js 24.18.0, which includes npm, using your normal Node.js version
manager or the official Node.js installer.

Open Terminal and verify the required tools:

```sh
node --version
npm --version
zip -v | sed -n '1,2p'
unzip -v | sed -n '1p'
```

The reference environment reports:

```text
v24.18.0
11.16.0
This is Zip 3.0
UnZip 6.00
```

If the sources were supplied as an archive, extract the archive first. Then
change to the directory containing `package.json` and `manifest.json`:

```sh
cd /absolute/path/to/GoFullPage
test -f package.json && test -f manifest.json && echo "Source directory OK"
```

Expected result:

```text
Source directory OK
```

## 2. Verify the sources

Run all static checks and unit tests:

```sh
npm run verify
```

This command performs the following operations:

1. Validates JSON files, manifest settings, permissions, locale parity, HTML
   references, JavaScript syntax, and Manifest V3 content-security constraints.
2. Runs the Node.js unit-test suite.

A successful run ends with output similar to:

```text
Extension check passed (70 files inspected).
tests 21
pass 21
fail 0
```

Do not create release archives if this command fails.

## 3. Create the release archives

Build both store packages:

```sh
npm run package
```

For PageStitch version 0.4.0, the command creates:

```text
dist/pagestitch-0.4.0-chrome.zip
dist/pagestitch-0.4.0-opera.zip
```

The packaging script copies only runtime files into a temporary directory,
writes the target-specific `manifest.json`, creates each ZIP file, tests the ZIP
integrity, and audits its contents. Existing ZIP files with the same names are
replaced.

To build only one browser target, use one of these commands:

```sh
npm run package:chrome
npm run package:opera
```

## 4. Check the generated files

List the resulting archives:

```sh
ls -lh dist/pagestitch-0.4.0-chrome.zip \
  dist/pagestitch-0.4.0-opera.zip
```

Test their integrity:

```sh
unzip -tq dist/pagestitch-0.4.0-chrome.zip
unzip -tq dist/pagestitch-0.4.0-opera.zip
```

Each command should report that no errors were detected. Confirm that
`manifest.json` is located at the root of each archive:

```sh
unzip -Z1 dist/pagestitch-0.4.0-chrome.zip | \
  grep -x 'manifest.json'
unzip -Z1 dist/pagestitch-0.4.0-opera.zip | \
  grep -x 'manifest.json'
```

Optionally record SHA-256 checksums:

```sh
shasum -a 256 dist/pagestitch-0.4.0-chrome.zip \
  dist/pagestitch-0.4.0-opera.zip
```

The Chrome package retains `minimum_chrome_version: "109"`. The Opera package
replaces that field with `minimum_opera_version: "95"`.

## 5. Load a package for manual testing

Extract a package into a new temporary directory:

```sh
mkdir -p /tmp/pagestitch-chrome
unzip -q dist/pagestitch-0.4.0-chrome.zip \
  -d /tmp/pagestitch-chrome
```

Then:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `/tmp/pagestitch-chrome`.
5. Confirm that the extension loads without manifest or service-worker errors.

For Opera, extract the Opera archive to a separate directory and repeat the
procedure from `opera://extensions`.

Complete the manual checks in `docs/SMOKE_TEST.md` before publishing either
archive.

## Troubleshooting

- `node: command not found`: install Node.js 24.18.0 and open a new Terminal
  session.
- `zip` or `unzip` not found: install Info-ZIP and make the executables available
  on `PATH`.
- `npm ci` reports that a lock file is missing: this is expected; the repository
  has no npm dependencies, so skip `npm ci`.
- The output filename has a different version: archive names are derived from
  the `version` field in `manifest.json`. `package.json` must contain the same
  version.
- Verification fails: correct the reported source or manifest error, run
  `npm run verify` again, and package only after all checks pass.
