import test from "node:test";
import assert from "node:assert/strict";
import { chooseLowEnergyRow } from "../shared/pagination.js";

test("chooseLowEnergyRow prefers a nearby whitespace valley", () => {
  const energies = new Array(100).fill(30);
  energies[82] = 1;
  energies[83] = 0.5;
  energies[84] = 1;
  energies[96] = 18;
  const result = chooseLowEnergyRow(energies, {
    minimumRow: 70,
    maximumRow: 98,
    targetRow: 96
  });
  assert.equal(result, 83);
});

test("chooseLowEnergyRow stays near the target on a uniform band", () => {
  const energies = new Array(50).fill(5);
  const result = chooseLowEnergyRow(energies, {
    minimumRow: 10,
    maximumRow: 45,
    targetRow: 44
  });
  assert.equal(result, 44);
});
