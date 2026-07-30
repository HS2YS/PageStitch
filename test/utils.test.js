import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFilename,
  calculateCapturePositions,
  clamp,
  sanitizeFilename
} from "../shared/utils.js";

test("clamp keeps a value inside its range", () => {
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(14, 0, 10), 10);
});

test("sanitizeFilename removes reserved characters and trailing dots", () => {
  assert.equal(sanitizeFilename('  report: "one" / two...  '), "report one two");
  assert.equal(sanitizeFilename("..."), "capture");
});

test("buildFilename substitutes metadata tokens", () => {
  const filename = buildFilename(
    "{host}-{title}-{date}",
    {
      title: "Release / notes",
      url: "https://www.example.com/docs",
      createdAt: "2026-07-30T10:12:13.000Z"
    },
    "png"
  );
  assert.match(filename, /^example\.com-Release notes-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);
});

test("calculateCapturePositions includes the exact final scroll", () => {
  assert.deepEqual(calculateCapturePositions(800, 900), [0]);
  assert.deepEqual(calculateCapturePositions(2500, 1000), [0, 1000, 1500]);
  assert.deepEqual(calculateCapturePositions(3000, 1000), [0, 1000, 2000]);
});
