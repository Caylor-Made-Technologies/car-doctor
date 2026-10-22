"use strict";
/*
 * Car Doctor - browser app.
 *
 * Sections:
 *   1. Text cleaning (copied from model/train.py)
 *   2. Prediction (the Naive Bayes math)
 *   3. Storage (localStorage helpers)
 *   4. App UI (chat, codes, reminders, log and vehicle tabs)
 *
 * More features (vehicle problems, symptom picker, dial, dash lights,
 * roadside help) live in features.js.
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
  // Vague words that say nothing about the cause ("weird noise").
  "weird", "strange", "funny", "odd", "something", "wrong", "problem",
  "problems", "issue", "issues", "acting",
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
  // Words for newer problems (screens, turbos, 4WD, leaks inside, rust...).
  screen: ["screen", "screens", "display", "displays", "touchscreen", "monitor"],
  radio: ["radio", "radios", "stereo", "infotainment", "headunit"],
  phone: ["phone", "phones", "bluetooth", "carplay"],
  turbo: ["turbo", "turbos", "turbocharger", "turbocharged", "boost", "boosting", "boosted", "underboost", "overboost", "spool", "spools"],
  whistle: ["whistle", "whistles", "whistling", "siren", "whoosh", "whooshing"],
  "4wd": ["4wd", "4x4", "awd", "4hi", "4lo", "ptu"],
  speedometer: ["speedometer", "speedometers", "speedo", "tachometer", "tach", "odometer"],
  coolant: ["coolant", "antifreeze"],
  fob: ["fob", "fobs", "keyfob", "remote"],
  wet: ["wet", "damp", "soaked", "soggy", "moist", "drenched"],
  rain: ["rain", "rains", "raining", "rained", "rainy", "storm", "storms"],
  rust: ["rust", "rusty", "rusted", "rusting", "rot", "rotted", "rotting"],
  regen: ["regen", "regens", "regenerating", "regeneration"],
  hybrid: ["hybrid", "hybrids", "ev", "evs", "phev", "prius"],
  sag: ["sag", "sags", "sagging", "saggy"],
  judder: ["judder", "judders", "juddering"],
};

// Flip the groups into one lookup table: variant -> canonical word.
const SYNONYMS = new Map();
for (const [canonical, variants] of Object.entries(SYNONYM_GROUPS)) {
  for (const variant of variants) SYNONYMS.set(variant, canonical);
}

// Very light stemming: chop common endings so "leaking" ~ "leak" and
// "rattling" ~ "rattle".
function stem(word) {
  if (word.endsWith("ing") && word.length > 5) word = word.slice(0, -3);
  else if (word.endsWith("ed") && word.length > 4) word = word.slice(0, -2);
  else if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) word = word.slice(0, -1);
  // Drop a final "e" so "rattle"/"rattling" and "drive"/"driving" match.
  if (word.endsWith("e") && word.length > 4) word = word.slice(0, -1);
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
    // Words this problem never saw share one "unseen" score (see train.py).
    const row = MODEL.feature_log_prob[c];
    const unseen = MODEL.unseen_log_prob[c];
    for (const [index, count] of counts) score += count * (row[index] ?? unseen);
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
  reminders: "cardoctor.reminders",
  pending: "cardoctor.lastGuess",
  installHint: "cardoctor.installHint",
  state: "cardoctor.state",
};

// Reads saved data. If it's missing, damaged, or the wrong shape (say, from
// an older version), the fallback is used so the app never breaks.
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (Array.isArray(fallback)) return Array.isArray(value) ? value.filter((x) => x && typeof x === "object") : fallback;
    if (fallback && typeof fallback === "object") return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
    return value;
  } catch (err) {
    return fallback;
  }
}

const MAX_SAVED = 1000; // newest entries kept, so storage never fills up

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
let GUIDES = {};

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
// How hard the fix is, in words a beginner understands.
const DIY = { Easy: "Easy DIY fix", Medium: "DIY if you're handy", Hard: "Hard: shop recommended", Shop: "Needs a shop" };

function severityBadge(severity) {
  const s = SEVERITY[severity] || SEVERITY.medium;
  return el("span", { class: "sev " + s.cls }, s.text);
}

// ---------- Plain-English glossary ----------
// Car words and measurements (rotor, 12.6V, psi...) become tappable buttons.
// Tapping one shows a simple explanation right below. Words come from
// glossary.json: "match" lists plain words, "regex" handles measurements.
let GLOSSARY = [];
let GLOSSARY_RE = null;

function buildGlossary(entries) {
  GLOSSARY = entries;
  const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = [];
  const owners = []; // which glossary entry each regex group belongs to
  entries.forEach((e, i) => {
    if (e.regex) { parts.push(e.regex); owners.push(i); }
  });
  // Longest words first so "brake pads" wins over "pads".
  const words = [];
  entries.forEach((e, i) => (e.match || []).forEach((w) => words.push([w, i])));
  words.sort((a, b) => b[0].length - a[0].length);
  for (const [w, i] of words) { parts.push(`\\b${escape(w)}\\b`); owners.push(i); }
  GLOSSARY_RE = { re: new RegExp(parts.map((part) => `(${part})`).join("|"), "gi"), owners };
}

// Returns the text with known terms turned into tappable buttons. `seen`
// makes each term tappable only the first time it appears in a card.
function explain(text, seen = new Set()) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  if (!GLOSSARY_RE) { frag.append(text); return frag; }
  let last = 0;
  for (const m of text.matchAll(GLOSSARY_RE.re)) {
    const group = m.findIndex((g, k) => k > 0 && g !== undefined);
    const entry = GLOSSARY[GLOSSARY_RE.owners[group - 1]];
    if (!entry || seen.has(entry.term)) continue;
    seen.add(entry.term);
    frag.append(text.slice(last, m.index),
      el("button", { class: "term", type: "button", "data-term": entry.term, "aria-expanded": "false" }, m[0]));
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

// Opens or closes the explanation under a tapped term.
function toggleTerm(btn) {
  const host = btn.closest("li, p") || btn.parentElement;
  const open = host.querySelector(":scope > .tip");
  const sameTerm = open && open.dataset.term === btn.dataset.term;
  if (open) {
    open.remove();
    host.querySelectorAll('.term[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  if (sameTerm) return;
  const entry = GLOSSARY.find((g) => g.term === btn.dataset.term);
  if (!entry) return;
  host.append(el("span", { class: "tip", role: "note", "data-term": entry.term },
    el("strong", {}, entry.term + ": "), entry.text));
  btn.setAttribute("aria-expanded", "true");
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("themeToggle");
  const next = theme === "dark" ? "light" : "dark";
  btn.setAttribute("aria-label", `Switch to ${next} mode`);
  btn.replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#0b0f14" : "#f2f5fa");
}

// ---------- Tabs ----------
const TAB_ORDER = ["chat", "codes", "reminders", "log", "vehicle"];
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
  document.body.dataset.tab = name; // the Vehicle tab hides the vehicle card (it's right there)
  if (typeof moveTabIndicator === "function") moveTabIndicator();
  document.getElementById("composer").hidden = name !== "chat";
  const main = document.getElementById("main");
  main.scrollTop = 0;
  if (name === "chat") scrollChat();
  if (focus) document.getElementById("tabbtn-" + name).focus();
}

// ---------- Chat ----------
const STARTERS = ["Grinding noise", "Check engine light", "Won't start"];

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

const session = { messages: [], shown: [], resultNode: null, done: false, busy: false, asked: new Set(), last: null };

function sessionText() {
  return session.messages.join(" ");
}

// Scrolls to the newest message, or to the top of `node` (used for result
// cards so the diagnosis title is what you see first).
function offsetWithin(node, ancestor) {
  let y = 0;
  for (let n = node; n && n !== ancestor; n = n.offsetParent) y += n.offsetTop;
  return y;
}

function scrollChat(node) {
  const main = document.getElementById("main");
  requestAnimationFrame(() => {
    // offsetTop ignores the pop-in animation's transform, so the card's top
    // line never ends up hidden under the header.
    const top = node ? offsetWithin(node, main) - 12 : main.scrollHeight;
    main.scrollTo({ top, behavior: REDUCED_MOTION.matches ? "auto" : "smooth" });
  });
}

// Works with no signal: say so when the phone goes offline, so nobody thinks it broke.
function watchConnection() {
  const note = document.getElementById("offlineNote");
  const update = () => { note.hidden = navigator.onLine; };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

// One-time tip: add the app to the home screen so it opens like an app, even offline.
function installHint() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone || load(KEYS.installHint, false) === true) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const steps = ios
    ? "In Safari, tap the Share button (square with an arrow), then \u201cAdd to Home Screen\u201d."
    : "In Chrome, tap the \u22ee menu, then \u201cAdd to Home screen\u201d or \u201cInstall app\u201d.";
  const node = addMsg("bot", el("p", {}, el("strong", {}, "Tip: keep Car Doctor on your home screen. "),
    "It opens like an app and works with no signal, like a mechanic in your glovebox."),
  el("p", { class: "fineprint" }, steps),
  chipRow(["Got it"], () => { save(KEYS.installHint, true); node.remove(); }));
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
  session.shown = [];
  session.resultNode = null;
  session.done = false;
  session.asked = new Set();
  session.last = null;
  session.askedMore = false;
  stopSound();
  // "Welcome back! Last time I guessed ... Did I get it right?"
  const checkIn = checkInBubble();
  if (checkIn) addMsg("bot", checkIn);
  const name = vehicleName();
  const hello = addMsg("bot",
    el("p", { class: "lead" }, name ? `What's going on with your ${name}?` : "What's going on with your vehicle?"),
    el("p", {}, "Tap what you notice, or type it in your own words. No car know-how needed, and it works with no signal."),
    pickerTiles(),
    el("p", { class: "fineprint" }, "Or type it, like \"it grinds when I stop\". Quick picks:"),
    chipRow(STARTERS, sendMessage),
    el("p", { class: "fineprint" }, "Guidance only, not a professional diagnosis. If it feels unsafe, don't drive it."));
  const due = dueReminders();
  if (due.length) {
    const r = due[0];
    addMsg("bot", el("p", {}, el("strong", {}, "Heads up: "), `${r.title} is ${reminderStatus(r).text.toLowerCase()}.`),
      chipRow(["Open reminders"], () => showTab("reminders")));
  }
  installHint();
  // Start at the very top so the greeting isn't cut off under the header.
  requestAnimationFrame(() => { document.getElementById("main").scrollTop = 0; });
}

// Shows the "thinking" dots, then removes them.
async function thinking(ms) {
  const dots = addMsg("bot", el("span", { class: "sr-only" }, "Thinking…"));
  dots.classList.add("typing");
  dots.append(el("span", { "aria-hidden": "true" }), el("span", { "aria-hidden": "true" }), el("span", { "aria-hidden": "true" }));
  await wait(ms);
  dots.remove();
}

// Extra weight on top of the model's own scores:
//   +3 for a cause tied to a trouble code you typed,
//   a little for problems your vehicle is known for,
//   a little for problems you've confirmed before with similar words.
function computeBoosts() {
  const boosts = vehicleBoosts();
  for (const code of findCodes(sessionText())) {
    const info = CODES[code];
    if (info && info.related) boosts[info.related] = (boosts[info.related] || 0) + 3;
  }
  for (const [label, extra] of Object.entries(personalMatch(sessionText()).boosts)) {
    boosts[label] = (boosts[label] || 0) + extra;
  }
  return boosts;
}

// `shown` is what appears in the chat bubble when it differs from the words
// sent to the model (e.g. a picked option or a quick-question answer).
async function sendMessage(text, shown) {
  text = text.trim();
  if (!text || !MODEL || session.busy) return;
  session.busy = true;
  addMsg("user", shown || text);
  session.messages.push(text);
  session.shown.push(shown || text);

  document.body.classList.add("thinking"); // circuits light up while it "thinks"
  await thinking(650);
  document.body.classList.remove("thinking");

  // Explain any codes in this message.
  const newCodes = findCodes(text);
  if (newCodes.length) {
    addMsg("bot", ...newCodes.map((code) => {
      const info = CODES[code];
      return el("p", { class: "code-chip" }, el("strong", {}, code), info ? info.title : decodeCode(code));
    }));
  }

  // Check the new message on its own: earlier messages shouldn't hide that
  // the model understood nothing in this one.
  const understood = predict(text).recognized > 0 || newCodes.some((code) => CODES[code]);
  if (!understood) {
    session.messages.pop(); // don't keep text the model can't use
    session.shown.pop();
    const node = addMsg("bot", el("p", {}, "I didn't catch any symptoms there. What do you notice? Tap one, or describe what you hear, feel or smell."),
      pickerTiles(),
      el("p", { class: "fineprint" }, "For example: \"squeal when I start it on cold mornings\"."));
    scrollChat(node);
    session.busy = false;
    return;
  }
  // Too little to go on ("a weird noise")? A good mechanic asks before
  // guessing, so ask once with tappable choices instead of showing a guess.
  if (!session.askedMore && specificWords(sessionText()) === 0 && !findCodes(sessionText()).some((code) => CODES[code])) {
    session.askedMore = true;
    askForMore(tokenize(sessionText()));
    session.busy = false;
    return;
  }
  showResults(predict(sessionText(), computeBoosts()));
  session.busy = false;
}

// Words that say what kind of problem, but not which one ("noise", "shake").
const BROAD_WORDS = new Set(["noise", "smell", "light", "shake", "leak", "make", "drive", "run", "come", "happen", "doing",
  "sometime", "start", "car", "vehicle", "engine", "ther", "seem", "keep", "new", "old", "today", "lately"]);
function specificWords(text) {
  return new Set(tokenize(text).filter((t) => !t.includes("_") && MODEL.vocab[t] !== undefined && !BROAD_WORDS.has(t))).size;
}

// A quick-question answer. "No / not sure" answers add no words; we just
// re-score so the next question (if any) can show.
async function answerQuestion(label, words) {
  if (words) { sendMessage(words, label); return; }
  if (session.busy) return;
  session.busy = true;
  addMsg("user", label);
  await thinking(400);
  showResults(predict(sessionText(), computeBoosts()));
  session.busy = false;
}

// A guess is never certain, so the most we show is 99%.
const percent = (prob) => Math.min(99, Math.max(1, Math.round(prob * 100)));

function gauge(prob) {
  const pct = percent(prob);
  const fill = el("span", { class: "gauge-fill" });
  // Animate from 0 to the value (CSSOM style is allowed by the CSP).
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.max(2, pct) + "%"; }));
  return el("div", { class: "gauge" },
    el("div", { class: "gauge-track", role: "img", "aria-label": `${pct}% match` }, fill),
    el("span", { class: "gauge-num", "aria-hidden": "true" }, pct + "%"));
}

function lookupCause(label) {
  return Object.hasOwn(CAUSES, label) ? CAUSES[label] : { name: String(label), severity: "medium", diy: "Shop", summary: "", checks: [] };
}

// "What's going on" and "Can I drive it?" in everyday words.
function plainBlock(cause, seen) {
  return el("div", { class: "plain" },
    el("h3", { class: "q" }, "What's going on"),
    el("p", {}, explain(cause.plain || cause.summary, seen)),
    cause.drive ? el("h3", { class: "q" }, "Can I drive it?") : null,
    cause.drive ? el("p", {}, explain(cause.drive, seen)) : null);
}

// "Common on your 2005 Chevy Silverado: ..." when the vehicle is known for it.
function knownOnVehicle(label) {
  const p = load(KEYS.profile, {});
  const hits = vehicleIssues(p).filter((i) => i.c === label);
  if (!hits.length) return null;
  return el("div", { class: "known" },
    el("p", { class: "eyebrow" }, `Common on your ${[p.year, canonicalMake(p.make), p.model].join(" ")}`),
    ...hits.map((h) => el("p", {}, el("strong", {}, h.t + ": "), h.w)));
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

  // Plain English first; the technical checks are tucked away for DIYers.
  const seen = new Set();
  card.append(el("div", { class: "result-main" },
    el("p", { class: "eyebrow" }, "Most likely"),
    el("h2", { class: "result-title" }, cause.name),
    el("div", { class: "badges" }, severityBadge(cause.severity), el("span", { class: "pill" }, DIY[cause.diy] || cause.diy)),
    // The first thing anyone wants to know: can I keep driving?
    cause.drive ? el("div", { class: "drive-now sev-" + cause.severity },
      el("h3", { class: "q" }, "Can I drive it?"), el("p", {}, explain(cause.drive, seen))) : null,
    dial(best.prob),
    el("h3", { class: "q" }, "What's going on"),
    el("p", {}, explain(cause.plain || cause.summary, seen)),
    cause.todo ? el("div", { class: "next-step" }, el("h3", { class: "eyebrow" }, "What to do"), el("p", {}, explain(cause.todo, seen))) : null,
    guideBlock(best.label, seen),
    CAUSE_SOUND[best.label] ? el("div", { class: "sound-row" }, soundButton(CAUSE_SOUND[best.label]),
      el("span", { class: "fineprint" }, "Hear roughly what it sounds like")) : null,
    seenBefore(best.label),
    knownOnVehicle(best.label),
    cause.signs ? el("details", { class: "more-checks signs" },
      el("summary", {}, "Other signs of this"),
      el("ul", { class: "checks" }, ...cause.signs.map((x) => el("li", {}, explain(x, seen))))) : null,
    el("details", { class: "more-checks" },
      el("summary", {}, `For DIYers: ${cause.checks.length} things to check`),
      el("p", { class: "summary" }, explain(cause.summary, seen)),
      el("ol", { class: "checks" }, ...cause.checks.map((c) => el("li", {}, explain(c, seen))))),
    needsPro(cause) ? el("div", { class: "pro-row" },
      el("button", { class: "btn", type: "button", onclick: () => openShopSheet(best.label) }, "📍 Find a mechanic near me"),
      cause.severity === "critical" ? el("button", { class: "btn", type: "button", onclick: openHelpSheet }, "🚨 Roadside help") : null) : null,
    el("p", { class: "fineprint" }, "Tap any underlined word for a simple explanation.")));

  // Other possibilities, collapsed.
  for (const g of top.slice(1)) {
    const c = lookupCause(g.label);
    const altSeen = new Set();
    card.append(el("details", { class: "alt" },
      el("summary", {},
        el("span", { class: "alt-head" }, el("span", {}, c.name), icon("chevron")),
        gauge(g.prob)),
      el("div", { class: "alt-body" },
        el("div", { class: "badges" }, severityBadge(c.severity), el("span", { class: "pill" }, DIY[c.diy] || c.diy)),
        plainBlock(c, altSeen),
        c.todo ? el("p", {}, el("strong", {}, "What to do: "), explain(c.todo, altSeen)) : null,
        el("ol", { class: "checks" }, ...c.checks.map((x) => el("li", {}, explain(x, altSeen)))),
        guideBlock(g.label, altSeen))));
  }

  // Unsure, or the description is too short to trust? Ask one simple
  // question that separates the top guesses. If none fits, fall back to
  // "when does it happen?" chips the user hasn't covered yet.
  const usefulWords = new Set(tokenize(sessionText()).filter((t) => !t.includes("_") && MODEL.vocab[t] !== undefined));
  const question = pickQuestion(top, usefulWords.size);
  if (question) {
    card.append(questionBlock(question));
  } else if (best.prob < 0.6 || usefulWords.size < 2) {
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
  session.last = best.label;
  rememberGuess(best.label); // so we can check in next time
  flashCircuits();
}

function addTraining(label, text = sessionText()) {
  const list = load(KEYS.training, []);
  list.push({ label, text, date: localDate() });
  save(KEYS.training, list.slice(-MAX_SAVED));
  renderTraining();
}

function confirmCause(label, card) {
  celebrate(card);
  clearGuess();
  addTraining(label);
  session.done = true;
  const profile = load(KEYS.profile, {});
  addLogEntry({ date: localDate(), mileage: profile.mileage || "", note: `${lookupCause(label).name}: ${sessionText()}` });
  card.querySelector(".actions").remove();
  addMsg("bot", el("p", {}, "Yay! 🎉 Saved to your repair log, and I'll remember it for next time."),
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
    clearGuess();
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
    el("p", {}, explain("When the check engine light comes on, the vehicle saves a trouble code. Most auto parts stores will read it for free with an OBD-II scanner. Type it above. Common ones:")),
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
    const seen = new Set();
    card.append(
      el("h2", { class: "code-title" }, info.title),
      el("div", { class: "badges" }, severityBadge(cause.severity), el("span", { class: "pill" }, "Fix: " + (DIY[cause.diy] || cause.diy))),
      el("h3", {}, "In plain English"),
      el("p", {}, explain(`The computer noticed a problem related to: ${cause.name.toLowerCase()}. ${cause.plain || ""}`, seen)),
      cause.drive ? el("p", {}, el("strong", {}, "Can I drive it? "), explain(cause.drive, seen)) : null,
      el("h3", {}, "Likely causes"),
      el("ol", { class: "checks" }, ...info.causes.map((c) => el("li", {}, explain(c, seen)))),
      el("p", { class: "fineprint" }, "Tap any underlined word for a simple explanation."));
  } else {
    card.append(el("h2", { class: "code-title" }, "Unknown code"), el("p", {}, decodeCode(code)),
      el("p", { class: "hint" }, "Search the code with your make and model, or ask a parts store to look it up."));
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
  if (VEHICLES) renderMyIssues();
}

// ---------- Log ----------
function addLogEntry(entry) {
  const log = load(KEYS.log, []);
  log.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), ...entry });
  save(KEYS.log, log.slice(-MAX_SAVED));
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

// ---------- Reminders ----------
// Common upkeep jobs, with a beginner-friendly reason and a usual interval.
const MAINTENANCE = {
  oil: { title: "Oil change", months: 6, why: "Oil keeps the engine's metal parts from grinding together. Most vehicles need it every 3,000 to 7,500 miles or about every 6 months (your owner's manual or oil sticker says exactly)." },
  tires: { title: "Tire rotation", months: 6, why: "Moving the tires to different corners makes them wear evenly so they last longer. Usually every 5,000 to 7,500 miles; many shops do it with an oil change." },
  pressure: { title: "Check tire pressure", months: 1, why: "Low tires wear out fast and waste gas. The right number is on a sticker inside the driver's door. Gas stations have free air." },
  brakes: { title: "Brake check", months: 12, why: "A quick look at how much brake pad is left. Cheap to check, expensive if you wait until it grinds." },
  battery: { title: "Battery test", months: 12, why: "Batteries usually last 3 to 5 years and tend to die on the first cold morning. Parts stores test them free." },
  airfilter: { title: "Engine air filter", months: 12, why: "A clean filter helps the engine breathe and saves gas. Usually every 12,000 to 15,000 miles; often a 5-minute, no-tools job." },
  wipers: { title: "Wiper blades", months: 12, why: "Streaky or chattering wipers make rain driving dangerous. Cheap and easy to replace at a parts store." },
  coolant: { title: "Check coolant level", months: 6, why: "Coolant keeps the engine from overheating. Check the see-through tank only when the engine is cold." },
  inspection: { title: "Inspection & registration", months: 12, why: "Most states require it yearly. Your registration sticker shows the month it's due." },
  custom: { title: "", months: 0, why: "Name it yourself below." },
};

function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1 + n, d);
  if (next.getDate() !== d) next.setDate(0); // e.g. Jan 31 + 1 month = Feb 28
  const pad = (x) => String(x).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function reminderDate(r) {
  return new Date(`${r.date}T${r.time || "09:00"}`); // local time
}

// Overdue / due soon / upcoming, by date or by mileage.
function reminderStatus(r) {
  // Count calendar days (today = 0), not 24-hour blocks.
  const [y, m, d] = r.date.split("-").map(Number);
  const today = new Date();
  const days = Math.round((new Date(y, m - 1, d) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const miles = Number(load(KEYS.profile, {}).mileage || 0);
  if ((r.mileage && miles && miles >= Number(r.mileage)) || reminderDate(r) < new Date()) {
    return { cls: "stop", text: "Overdue", rank: 0 };
  }
  if (days <= 0) return { cls: "soon", text: "Due today", rank: 1 };
  if (days <= 14) return { cls: "soon", text: days === 1 ? "Due tomorrow" : `Due in ${days} days`, rank: 1 };
  return { cls: "safe", text: `In ${days} days`, rank: 2 };
}

function dueReminders() {
  return load(KEYS.reminders, []).filter((r) => reminderStatus(r).rank < 2)
    .sort((a, b) => reminderDate(a) - reminderDate(b));
}

function repeatText(n) {
  return n ? (n === 1 ? "Repeats monthly" : n === 12 ? "Repeats yearly" : `Repeats every ${n} months`) : "One time";
}

// --- Calendar (.ics) ---
// The phone's own Calendar app does the alerting: the day before and at the
// chosen time, even when Car Doctor is closed.
function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsFold(line) {
  const out = [];
  while (line.length > 60) { out.push(line.slice(0, 60)); line = " " + line.slice(60); }
  out.push(line);
  return out.join("\r\n");
}

function stamp(date) {
  const pad = (x) => String(x).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function reminderTitle(r) {
  const vehicle = vehicleName();
  return vehicle ? `${r.title} - ${vehicle}` : r.title;
}

function reminderDetails(r) {
  const why = MAINTENANCE[r.type] && MAINTENANCE[r.type].why;
  return [r.mileage ? `Due at ${Number(r.mileage).toLocaleString()} miles.` : "", why || "", "From Car Doctor."].filter(Boolean).join(" ");
}

function buildIcs(r) {
  const start = reminderDate(r);
  const end = new Date(start.getTime() + 30 * 60000);
  const utc = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Caylor Made Technologies//Car Doctor//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${r.id}@car-doctor`, `DTSTAMP:${utc}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, // no time zone = phone's local time
    `SUMMARY:${icsEscape(reminderTitle(r))}`,
    `DESCRIPTION:${icsEscape(reminderDetails(r))}`,
  ];
  if (r.repeat > 0) lines.push(`RRULE:FREQ=MONTHLY;INTERVAL=${r.repeat}`);
  for (const trigger of ["-P1D", "PT0M"]) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(reminderTitle(r))}`, `TRIGGER:${trigger}`, "END:VALARM");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function addToCalendar(r) {
  const ics = buildIcs(r);
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    // sw.js answers event.ics with a real calendar file, which iPhone and
    // Android both open in the Calendar app ("Add" / "Add All").
    window.open("event.ics?d=" + encodeURIComponent(ics), "_blank", "noopener");
  } else {
    // First visit (no service worker yet): download the file instead.
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = el("a", { href: url, download: (r.title || "reminder").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".ics" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const list = load(KEYS.reminders, []);
  const saved = list.find((x) => x.id === r.id);
  if (saved) { saved.inCalendar = true; save(KEYS.reminders, list); }
  renderReminders();
}

function googleCalendarUrl(r) {
  const start = reminderDate(r);
  const end = new Date(start.getTime() + 30 * 60000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: reminderTitle(r),
    dates: `${stamp(start)}/${stamp(end)}`,
    details: reminderDetails(r),
  });
  if (r.repeat > 0) params.set("recur", `RRULE:FREQ=MONTHLY;INTERVAL=${r.repeat}`);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

function completeReminder(r) {
  const profile = load(KEYS.profile, {});
  addLogEntry({ date: localDate(), mileage: profile.mileage || "", note: `${r.title} (done from reminder)` });
  let list = load(KEYS.reminders, []);
  const status = document.getElementById("reminderSaved");
  if (r.repeat > 0) {
    const saved = list.find((x) => x.id === r.id);
    saved.date = addMonths(localDate(), r.repeat);
    saved.mileage = "";
    status.textContent = `Logged ✓ Next ${r.title.toLowerCase()}: ${prettyDate(saved.date)}.` +
      (saved.inCalendar ? " Your calendar event repeats, so the old one may need moving." : "");
  } else {
    list = list.filter((x) => x.id !== r.id);
    status.textContent = "Logged ✓ and removed from reminders.";
  }
  save(KEYS.reminders, list);
  renderReminders();
}

function renderReminders() {
  const list = load(KEYS.reminders, []).slice().sort((a, b) => reminderDate(a) - reminderDate(b));
  const box = document.getElementById("dueList");
  const due = dueReminders().length;
  const badge = document.getElementById("dueBadge");
  badge.hidden = !due;
  badge.textContent = due;
  document.getElementById("tabbtn-reminders").setAttribute("aria-label", due ? `Reminders, ${due} due` : "Reminders");

  if (!list.length) {
    box.replaceChildren(el("div", { class: "empty" },
      icon("bell"),
      el("strong", {}, "No reminders yet"),
      el("p", {}, "Start with an oil change: it's already picked below. Choose a date, save, then tap Add to Calendar.")));
    return;
  }
  box.replaceChildren(...list.map((r) => {
    const st = reminderStatus(r);
    const when = reminderDate(r).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    return el("article", { class: "card reminder", "aria-label": `${r.title}, ${st.text}` },
      el("div", { class: "reminder-head" },
        el("h3", { class: "reminder-title" }, r.title),
        el("span", { class: "sev " + st.cls }, st.text)),
      el("p", { class: "reminder-when" }, icon("calendar"), when),
      el("p", { class: "hint" }, [repeatText(r.repeat), r.mileage ? `or at ${Number(r.mileage).toLocaleString()} mi` : "", r.inCalendar ? "In your calendar ✓" : ""].filter(Boolean).join(" · ")),
      el("div", { class: "reminder-actions" },
        el("button", { class: "btn primary", type: "button", onclick: () => addToCalendar(r) }, icon("calendar"), r.inCalendar ? "Add again" : "Add to Calendar"),
        el("button", { class: "btn", type: "button", onclick: () => completeReminder(r) }, icon("check"), "Done"),
        el("a", { class: "btn", href: googleCalendarUrl(r), target: "_blank", rel: "noopener noreferrer" }, "Google Calendar"),
        el("button", { class: "icon-btn bare", type: "button", "aria-label": "Delete " + r.title + " reminder", onclick: () => {
          if (!confirm(`Delete the "${r.title}" reminder? (Anything already in your calendar stays there.)`)) return;
          save(KEYS.reminders, load(KEYS.reminders, []).filter((x) => x.id !== r.id));
          renderReminders();
        } }, icon("trash"))));
  }));
}

// Fills in the form defaults for the chosen job.
function setReminderType(type) {
  const job = MAINTENANCE[type];
  const form = document.getElementById("reminderForm");
  document.getElementById("reminderWhy").replaceChildren(explain(job.why));
  document.getElementById("customTitleWrap").hidden = type !== "custom";
  form.elements.repeat.value = String(job.months);
  form.elements.date.value = addMonths(localDate(), job.months || 1);
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
      const n = TAB_ORDER.length;
      if (e.key === "ArrowRight") showTab(TAB_ORDER[(i + 1) % n], { focus: true });
      if (e.key === "ArrowLeft") showTab(TAB_ORDER[(i + n - 1) % n], { focus: true });
    });
  }

  // Tap an underlined word for its plain-English meaning.
  document.addEventListener("click", (e) => {
    const term = e.target.closest(".term");
    if (term) toggleTerm(term);
  });

  const reminderForm = document.getElementById("reminderForm");
  const typeSelect = document.getElementById("reminderType");
  typeSelect.replaceChildren(...Object.entries(MAINTENANCE).map(([key, job]) =>
    el("option", { value: key }, job.title || "Something else…")));
  typeSelect.addEventListener("change", () => setReminderType(typeSelect.value));
  reminderForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = reminderForm.elements;
    const type = f.type.value;
    const title = type === "custom" ? f.title.value.trim() : MAINTENANCE[type].title;
    if (!title) { f.title.focus(); return; }
    const list = load(KEYS.reminders, []);
    list.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type, title,
      date: f.date.value || localDate(),
      time: f.time.value || "09:00",
      repeat: Number(f.repeat.value) || 0,
      mileage: f.mileage.value.replace(/\D/g, ""),
    });
    save(KEYS.reminders, list);
    renderReminders();
    f.title.value = "";
    f.mileage.value = "";
    document.getElementById("reminderSaved").textContent = "Saved ✓ Now tap \"Add to Calendar\" on it so your phone reminds you.";
    document.getElementById("main").scrollTo({ top: 0, behavior: REDUCED_MOTION.matches ? "auto" : "smooth" });
  });

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
  const sendButton = document.getElementById("sendBtn");
  input.addEventListener("input", () => sendButton.classList.toggle("ready", Boolean(input.value.trim())));
  document.getElementById("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!surprise(input.value)) sendMessage(input.value);
    input.value = "";
    sendButton.classList.remove("ready");
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
    if (surprise(`${f.year.value} ${f.make.value} ${f.model.value}`)) {
      renderProfile(); // a surprise, not a vehicle: put the saved one back
      return;
    }
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
    yearSurprise(f.year.value.trim());
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
    renderReminders();
    renderRoadside();
    welcome();
    status.textContent = "";
    alert("All Car Doctor data on this phone was deleted.");
  });
}

async function init() {
  applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  buildCircuits();
  wireUp();
  setupMotion();
  watchConnection();
  renderProfile();
  renderLog();
  renderTraining();
  showTab("chat");

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true;
  try {
    const [model, causes, codes, glossary, vehicles, guides] = await Promise.all(
      ["model.json", "causes.json", "codes.json", "glossary.json", "vehicles.json", "guides.json"].map((f) => fetch(f).then((r) => {
        if (!r.ok) throw new Error(f + " " + r.status);
        return r.json();
      })));
    MODEL = model;
    CAUSES = causes;
    CODES = codes;
    GUIDES = guides;
    buildGlossary(glossary);
    initFeatures(vehicles);
    setReminderType("oil");
    renderReminders();
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
