import test from "node:test";
import assert from "node:assert/strict";
import {
  annotationBounds,
  rectanglesIntersect
} from "../shared/annotations.js";

test("annotationBounds covers arrows in either direction", () => {
  const bounds = annotationBounds({
    type: "arrow",
    x1: 100,
    y1: 90,
    x2: 20,
    y2: 10,
    strokeWidth: 4
  });
  assert.ok(bounds.x < 20);
  assert.ok(bounds.y < 10);
  assert.ok(bounds.x + bounds.width > 100);
  assert.ok(bounds.y + bounds.height > 90);
});

test("rectanglesIntersect rejects separated rectangles", () => {
  assert.equal(rectanglesIntersect(
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 12, y: 12, width: 5, height: 5 }
  ), false);
  assert.equal(rectanglesIntersect(
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 8, y: 8, width: 5, height: 5 }
  ), true);
});
