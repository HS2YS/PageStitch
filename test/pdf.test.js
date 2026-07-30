import test from "node:test";
import assert from "node:assert/strict";
import { buildPdfFromJpegs } from "../shared/pdf.js";

test("buildPdfFromJpegs emits a valid object table and page count", () => {
  const pdf = buildPdfFromJpegs([
    { width: 2, height: 2, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    { width: 2, height: 3, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }
  ], {
    pageWidth: 595.28,
    pageHeight: 841.89
  });

  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/Subtype \/Image/);
  assert.ok(text.endsWith("%%EOF"));

  const declaredXref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(declaredXref, text.indexOf("xref\n"));
});
