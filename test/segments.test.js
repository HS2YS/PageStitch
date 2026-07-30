import test from "node:test";
import assert from "node:assert/strict";
import {
  maximumSegmentHeight,
  splitRangeAcrossSegments
} from "../shared/segments.js";

test("splitRangeAcrossSegments keeps a frame inside one segment", () => {
  assert.deepEqual(splitRangeAcrossSegments(120, 920, 12000), [{
    index: 0,
    globalStart: 120,
    globalEnd: 920,
    localStart: 120,
    length: 800,
    sourceOffset: 0
  }]);
});

test("splitRangeAcrossSegments preserves every pixel across a boundary", () => {
  const parts = splitRangeAcrossSegments(11700, 12500, 12000);
  assert.deepEqual(parts, [
    {
      index: 0,
      globalStart: 11700,
      globalEnd: 12000,
      localStart: 11700,
      length: 300,
      sourceOffset: 0
    },
    {
      index: 1,
      globalStart: 12000,
      globalEnd: 12500,
      localStart: 0,
      length: 500,
      sourceOffset: 300
    }
  ]);
  assert.equal(parts.reduce((sum, part) => sum + part.length, 0), 800);
});

test("splitRangeAcrossSegments spans multiple complete segments", () => {
  const parts = splitRangeAcrossSegments(0, 25000, 12000);
  assert.deepEqual(parts.map((part) => part.length), [12000, 12000, 1000]);
  assert.deepEqual(parts.map((part) => part.index), [0, 1, 2]);
});

test("maximumSegmentHeight caps wide captures by pixel area", () => {
  assert.equal(maximumSegmentHeight(1920, 6000, 24_000_000), 6000);
  assert.equal(maximumSegmentHeight(7680, 6000, 24_000_000), 3125);
  assert.equal(maximumSegmentHeight(0, 0, 0), 1);
});
