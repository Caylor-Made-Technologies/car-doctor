// The diagnosis -> part lookup must cover every problem the model can answer, and fall back safely.
const test = require("node:test");
const assert = require("node:assert/strict");
const { PARTS, DIAGNOSIS_PART, partFor } = require("../../app/parts.js");
const model = require("../../app/model.json");
const causes = require("../../app/causes.json");

test("every model class has a part (or an explicit unknown)", () => {
  for (const label of model.classes) assert.ok(Object.hasOwn(DIAGNOSIS_PART, label), `no part for ${label}`);
  for (const label of Object.keys(causes)) assert.ok(Object.hasOwn(DIAGNOSIS_PART, label), `no part for cause ${label}`);
});

test("every mapped part exists in the scene", () => {
  for (const [label, id] of Object.entries(DIAGNOSIS_PART)) assert.ok(id === "unknown" || Object.hasOwn(PARTS, id), `${label} -> missing part ${id}`);
});

test("unknown labels and odd input fall back to unknown", () => {
  for (const x of ["not_a_label", "", undefined, null, "__proto__", "constructor", "toString"]) assert.equal(partFor(x), "unknown");
  assert.equal(partFor("worn_brake_pads"), "brakes");
  assert.equal(partFor("dead_battery"), "battery");
});

test("parts are well formed and the scene stays low poly", () => {
  for (const [id, p] of Object.entries(PARTS)) {
    assert.equal(p.pos.length, 3, id); assert.equal(p.size.length, 3, id);
    assert.ok(p.size.every((n) => n > 0 && n < 2.5), id);
    assert.ok(p.label && p.where, id);
  }
  assert.ok(Object.keys(PARTS).length < 40, "keep draw calls well under 100");
});
