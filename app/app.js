"use strict";
/*
 * Car Doctor - browser app.
 *
 * Sections:
 *   1. Text cleaning (copied from model/train.py)
 *   2. Prediction (the Naive Bayes math)
 *   3. Storage (localStorage helpers)
 *   4. App UI (chat, codes, vehicle tabs)
 *
 * tests/check.py loads everything ABOVE the "===== STORAGE =====" line in
 * Node to make sure the browser gives the same answers as Python. Keep
 * sections 1 and 2 free of any browser-only code (no window/document).
 */

// ===========================================================================
// 1. Text cleaning
// !!! KEEP IN SYNC: STOPWORDS, SYNONYM_GROUPS, stem() and tokenize() must
// match model/train.py exactly. tests/check.py fails if they drift apart.
// ===========================================================================

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "is", "it", "its", "it's", "this", "that", "my", "me", "i", "im",
  "we", "you", "your", "he", "she", "they", "them", "our", "was", "be",
  "been", "are", "am", "so", "just", "like", "kind", "sort", "really",
  "very", "some", "there", "has", "have", "had", "got", "get", "gets",
  "car", "truck", "vehicle", "pickup", "chevy", "silverado", "thing",
  "also", "then", "now", "pretty", "bit", "little", "kinda", "lot",
  "when", "from", "every", "time", "all", "up", "after", "while", "goes",
  "go", "going", "one", "does", "doesnt", "will",
]);

const SYNONYM_GROUPS = {
  shake: ["shake", "shakes", "shaking", "shaky", "vibrate", "vibrates",
    "vibrating", "vibration", "vibrations", "wobble", "wobbles",
    "wobbling", "shudder", "shudders", "shuddering", "shimmy",
    "shimmies", "jitter", "pulsate", "pulsates", "pulsing",
    "pulsating", "pulses", "pulse"],
  noise: ["noise", "noises", "noisy", "sound", "sounds"],
  squeal: ["squeal", "squeals", "squealing", "squeak", "squeaks",
    "squeaking", "squeaky", "screech", "screeches", "screeching",
    "chirp", "chirps", "chirping"],
  click: ["click", "clicks", "clicking", "clicked"],
  grind: ["grind", "grinds", "grinding"],
  hum: ["hum", "hums", "humming", "drone", "droning", "roar", "roars",
    "roaring", "growl", "growls", "growling"],
  whine: ["whine", "whines", "whining", "whir", "whirs", "whirring",
    "whirr"],
  tick: ["tick", "ticks", "ticking", "tap", "taps", "tapping", "ticky"],
  clunk: ["clunk", "clunks", "clunking", "thump", "thumps", "thumping",
    "thud", "thuds", "bang", "bangs", "banging", "clank", "clanks",
    "clanking", "clunky"],
  brake: ["brake", "brakes", "braking", "braked"],
  start: ["start", "starts", "starting", "started", "startup"],
  crank: ["crank", "cranks", "cranking", "cranked"],
  leak: ["leak", "leaks", "leaking", "leaked", "leaky", "puddle",
    "puddles", "drip", "drips", "dripping", "spot", "spots"],
  smell: ["smell", "smells", "smelling", "odor", "odors", "stink",
    "stinks"],
  stall: ["stall", "stalls", "stalling", "stalled", "die", "dies",
    "died", "dying"],
  hot: ["hot", "overheat", "overheats", "overheating", "overheated",
    "heats", "temp", "temperature"],
  highway: ["highway", "freeway", "interstate", "hwy"],
  turn: ["turn", "turns", "turning", "turned"],
  idle: ["idle", "idles", "idling", "idled"],
  misfire: ["misfire", "misfires", "misfiring", "miss", "misses",
    "missing", "skipping", "skips"],
  hesitate: ["hesitate", "hesitates", "hesitation", "hesitating", "bog",
    "bogs", "bogging", "stumble", "stumbles", "stumbling"],
};

// Flip the groups into one lookup table: variant -> canonical word.
const SYNONYMS = new Map();
for (const [canonical, variants] of Object.entries(SYNONYM_GROUPS)) {
  for (const variant of variants) SYNONYMS.set(variant, canonical);
}

// Very light stemming: chop common endings so "leaking" ~ "leak".
function stem(word) {
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// Sentence -> words plus word pairs ("grind", "brake", "grind_brake").
function tokenize(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const cleaned = [];
  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    cleaned.push(SYNONYMS.has(word) ? SYNONYMS.get(word) : stem(word));
  }
  const bigrams = [];
  for (let i = 0; i < cleaned.length - 1; i++) bigrams.push(cleaned[i] + "_" + cleaned[i + 1]);
  return cleaned.concat(bigrams);
}

// ===========================================================================
// 2. Prediction
// ===========================================================================

let MODEL = null; // filled from model.json

/*
 * Naive Bayes scoring, same math scikit-learn uses:
 *   score(problem) = log P(problem) + sum over words of count * log P(word | problem)
 * Then add any boosts (e.g. +3 for a matching trouble code) and turn the
 * scores into percentages with softmax.
 */
function predict(text, boosts = {}) {
  const counts = new Map();
  let recognized = 0;
  for (const token of tokenize(text)) {
    const index = MODEL.vocab[token];
    if (index === undefined) continue;
    counts.set(index, (counts.get(index) || 0) + 1);
    recognized++;
  }

  const scores = MODEL.classes.map((label, c) => {
    let score = MODEL.class_log_prior[c];
    const row = MODEL.feature_log_prob[c];
    for (const [index, count] of counts) score += count * row[index];
    return score + (boosts[label] || 0);
  });

  // Softmax: subtract the max first so Math.exp doesn't overflow.
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const total = exps.reduce((a, b) => a + b, 0);
  const ranked = MODEL.classes
    .map((label, c) => ({ label, prob: exps[c] / total }))
    .sort((a, b) => b.prob - a.prob);
  return { ranked, recognized };
}

// Finds trouble codes like P0300 in a message.
function findCodes(text) {
  return [...new Set(text.toUpperCase().match(/\b[PBCU][0-9][0-9A-F]{3}\b/g) || [])];
}

// ===== STORAGE =====
// Everything below here uses the browser. localStorage can throw in private
// mode or when full, so every read and write is wrapped in try/catch.

const KEYS = {
  profile: "cardoctor.profile",
  log: "cardoctor.log",
  training: "cardoctor.training",
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

// ===========================================================================
// 4. App UI
// ===========================================================================

let CAUSES = {};
let CODES = {};

// Tiny helper to build elements. Text always goes in as textContent, never
// as HTML, so nothing a user types can inject code.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

// Today's date as YYYY-MM-DD in the phone's own time zone (not UTC).
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- Tabs ----------
function showTab(name) {
  for (const btn of document.querySelectorAll(".tabbar button")) {
    const active = btn.dataset.tab === name;
    btn.setAttribute("aria-selected", String(active));
    document.getElementById("tab-" + btn.dataset.tab).hidden = !active;
  }
  document.getElementById("composer").hidden = name !== "diagnose";
  document.getElementById("main").scrollTop = 0;
  if (name === "diagnose") scrollChat();
}

// ---------- Diagnose (chat) ----------
const STARTERS = [
  "Clicks but won't start",
  "Grinding when I brake",
  "Shakes at highway speed",
  "Squeal when I start it",
  "Ticking when cold",
  "Temp gauge running hot",
];

// Follow-up chips. "keys" are tokens that mean the user already said it.
const DETAILS = [
  { text: "When braking", keys: ["brake"] },
  { text: "When turning", keys: ["turn"] },
  { text: "At highway speed", keys: ["highway", "mph"] },
  { text: "At idle", keys: ["idle"] },
  { text: "When starting", keys: ["start", "crank"] },
  { text: "Over bumps", keys: ["bump"] },
  { text: "When accelerating", keys: ["accelerat", "accelerate", "acceleration", "gas"] },
  { text: "Only when cold", keys: ["cold"] },
];

const session = { messages: [], resultNode: null, done: false };

function sessionText() {
  return session.messages.join(" ");
}

function scrollChat() {
  const main = document.getElementById("main");
  requestAnimationFrame(() => { main.scrollTop = main.scrollHeight; });
}

function addMsg(who, ...children) {
  const node = el("div", { class: "msg " + who }, ...children);
  document.getElementById("chat").append(node);
  scrollChat();
  return node;
}

function chipRow(labels, onPick) {
  return el("div", { class: "chips" },
    ...labels.map((label) => el("button", { class: "chip", type: "button", onclick: () => onPick(label) }, label)));
}

function welcome() {
  document.getElementById("chat").replaceChildren();
  session.messages = [];
  session.resultNode = null;
  session.done = false;
  addMsg("bot",
    el("p", {}, "Hi! Tell me what's going on. What do you hear, feel or smell, and when does it happen?"),
    el("p", { class: "muted small" }, "You can also type a trouble code like P0300."),
    chipRow(STARTERS, sendMessage),
    el("p", { class: "muted small" }, "Car Doctor gives guidance only, not a professional diagnosis. For brakes, steering, overheating or anything that feels unsafe, have a mechanic check it before driving."));
}

function sendMessage(text) {
  text = text.trim();
  if (!text || !MODEL) return;
  addMsg("user", text);
  session.messages.push(text);

  // Explain any codes in this message.
  const newCodes = findCodes(text);
  if (newCodes.length) {
    addMsg("bot", ...newCodes.map((code) => {
      const info = CODES[code];
      return el("p", { class: "code-line" }, el("strong", {}, code), " ",
        info ? info.title : decodeCode(code));
    }));
  }

  // Every code mentioned so far adds +3 to its related cause.
  const boosts = {};
  for (const code of findCodes(sessionText())) {
    const info = CODES[code];
    if (info && info.related) boosts[info.related] = (boosts[info.related] || 0) + 3;
  }

  // Check the new message on its own: earlier messages shouldn't hide that
  // the model understood nothing in this one.
  const understood = predict(text).recognized > 0 || newCodes.some((code) => CODES[code]);
  if (!understood) {
    session.messages.pop(); // don't keep text the model can't use
    addMsg("bot", el("p", {}, "I didn't catch any symptoms there. Can you describe what you hear, feel or smell, and when it happens? For example: \"squeal when I start it on cold mornings\"."));
    return;
  }
  showResults(predict(sessionText(), boosts));
}

function causeBlock(label, prob, expanded) {
  const cause = CAUSES[label] || { name: label, severity: "medium", diy: "?", summary: "", checks: [] };
  const pct = Math.round(prob * 100);
  const bar = el("span");
  bar.style.width = Math.max(2, pct) + "%"; // CSSOM, allowed by the CSP
  const head = el("div", {},
    el("div", { class: "guess-head" }, el("span", { class: "guess-name" }, cause.name), el("span", { class: "pct" }, pct + "%")),
    el("div", { class: "bar", "aria-hidden": "true" }, bar),
    el("div", { class: "tags" },
      el("span", { class: "tag " + cause.severity }, "Severity: " + cause.severity),
      el("span", { class: "tag" }, "DIY: " + cause.diy)));
  const body = el("div", {},
    el("p", {}, cause.summary),
    el("ol", { class: "checks" }, ...cause.checks.map((c) => el("li", {}, c))));

  if (expanded) return el("div", { class: "guess" }, head, body);
  return el("div", { class: "guess" }, head, el("details", {}, el("summary", {}, "What to check"), body));
}

function showResults(result) {
  // Older result cards stay in the chat but lose their buttons.
  if (session.resultNode) {
    const old = session.resultNode.querySelector(".actions");
    if (old) old.remove();
  }

  const top = result.ranked.filter((g, i) => i === 0 || g.prob >= 0.05).slice(0, 3);
  const best = top[0];
  const card = addMsg("bot wide");
  if (CAUSES[best.label] && CAUSES[best.label].severity === "critical") {
    card.append(el("div", { class: "banner", role: "alert" }, "⚠️ Don't drive until it's checked."));
  }
  card.append(el("p", {}, top.length > 1 ? "My best guesses:" : "My best guess:"));
  top.forEach((g, i) => card.append(causeBlock(g.label, g.prob, i === 0)));

  // Unsure? Ask for more detail with chips the user hasn't already covered.
  if (best.prob < 0.6) {
    const said = new Set(tokenize(sessionText()));
    const missing = DETAILS.filter((d) => !d.keys.some((k) => said.has(k))).map((d) => d.text);
    card.append(el("p", {}, "I'm not sure yet. When does it happen? Add any detail that fits."));
    if (missing.length) card.append(chipRow(missing, sendMessage));
  }

  const actions = el("div", { class: "actions" },
    el("button", { class: "btn primary", type: "button", onclick: () => confirmCause(best.label, card) }, "✔ That was it"),
    el("button", { class: "btn", type: "button", onclick: () => pickOther(card) }, "✖ Something else"),
    el("button", { class: "btn", type: "button", onclick: welcome }, "New problem"));
  card.append(actions);
  session.resultNode = card;
  scrollChat();
}

function addTraining(label) {
  const list = load(KEYS.training, []);
  list.push({ label, text: sessionText() });
  save(KEYS.training, list);
  renderTraining();
}

function confirmCause(label, card) {
  addTraining(label);
  session.done = true;
  const profile = load(KEYS.profile, {});
  addLogEntry({ date: localDate(), mileage: profile.mileage || "", note: `${CAUSES[label].name}: ${sessionText()}` });
  card.querySelector(".actions").remove();
  addMsg("bot", el("p", {}, "Saved to your repair log and to the training examples. Thanks, that helps the model learn."),
    chipRow(["New problem"], welcome));
}

function pickOther(card) {
  const actions = card.querySelector(".actions");
  const select = el("select", { class: "input", "aria-label": "What was it?" },
    el("option", { value: "" }, "What was it?"),
    ...Object.entries(CAUSES)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([key, c]) => el("option", { value: key }, c.name)));
  const saveBtn = el("button", { class: "btn primary", type: "button", onclick: () => {
    if (!select.value) return;
    addTraining(select.value);
    session.done = true;
    actions.remove();
    addMsg("bot", el("p", {}, `Got it: ${CAUSES[select.value].name}. Saved as a training example.`),
      chipRow(["New problem"], welcome));
  } }, "Save");
  actions.replaceChildren(select, saveBtn, el("button", { class: "btn", type: "button", onclick: welcome }, "New problem"));
}

// ---------- Codes tab ----------
const SYSTEMS = { P: "Powertrain (engine and transmission)", B: "Body (airbags, locks, seats)", C: "Chassis (brakes, ABS, steering, suspension)", U: "Network (computer communication)" };
const P_SUBSYSTEMS = {
  0: "Fuel and air metering, emissions",
  1: "Fuel and air metering",
  2: "Fuel and air metering (injector circuits)",
  3: "Ignition system or misfire",
  4: "Auxiliary emission controls (EGR, EVAP, catalyst)",
  5: "Vehicle speed, idle control and inputs",
  6: "Computer and output circuits",
  7: "Transmission",
  8: "Transmission",
  9: "Transmission",
  A: "Hybrid propulsion",
  B: "Hybrid propulsion",
  C: "Hybrid propulsion",
};

// For codes not in codes.json: explain what the code's letters and digits mean.
function decodeCode(code) {
  const parts = [SYSTEMS[code[0]]];
  // Second character: P0/P2 and B0/C0/U0/B3/C3/U3 are generic (SAE), 1 is
  // the manufacturer's own, P3 is shared, B2/C2/U2 are manufacturer.
  const kind = code[1];
  const generic = code[0] === "P" ? ["0", "2"] : ["0", "3"];
  if (generic.includes(kind)) parts.push("generic code (same meaning on all makes)");
  else if (code[0] === "P" && kind === "3") parts.push("mixed generic/manufacturer code");
  else parts.push("manufacturer-specific code (look up for your make)");
  if (code[0] === "P" && P_SUBSYSTEMS[code[2]]) parts.push(P_SUBSYSTEMS[code[2]]);
  return "Not in my list. " + parts.join(" · ");
}

function lookupCode(raw) {
  const out = document.getElementById("codeResult");
  const code = raw.trim().toUpperCase();
  if (!/^[PBCU][0-9][0-9A-F]{3}$/.test(code)) {
    out.replaceChildren(el("p", { class: "card" }, "Codes look like a letter (P, B, C or U) and 4 characters, e.g. P0300."));
    return;
  }
  const info = CODES[code];
  const card = el("div", { class: "card" }, el("h3", {}, code));
  if (info) {
    card.append(el("p", {}, el("strong", {}, info.title)),
      el("p", { class: "muted small" }, "Common causes:"),
      el("ul", { class: "checks" }, ...info.causes.map((c) => el("li", {}, c))));
    if (CAUSES[info.related]) card.append(el("p", { class: "muted small" }, "Related problem: " + CAUSES[info.related].name));
  } else {
    card.append(el("p", {}, decodeCode(code)));
  }
  card.append(el("div", { class: "actions" },
    el("button", { class: "btn primary", type: "button", onclick: () => {
      showTab("diagnose");
      if (session.done) welcome(); // last problem was already answered
      sendMessage("code " + code);
    } }, "Diagnose with this code")));
  out.replaceChildren(card);
}

// ---------- My Vehicle tab ----------
function renderProfile() {
  const p = load(KEYS.profile, {});
  const form = document.getElementById("profileForm");
  for (const name of ["year", "make", "model", "engine", "mileage"]) form.elements[name].value = p[name] || "";
  const title = [p.year, p.make, p.model].filter(Boolean).join(" ");
  const extra = [p.engine, p.mileage ? Number(p.mileage).toLocaleString() + " mi" : ""].filter(Boolean).join(" · ");
  document.getElementById("vehicleLine").textContent =
    title || extra ? [title, extra].filter(Boolean).join(" · ") : "Add your vehicle in My Vehicle";
}

function addLogEntry(entry) {
  const log = load(KEYS.log, []);
  log.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), ...entry });
  save(KEYS.log, log);
  renderLog();
}

function renderLog() {
  // Newest first: by date, then by when it was added.
  const log = load(KEYS.log, []).slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const list = document.getElementById("logList");
  if (!log.length) {
    list.replaceChildren(el("li", { class: "muted small" }, "No repairs logged yet."));
    return;
  }
  list.replaceChildren(...log.map((entry) => el("li", { class: "log-item" },
    el("div", {},
      el("div", { class: "meta" }, entry.date + (entry.mileage ? " · " + Number(entry.mileage).toLocaleString() + " mi" : "")),
      el("p", {}, entry.note)),
    el("button", { class: "btn small-btn", type: "button", "aria-label": "Delete entry from " + entry.date, onclick: () => {
      if (!confirm("Delete this repair log entry?")) return;
      save(KEYS.log, load(KEYS.log, []).filter((e) => e.id !== entry.id));
      renderLog();
    } }, "Delete"))));
}

function trainingCsv() {
  return load(KEYS.training, [])
    .map((t) => `${t.label},${t.text.replace(/[,\r\n"]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()}`)
    .join("\n");
}

function renderTraining() {
  document.getElementById("trainCount").textContent = load(KEYS.training, []).length;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Older browsers: copy through a hidden textarea.
    const area = el("textarea", { class: "sr-only", readonly: "" });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }
}

// ---------- Start up ----------
function wireUp() {
  for (const btn of document.querySelectorAll(".tabbar button")) {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  }

  const input = document.getElementById("msgInput");
  document.getElementById("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
    input.value = "";
  });

  document.getElementById("codeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    lookupCode(document.getElementById("codeInput").value);
  });

  document.getElementById("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    save(KEYS.profile, {
      year: f.year.value.trim(),
      make: f.make.value.trim(),
      model: f.model.value.trim(),
      engine: f.engine.value.trim(),
      mileage: f.mileage.value.replace(/\D/g, ""),
    });
    renderProfile();
    const note = document.getElementById("profileSaved");
    note.hidden = false;
    setTimeout(() => { note.hidden = true; }, 2000);
  });

  const logForm = document.getElementById("logForm");
  logForm.elements.date.value = localDate();
  logForm.elements.mileage.value = load(KEYS.profile, {}).mileage || "";
  logForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = logForm.elements;
    const note = f.note.value.trim();
    if (!note) return;
    addLogEntry({ date: f.date.value || localDate(), mileage: f.mileage.value.replace(/\D/g, ""), note });
    f.note.value = "";
  });

  const status = document.getElementById("copyStatus");
  document.getElementById("copyTraining").addEventListener("click", async () => {
    const csv = trainingCsv();
    status.hidden = false;
    if (!csv) { status.textContent = "Nothing to copy yet."; return; }
    status.textContent = (await copyText(csv)) ? "Copied! Paste at the end of data/symptoms.csv." : "Couldn't copy on this browser.";
  });
  document.getElementById("clearTraining").addEventListener("click", () => {
    if (!confirm("Delete all saved training examples?")) return;
    save(KEYS.training, []);
    renderTraining();
  });
}

async function init() {
  wireUp();
  renderProfile();
  renderLog();
  renderTraining();
  showTab("diagnose");

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true;
  try {
    const [model, causes, codes] = await Promise.all(
      ["model.json", "causes.json", "codes.json"].map((f) => fetch(f).then((r) => {
        if (!r.ok) throw new Error(f + " " + r.status);
        return r.json();
      })));
    MODEL = model;
    CAUSES = causes;
    CODES = codes;
    sendBtn.disabled = false;
    welcome();
  } catch (err) {
    addMsg("bot", el("p", {}, "Couldn't load the diagnosis model. Check your connection and reload once; after that it works offline."));
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
