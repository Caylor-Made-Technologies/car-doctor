"use strict";
/*
 * Car Doctor - browser app.
 *
 * Sections:
 *   1. Text cleaning (copied from model/train.py)
 *   2. Prediction (the Naive Bayes math)
 *   3. Storage (localStorage helpers)
 *   4. App UI (chat, codes, vehicle and log tabs)
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
  theme: "cardoctor.theme",
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

function forget(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    /* nothing to do */
  }
}

// ===========================================================================
// 4. App UI
// ===========================================================================

let CAUSES = {};
let CODES = {};

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

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

// An icon from the <svg> sprite in index.html (decorative only).
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}

// Today's date as YYYY-MM-DD in the phone's own time zone (not UTC).
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, REDUCED_MOTION.matches ? 0 : ms));

// Severity in plain words: what the driver should do.
const SEVERITY = {
  low: { cls: "safe", text: "Safe to drive" },
  medium: { cls: "soon", text: "Get checked soon" },
  high: { cls: "soon", text: "Get checked soon" },
  critical: { cls: "stop", text: "Stop driving" },
};
const DIY = { Easy: "Easy DIY fix", Medium: "Medium DIY", Hard: "Hard DIY", Shop: "Shop job" };

function severityBadge(severity) {
  const s = SEVERITY[severity] || SEVERITY.medium;
  return el("span", { class: "sev " + s.cls }, s.text);
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("themeToggle");
  const next = theme === "dark" ? "light" : "dark";
  btn.setAttribute("aria-label", `Switch to ${next} mode`);
  btn.replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#0b0d12" : "#f3f4f7");
}

// ---------- Tabs ----------
const TAB_ORDER = ["chat", "codes", "vehicle", "log"];
let currentTab = "chat";

function showTab(name, { focus = false } = {}) {
  const from = TAB_ORDER.indexOf(currentTab);
  const to = TAB_ORDER.indexOf(name);
  for (const btn of document.querySelectorAll(".tabbar button")) {
    const active = btn.dataset.tab === name;
    btn.setAttribute("aria-selected", String(active));
    btn.tabIndex = active ? 0 : -1;
    const panel = document.getElementById("tab-" + btn.dataset.tab);
    panel.hidden = !active;
    panel.classList.remove("enter-left", "enter-right");
    if (active && from !== to) {
      void panel.offsetWidth; // restart the slide animation
      panel.classList.add(to > from ? "enter-right" : "enter-left");
    }
  }
  currentTab = name;
  document.getElementById("composer").hidden = name !== "chat";
  const main = document.getElementById("main");
  main.scrollTop = 0;
  if (name === "chat") scrollChat();
  if (focus) document.getElementById("tabbtn-" + name).focus();
}

// ---------- Chat ----------
const STARTERS = [
  "Grinding noise",
  "Check engine light",
  "Won't start",
  "Shakes at highway speed",
  "Squeal when I start it",
  "Running hot",
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

const session = { messages: [], resultNode: null, done: false, busy: false };

function sessionText() {
  return session.messages.join(" ");
}

// Scrolls to the newest message, or to the top of `node` (used for result
// cards so the diagnosis title is what you see first).
function scrollChat(node) {
  const main = document.getElementById("main");
  requestAnimationFrame(() => {
    const top = node
      ? main.scrollTop + node.getBoundingClientRect().top - main.getBoundingClientRect().top - 12
      : main.scrollHeight;
    main.scrollTo({ top, behavior: REDUCED_MOTION.matches ? "auto" : "smooth" });
  });
}

function addMsg(who, ...children) {
  const node = el("div", { class: "msg " + who }, ...children);
  document.getElementById("chat").append(node);
  scrollChat(who === "result" ? node : null);
  return node;
}

function chipRow(labels, onPick) {
  return el("div", { class: "chips" },
    ...labels.map((label) => el("button", { class: "chip", type: "button", onclick: () => onPick(label) }, label)));
}

function vehicleName() {
  const p = load(KEYS.profile, {});
  return [p.year, p.make, p.model].filter(Boolean).join(" ");
}

function welcome() {
  document.getElementById("chat").replaceChildren();
  session.messages = [];
  session.resultNode = null;
  session.done = false;
  const name = vehicleName();
  const hello = addMsg("bot",
    el("p", { class: "lead" }, name ? `What's going on with your ${name}?` : "What's going on with your vehicle?"),
    el("p", {}, "Tell me what you hear, feel or smell, and when it happens. You can also type a trouble code like P0300."),
    chipRow(STARTERS, sendMessage),
    el("p", { class: "fineprint" }, "Guidance only, not a professional diagnosis. If it feels unsafe, don't drive it."));
  scrollChat(hello); // start at the top of the greeting, not the bottom
}

// Shows the "thinking" dots, then removes them.
async function thinking(ms) {
  const dots = addMsg("bot", el("span", { class: "sr-only" }, "Thinking…"));
  dots.classList.add("typing");
  dots.append(el("span", { "aria-hidden": "true" }), el("span", { "aria-hidden": "true" }), el("span", { "aria-hidden": "true" }));
  await wait(ms);
  dots.remove();
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || !MODEL || session.busy) return;
  session.busy = true;
  addMsg("user", text);
  session.messages.push(text);

  await thinking(650);

  // Explain any codes in this message.
  const newCodes = findCodes(text);
  if (newCodes.length) {
    addMsg("bot", ...newCodes.map((code) => {
      const info = CODES[code];
      return el("p", { class: "code-chip" }, el("strong", {}, code), info ? info.title : decodeCode(code));
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
    addMsg("bot", el("p", {}, "I didn't catch any symptoms there. What do you hear, feel or smell, and when does it happen?"),
      el("p", { class: "fineprint" }, "For example: \"squeal when I start it on cold mornings\"."));
    session.busy = false;
    return;
  }
  showResults(predict(sessionText(), boosts));
  session.busy = false;
}

function gauge(prob) {
  const pct = Math.round(prob * 100);
  const fill = el("span", { class: "gauge-fill" });
  // Animate from 0 to the value (CSSOM style is allowed by the CSP).
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.max(2, pct) + "%"; }));
  return el("div", { class: "gauge" },
    el("div", { class: "gauge-track", role: "img", "aria-label": `${pct}% match` }, fill),
    el("span", { class: "gauge-num", "aria-hidden": "true" }, pct + "%"));
}

function lookupCause(label) {
  return CAUSES[label] || { name: label, severity: "medium", diy: "Shop", summary: "", checks: [] };
}

function showResults(result) {
  // Older result cards stay in the chat but lose their buttons.
  if (session.resultNode) {
    const old = session.resultNode.querySelector(".actions");
    if (old) old.remove();
  }

  const top = result.ranked.filter((g, i) => i === 0 || g.prob >= 0.05).slice(0, 3);
  const best = top[0];
  const cause = lookupCause(best.label);
  const card = el("article", { class: "result-card", "aria-label": "Diagnosis: " + cause.name });

  if (cause.severity === "critical") {
    card.append(el("div", { class: "stop-banner", role: "alert" }, "⚠️ Don't drive until it's checked."));
  }

  const [firstCheck, ...otherChecks] = cause.checks;
  card.append(el("div", { class: "result-main" },
    el("p", { class: "eyebrow" }, "Most likely"),
    el("h2", { class: "result-title" }, cause.name),
    el("div", { class: "badges" }, severityBadge(cause.severity), el("span", { class: "pill" }, DIY[cause.diy] || cause.diy)),
    gauge(best.prob),
    el("p", { class: "summary" }, cause.summary),
    firstCheck ? el("div", { class: "next-step" }, el("p", { class: "eyebrow" }, "Next step"), el("span", {}, firstCheck)) : null,
    otherChecks.length ? el("details", { class: "more-checks" },
      el("summary", { class: "hint" }, `${otherChecks.length} more checks`),
      el("ol", { class: "checks", start: "2" }, ...otherChecks.map((c) => el("li", {}, c)))) : null));

  // Other possibilities, collapsed.
  for (const g of top.slice(1)) {
    const c = lookupCause(g.label);
    card.append(el("details", { class: "alt" },
      el("summary", {},
        el("span", { class: "alt-head" }, el("span", {}, c.name), icon("chevron")),
        gauge(g.prob)),
      el("div", { class: "alt-body" },
        el("div", { class: "badges" }, severityBadge(c.severity), el("span", { class: "pill" }, DIY[c.diy] || c.diy)),
        el("p", {}, c.summary),
        el("ol", { class: "checks" }, ...c.checks.map((x) => el("li", {}, x))))));
  }

  // Unsure? Ask for more detail with chips the user hasn't already covered.
  if (best.prob < 0.6) {
    const said = new Set(tokenize(sessionText()));
    const missing = DETAILS.filter((d) => !d.keys.some((k) => said.has(k))).map((d) => d.text);
    card.append(el("div", { class: "followup" },
      el("p", {}, "Not sure yet. When does it happen?"),
      missing.length ? chipRow(missing, sendMessage) : null));
  }

  card.append(el("div", { class: "actions" },
    el("button", { class: "btn primary", type: "button", onclick: () => confirmCause(best.label, card) }, "✔ That was it"),
    el("button", { class: "btn", type: "button", onclick: () => pickOther(card) }, "✖ Something else"),
    el("button", { class: "btn wide", type: "button", onclick: welcome }, "New problem")));

  addMsg("result", card);
  session.resultNode = card;
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
  addLogEntry({ date: localDate(), mileage: profile.mileage || "", note: `${lookupCause(label).name}: ${sessionText()}` });
  card.querySelector(".actions").remove();
  addMsg("bot", el("p", {}, "Saved to your repair log and training examples. Thanks, that helps the model learn."),
    chipRow(["New problem", "Open my log"], (pick) => (pick === "New problem" ? welcome() : showTab("log"))));
}

function pickOther(card) {
  const actions = card.querySelector(".actions");
  const select = el("select", { class: "input wide", "aria-label": "What was it?" },
    el("option", { value: "" }, "What was it?"),
    ...Object.entries(CAUSES)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([key, c]) => el("option", { value: key }, c.name)));
  const saveBtn = el("button", { class: "btn primary", type: "button", onclick: () => {
    if (!select.value) { select.focus(); return; }
    addTraining(select.value);
    session.done = true;
    actions.remove();
    addMsg("bot", el("p", {}, `Got it: ${CAUSES[select.value].name}. Saved as a training example.`),
      chipRow(["New problem"], welcome));
  } }, "Save");
  actions.replaceChildren(select, saveBtn, el("button", { class: "btn", type: "button", onclick: welcome }, "New problem"));
  select.focus();
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
const POPULAR_CODES = ["P0300", "P0171", "P0420", "P0128", "P0442", "P0700"];

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

// "p 0300" -> "P0300": uppercase, letters and digits only, 5 max.
function formatCode(raw) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function codesEmptyState() {
  return el("div", { class: "empty" },
    icon("code"),
    el("strong", {}, "Look up a check engine code"),
    el("p", {}, "Plug in a scanner (most parts stores scan free), then type the code above. Common ones:"),
    chipRow(POPULAR_CODES, (code) => {
      const input = document.getElementById("codeInput");
      input.value = code;
      lookupCode(code);
    }));
}

function lookupCode(raw) {
  const out = document.getElementById("codeResult");
  const code = formatCode(raw);
  if (!code) {
    out.replaceChildren(codesEmptyState());
    return;
  }
  if (!/^[PBCU][0-9][0-9A-F]{3}$/.test(code)) {
    out.replaceChildren(el("p", { class: "hint" }, code.length < 5
      ? `Keep typing… (${code.length}/5)`
      : "That doesn't look like a code. Codes start with P, B, C or U, then 4 characters (e.g. P0300)."));
    return;
  }
  const info = CODES[code];
  const card = el("article", { class: "card code-card", "aria-label": "Code " + code },
    el("p", { class: "code-big" }, code));
  if (info) {
    const cause = lookupCause(info.related);
    card.append(
      el("h2", { class: "code-title" }, info.title),
      el("div", { class: "badges" }, severityBadge(cause.severity), el("span", { class: "pill" }, "Fix: " + (DIY[cause.diy] || cause.diy))),
      el("h3", {}, "Likely causes"),
      el("ol", { class: "checks" }, ...info.causes.map((c) => el("li", {}, c))),
      el("h3", {}, "Related problem"),
      el("p", {}, cause.name));
  } else {
    card.append(el("h2", { class: "code-title" }, "Unknown code"), el("p", {}, decodeCode(code)));
  }
  card.append(el("div", { class: "btn-row" },
    el("button", { class: "btn primary", type: "button", onclick: () => {
      showTab("chat");
      if (session.done) welcome(); // last problem was already answered
      sendMessage("code " + code);
    } }, "Diagnose with this code")));
  out.replaceChildren(card);
}

// ---------- Vehicle ----------
function renderProfile() {
  const p = load(KEYS.profile, {});
  const form = document.getElementById("profileForm");
  for (const name of ["year", "make", "model", "engine", "mileage"]) form.elements[name].value = p[name] || "";
  const title = [p.year, p.make, p.model].filter(Boolean).join(" ");
  const sub = [p.engine, p.mileage ? Number(p.mileage).toLocaleString() + " mi" : ""].filter(Boolean).join(" · ");
  const card = document.getElementById("vehicleCard");
  const empty = !title && !sub;
  card.classList.toggle("is-empty", empty);
  document.getElementById("vehicleTitle").textContent = empty ? "Add your vehicle" : title || "My vehicle";
  document.getElementById("vehicleSub").textContent = empty ? "For answers that fit your truck or car" : sub || "Tap to add engine and mileage";
  card.setAttribute("aria-label", empty ? "Add your vehicle" : `Vehicle: ${title} ${sub}. Edit vehicle`);
}

// ---------- Log ----------
function addLogEntry(entry) {
  const log = load(KEYS.log, []);
  log.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), ...entry });
  save(KEYS.log, log);
  renderLog();
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderLog() {
  // Newest first: by date, then by when it was added.
  const log = load(KEYS.log, []).slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const list = document.getElementById("logList");
  if (!log.length) {
    list.replaceChildren(el("li", { class: "empty" },
      icon("log"),
      el("strong", {}, "No repairs logged yet"),
      el("p", {}, "Add oil changes and fixes above, or tap \"That was it\" after a diagnosis to log it automatically.")));
    return;
  }
  list.replaceChildren(...log.map((entry) => el("li", { class: "log-item" },
    el("div", { class: "log-body" },
      el("div", { class: "log-meta" }, prettyDate(entry.date) + (entry.mileage ? " · " + Number(entry.mileage).toLocaleString() + " mi" : "")),
      el("p", { class: "log-note" }, entry.note)),
    el("button", { class: "icon-btn bare", type: "button", "aria-label": "Delete entry from " + prettyDate(entry.date), onclick: () => {
      if (!confirm("Delete this repair log entry?")) return;
      save(KEYS.log, load(KEYS.log, []).filter((e) => e.id !== entry.id));
      renderLog();
    } }, icon("trash")))));
}

// ---------- Teach the model ----------
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
  const tabs = [...document.querySelectorAll(".tabbar button")];
  for (const btn of tabs) {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
    // Arrow keys move between tabs (standard tab pattern for keyboards).
    btn.addEventListener("keydown", (e) => {
      const i = TAB_ORDER.indexOf(btn.dataset.tab);
      if (e.key === "ArrowRight") showTab(TAB_ORDER[(i + 1) % 4], { focus: true });
      if (e.key === "ArrowLeft") showTab(TAB_ORDER[(i + 3) % 4], { focus: true });
    });
  }

  document.getElementById("themeToggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEYS.theme, theme); } catch (err) { /* private mode */ }
    applyTheme(theme);
  });

  document.getElementById("vehicleCard").addEventListener("click", () => {
    showTab("vehicle");
    document.querySelector("#profileForm [name=year]").focus({ preventScroll: true });
  });

  const input = document.getElementById("msgInput");
  document.getElementById("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
    input.value = "";
  });

  const codeInput = document.getElementById("codeInput");
  codeInput.addEventListener("input", () => {
    const formatted = formatCode(codeInput.value);
    if (codeInput.value !== formatted) codeInput.value = formatted;
    lookupCode(formatted);
  });
  document.getElementById("codeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    lookupCode(codeInput.value);
    codeInput.blur(); // hide the keyboard so the answer is visible
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
    document.getElementById("logForm").elements.mileage.value = load(KEYS.profile, {}).mileage || "";
    const note = document.getElementById("profileSaved");
    note.textContent = "Saved ✓";
    setTimeout(() => { note.textContent = ""; }, 2500);
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
    if (!csv) { status.textContent = "Nothing to copy yet. Confirm a diagnosis in Chat first."; return; }
    status.textContent = (await copyText(csv)) ? "Copied! Paste at the end of data/symptoms.csv." : "Couldn't copy on this browser.";
  });
  document.getElementById("clearTraining").addEventListener("click", () => {
    if (!confirm("Delete all saved training examples?")) return;
    save(KEYS.training, []);
    renderTraining();
    status.textContent = "Cleared.";
  });

  document.getElementById("deleteAll").addEventListener("click", () => {
    if (!confirm("Delete your vehicle, repair log and training examples from this phone? This can't be undone.")) return;
    for (const key of Object.values(KEYS)) forget(key);
    applyTheme("dark");
    renderProfile();
    renderLog();
    renderTraining();
    welcome();
    status.textContent = "";
    alert("All Car Doctor data on this phone was deleted.");
  });
}

async function init() {
  applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  wireUp();
  renderProfile();
  renderLog();
  renderTraining();
  showTab("chat");

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
    lookupCode(document.getElementById("codeInput").value);
  } catch (err) {
    document.getElementById("chat").replaceChildren();
    addMsg("bot", el("p", {}, "Couldn't load the diagnosis model. Check your connection and reload once; after that it works offline."));
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
