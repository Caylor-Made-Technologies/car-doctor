// Saved-data versions. v1 is the format every release up to 2026-11 wrote (no version key).
// v2 adds a version key, a one-time backup of the v1 values, and tidies records so every list
// entry is an object with a string id. Nothing is ever dropped: a value that can't be read is
// kept in the backup untouched. Runs before app.js reads anything.
(function (root) {
  "use strict";
  const SCHEMA = 2;
  const SCHEMA_KEY = "cardoctor.schema";
  const BACKUP_KEY = "cardoctor.backup.v1";
  const KEYS = ["cardoctor.profile", "cardoctor.log", "cardoctor.training", "cardoctor.theme", "cardoctor.reminders",
    "cardoctor.lastGuess", "cardoctor.installHint", "cardoctor.state"];

  const parse = (raw) => { try { return JSON.parse(raw); } catch (e) { return undefined; } };
  let n = 0;
  const newId = (prefix) => `${prefix}-${Date.now()}-${(n++).toString(36)}`;
  const digits = (v) => (v == null ? "" : String(v).replace(/[^\d]/g, "").slice(0, 7));

  /** v1 -> v2 on plain values (pure, testable). Returns the new raw strings to write. */
  function v1to2(raw) {
    const out = {};
    const list = (key, prefix, fix) => {
      if (raw[key] == null) return;
      const v = parse(raw[key]);
      if (!Array.isArray(v)) return; // unreadable: leave the original in place (also in the backup)
      out[key] = JSON.stringify(v.filter((x) => x && typeof x === "object" && !Array.isArray(x))
        .map((x) => fix({ ...x, id: typeof x.id === "string" && x.id ? x.id : newId(prefix) })));
    };
    list("cardoctor.log", "log", (x) => ({ ...x, mileage: digits(x.mileage), note: String(x.note ?? "") }));
    list("cardoctor.reminders", "rem", (x) => ({ ...x, mileage: digits(x.mileage) }));
    list("cardoctor.training", "ex", (x) => ({ ...x, label: String(x.label ?? ""), text: String(x.text ?? "") }));
    if (raw["cardoctor.profile"] != null) {
      const p = parse(raw["cardoctor.profile"]);
      if (p && typeof p === "object" && !Array.isArray(p)) out["cardoctor.profile"] = JSON.stringify({ ...p, mileage: digits(p.mileage) });
    }
    // theme stays a bare word ("dark" / "light"): theme.js reads it before anything else loads.
    return out;
  }

  /** Bring a Storage-like object up to SCHEMA. Never throws. Returns what happened, for tests. */
  function migrate(store) {
    try {
      const have = Number(store.getItem(SCHEMA_KEY)) || 1;
      if (have >= SCHEMA) return { from: have, to: have, changed: [] };
      const raw = {};
      for (const k of KEYS) { const v = store.getItem(k); if (v != null) raw[k] = v; }
      if (Object.keys(raw).length && store.getItem(BACKUP_KEY) == null) store.setItem(BACKUP_KEY, JSON.stringify(raw));
      const next = v1to2(raw);
      for (const [k, v] of Object.entries(next)) store.setItem(k, v);
      store.setItem(SCHEMA_KEY, String(SCHEMA));
      return { from: have, to: SCHEMA, changed: Object.keys(next) };
    } catch (e) {
      return { from: 0, to: 0, changed: [], error: String(e) }; // storage blocked: app runs on defaults
    }
  }

  const api = { SCHEMA, SCHEMA_KEY, BACKUP_KEY, KEYS, v1to2, migrate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.CarDoctorStorage = api; try { api.migrate(root.localStorage); } catch (e) { /* blocked */ } }
})(typeof self !== "undefined" ? self : this);
