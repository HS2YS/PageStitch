import test from "node:test";
import assert from "node:assert/strict";
import {
  annotationBounds,
  findTopmostAnnotationAtPoint,
  rectanglesIntersect,
  translateAnnotation
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

test("findTopmostAnnotationAtPoint returns the visually topmost match", () => {
  const annotations = [
    { type: "rectangle", x: 10, y: 10, width: 80, height: 80, strokeWidth: 2 },
    { type: "emoji", x: 50, y: 50, text: "✨", size: 30 }
  ];
  assert.equal(findTopmostAnnotationAtPoint(annotations, { x: 50, y: 50 }), 1);
  assert.equal(findTopmostAnnotationAtPoint(annotations, { x: 300, y: 300 }), -1);
});

test("translateAnnotation moves freehand points and arrow endpoints", () => {
  const pen = {
    type: "pen",
    points: [{ x: 1, y: 2 }, { x: 4, y: 8 }],
    strokeWidth: 3
  };
  const arrow = {
    type: "arrow",
    x1: 10,
    y1: 20,
    x2: 30,
    y2: 40,
    strokeWidth: 3
  };
  translateAnnotation(pen, 5, -2);
  translateAnnotation(arrow, -3, 7);
  assert.deepEqual(pen.points, [{ x: 6, y: 0 }, { x: 9, y: 6 }]);
  assert.deepEqual(arrow, {
    type: "arrow",
    x1: 7,
    y1: 27,
    x2: 27,
    y2: 47,
    strokeWidth: 3
  });
});
