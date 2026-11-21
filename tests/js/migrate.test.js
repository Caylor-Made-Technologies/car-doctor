// Saved-data upgrade v1 -> v2, tested on a fixture captured from the real v1 app
// (tests/fixtures/v1-localstorage.json: state sheet, a diagnosis, vehicle, log, reminder, training, theme).
const test = require("node:test");
const assert = require("node:assert/strict");
const { migrate, SCHEMA, SCHEMA_KEY, BACKUP_KEY } = require("../../app/migrate.js");
const fixture = require("../fixtures/v1-localstorage.json");

class MemStore {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const J = (s, k) => JSON.parse(s.getItem(k));

test("v1 fixture upgrades to v2 with nothing lost", () => {
  const s = new MemStore(fixture);
  const r = migrate(s);
  assert.equal(r.from, 1); assert.equal(r.to, SCHEMA);
  assert.equal(s.getItem(SCHEMA_KEY), String(SCHEMA));
  // A byte-for-byte backup of every v1 value.
  assert.deepEqual(J(s, BACKUP_KEY), fixture);
  // Records keep every field and id.
  const v1log = JSON.parse(fixture["cardoctor.log"]);
  assert.deepEqual(J(s, "cardoctor.log"), v1log);
  assert.deepEqual(J(s, "cardoctor.reminders"), JSON.parse(fixture["cardoctor.reminders"]));
  assert.deepEqual(J(s, "cardoctor.profile"), JSON.parse(fixture["cardoctor.profile"]));
  const tr = J(s, "cardoctor.training");
  assert.equal(tr.length, 1); assert.equal(tr[0].label, "worn_brake_pads"); assert.ok(tr[0].id);
  // Untouched keys stay exactly as they were (theme.js reads the bare word).
  for (const k of ["cardoctor.theme", "cardoctor.state", "cardoctor.lastGuess"]) assert.equal(s.getItem(k), fixture[k]);
});

test("running it again changes nothing", () => {
  const s = new MemStore(fixture);
  migrate(s);
  const snap = new Map(s.m);
  assert.deepEqual(migrate(s).changed, []);
  assert.deepEqual(s.m, snap);
});

test("damaged and odd v1 data never throws and is never dropped from the backup", () => {
  const bad = { "cardoctor.log": "{not json", "cardoctor.reminders": JSON.stringify([null, 5, "x", { title: "Oil", mileage: "190,000 mi" }]), "cardoctor.profile": "[]" };
  const s = new MemStore(bad);
  const r = migrate(s);
  assert.equal(r.to, SCHEMA);
  assert.equal(s.getItem("cardoctor.log"), "{not json"); // unreadable: left alone
  const rem = J(s, "cardoctor.reminders");
  assert.equal(rem.length, 1); assert.equal(rem[0].mileage, "190000"); assert.ok(rem[0].id);
  assert.deepEqual(J(s, BACKUP_KEY), bad);
});

test("a fresh install just gets the version key", () => {
  const s = new MemStore();
  migrate(s);
  assert.equal(s.getItem(SCHEMA_KEY), String(SCHEMA));
  assert.equal(s.getItem(BACKUP_KEY), null);
});

test("blocked storage does not throw", () => {
  const s = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } };
  assert.doesNotThrow(() => migrate(s));
});
