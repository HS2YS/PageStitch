import test from "node:test";
import assert from "node:assert/strict";
import {
  captureRecordIntersections,
  maximumPartHeight,
  normalizeRegion
} from "../shared/image-renderer.js";

test("captureRecordIntersections selects only records touched by an export part", () => {
  const records = [
    { id: "a", height: 100 },
    { id: "b", height: 100 },
    { id: "c", height: 100 },
    { id: "d", height: 100 }
  ];
  const intersections = captureRecordIntersections(
    records,
    { x: 0, y: 90, width: 500, height: 130 }
  );

  assert.deepEqual(
    intersections.map(({ record, sourceY, sourceHeight, destinationOffsetY }) => ({
      id: record.id,
      sourceY,
      sourceHeight,
      destinationOffsetY
    })),
    [
      { id: "a", sourceY: 90, sourceHeight: 10, destinationOffsetY: 0 },
      { id: "b", sourceY: 0, sourceHeight: 100, destinationOffsetY: 10 },
      { id: "c", sourceY: 0, sourceHeight: 20, destinationOffsetY: 110 }
    ]
  );
});

test("normalizeRegion clamps a reversed crop to capture bounds", () => {
  assert.deepEqual(
    normalizeRegion({ x: 80, y: 70, width: -100, height: -90 }, 60, 50),
    { x: 0, y: 0, width: 60, height: 50 }
  );
});

test("maximumPartHeight respects both canvas height and area limits", () => {
  assert.equal(maximumPartHeight(1), 30000);
  assert.equal(maximumPartHeight(6000), 4000);
});
