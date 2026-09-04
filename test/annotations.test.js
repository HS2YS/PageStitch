import test from "node:test";
import assert from "node:assert/strict";
import {
  annotationBounds,
  drawAnnotations,
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

function recordingContext() {
  const calls = [];
  const context = {
    canvas: { width: 400, height: 400 },
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (x, y) => calls.push(["translate", x, y]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (x, y) => calls.push(["moveTo", x, y]),
    lineTo: (x, y) => calls.push(["lineTo", x, y]),
    closePath: () => calls.push(["closePath"]),
    stroke: () => calls.push(["stroke"]),
    fill: () => calls.push(["fill"])
  };
  return { context, calls };
}

// Splits the recorded calls into the stroked shaft path and the filled head path.
function arrowPaths(calls) {
  const paths = [];
  let current = null;
  for (const [name, x, y] of calls) {
    if (name === "beginPath") current = { points: [], kind: null };
    else if (name === "moveTo" || name === "lineTo") current?.points.push({ x, y });
    else if (name === "stroke" || name === "fill") {
      current.kind = name;
      paths.push(current);
      current = null;
    }
  }
  return {
    shaft: paths.find((path) => path.kind === "stroke"),
    head: paths.find((path) => path.kind === "fill")
  };
}

test("drawArrow points the head exactly at the arrow tip", () => {
  const { context, calls } = recordingContext();
  drawAnnotations(context, [
    { type: "arrow", x1: 20, y1: 20, x2: 200, y2: 20, strokeWidth: 4 }
  ], { viewport: { x: 0, y: 0, width: 400, height: 400 } });

  const { shaft, head } = arrowPaths(calls);
  assert.deepEqual(head.points[0], { x: 200, y: 20 });
  assert.equal(head.points.length, 3);
  // The head is a triangle straddling the shaft axis.
  assert.equal(head.points[1].x, head.points[2].x);
  assert.ok(head.points[1].y > 20 && head.points[2].y < 20);
  // The shaft stops short of the tip so its round cap stays under the fill.
  assert.ok(shaft.points.at(-1).x < 200);
  assert.deepEqual(shaft.points[0], { x: 20, y: 20 });
});

test("drawArrow keeps the head wider than the shaft at every stroke width", () => {
  for (const strokeWidth of [2, 4, 12, 24]) {
    const { context, calls } = recordingContext();
    drawAnnotations(context, [
      { type: "arrow", x1: 10, y1: 10, x2: 300, y2: 10, strokeWidth }
    ], { viewport: { x: 0, y: 0, width: 400, height: 400 } });

    const { shaft, head } = arrowPaths(calls);
    const headWidth = Math.abs(head.points[1].y - head.points[2].y);
    assert.ok(
      headWidth > strokeWidth * 2,
      `stroke ${strokeWidth}: head width ${headWidth} does not clear the shaft`
    );
    // Nothing may protrude past the tip: the gap left by the shaft has to be
    // deeper than the round cap's radius.
    const gap = 300 - shaft.points.at(-1).x;
    assert.ok(
      gap > strokeWidth / 2,
      `stroke ${strokeWidth}: shaft gap ${gap} is shorter than the cap radius`
    );
  }
});

test("drawArrow skips degenerate arrows", () => {
  const { context, calls } = recordingContext();
  drawAnnotations(context, [
    { type: "arrow", x1: 50, y1: 50, x2: 50, y2: 50, strokeWidth: 4 }
  ], { viewport: { x: 0, y: 0, width: 400, height: 400 } });
  assert.equal(calls.length, 0);
});

test("annotationBounds covers the arrowhead at wide stroke widths", () => {
  const bounds = annotationBounds({
    type: "arrow",
    x1: 100,
    y1: 100,
    x2: 200,
    y2: 100,
    strokeWidth: 24
  });
  // Head half-width at stroke 24 is 0.5 * (24 * 3.2) = 38.4 px either side.
  assert.ok(bounds.y < 100 - 38.4);
  assert.ok(bounds.y + bounds.height > 100 + 38.4);
});
