// Car Doctor - quick-question check (run by tests/check.py).
//
// Plays the follow-up questions against data/holdout.csv: a pretend user who
// knows the real cause taps the answer that fits it best (or skips when none
// does). Reports accuracy before and after the questions and how many were
// asked, for full sentences and for vague ones (first 2 words only).
//
//   node tests/questions.js
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");
const features = fs.readFileSync(path.join(ROOT, "app/features.js"), "utf8");

// The model code from app.js (same trick as check.py).
const core = app.slice(0, app.indexOf("// ===== STORAGE ====="));
const lib = new Function(core + "\nreturn { tokenize, predict, howSure, setModel: (m) => { MODEL = m; } };")();
const howSure = lib.howSure;
lib.setModel(JSON.parse(fs.readFileSync(path.join(ROOT, "app/model.json"), "utf8")));
const BROAD = new Set(eval(app.match(/const BROAD_WORDS = new Set\((\[[\s\S]*?\])\)/)[1]));


// QUESTIONS, the limits and pickQuestion from features.js.
const slice = (start, end) => { const i = features.indexOf(start); return features.slice(i, features.indexOf(end, i)); };
const source = slice("const QUESTIONS = [", "\n];\n") + "\n];\n"
  + features.match(/^const MAX_QUESTIONS = .*$/m)[0] + "\n" + features.match(/^const MAX_FOLLOWUPS = .*$/m)[0] + "\n"
  + slice("function pickQuestion(", "\nfunction questionBlock(");
const session = { asked: new Set(), followups: 0, messages: [] };
const sessionText = () => session.messages.join(" ");
const { QUESTIONS, MAX_QUESTIONS, pickQuestion } = new Function("session", "tokenize", "sessionText",
  source + "\nreturn { QUESTIONS, MAX_QUESTIONS, pickQuestion };")(session, lib.tokenize, sessionText);

const specific = (text) => new Set(lib.tokenize(text).filter((t) => !t.includes("_") && MODEL_HAS(t) && !BROAD.has(t))).size;
function MODEL_HAS(token) { return lib.predict(token).recognized > 0; }
const probOf = (text, label) => lib.predict(text).ranked.find((g) => g.label === label).prob;

const readCsv = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").trim().split("\n").slice(1)
  .map((line) => { const i = line.indexOf(","); return [line.slice(0, i), line.slice(i + 1)]; });
const holdout = readCsv("data/holdout.csv");
// Written after holdout.csv was used for tuning, so the cleaner test.
const holdout2 = readCsv("data/holdout2.csv");

const shown = []; // [confidence shown, was it right] for every final answer

function play(rows) {
  let before = 0, after = 0, asked = 0, most = 0, broke = 0, tellMore = 0;
  for (const [label, text] of rows) {
    session.asked = new Set(); session.followups = 0; session.messages = [text];
    // Like the app: with no specific symptom word it shows no guess and asks
    // "tell me a little more" (the picker) instead. Not scored here.
    if (specific(text) === 0) { tellMore++; continue; }
    const first = lib.predict(sessionText()).ranked[0].label === label;
    let n = 0;
    for (;;) {
      const ranked = lib.predict(sessionText()).ranked;
      ranked.known = lib.predict(sessionText()).known;
      const top = ranked.filter((g, i) => i === 0 || g.prob >= 0.05).slice(0, 3);
      const q = pickQuestion(top, specific(sessionText()));
      // The app only asks when it isn't sure yet (or for "always" questions).
      if (!q || (howSure(top[0].prob, ranked.known) >= 0.85 && !q.always)) break;
      session.asked.add(q.id); session.followups++; n++;
      let pick = "", best = probOf(sessionText(), label);
      for (const [, words] of q.options) {
        if (words && probOf(sessionText() + " " + words, label) > best * 1.15) { best = probOf(sessionText() + " " + words, label); pick = words; }
      }
      if (pick) session.messages.push(pick);
    }
    const final = lib.predict(sessionText());
    const end = final.ranked[0];
    const last = end.label === label;
    shown.push([howSure(end.prob, final.known), last]);
    before += first; after += last; asked += n; most = Math.max(most, n);
    if (first && !last) broke++;
  }
  const pct = (x) => Math.round(1000 * x / rows.length) / 10;
  const n = rows.length - tellMore;
  const share = (x) => Math.round(1000 * x / n) / 10;
  return { sentences: rows.length, askedForMore: tellMore, before: share(before), after: share(after), broke,
    avgQuestions: Math.round(100 * asked / n) / 100, maxQuestions: most };
}

const vague = holdout.map(([l, t]) => [l, t.split(" ").filter((w) => lib.tokenize(w).length).slice(0, 2).join(" ")])
  .filter(([, t]) => lib.predict(t).recognized > 0);
// Every answer that adds words must add words the model knows.
const deadAnswers = QUESTIONS.flatMap((q) => q.options.filter(([, w]) => w && !lib.predict(w).recognized).map(([l]) => `${q.id}: ${l}`));

const full = play(holdout);
const fresh = play(holdout2);
const vagueResult = play(vague);
// Shown confidence vs how often it was right, in bands.
const bands = [[0, 0.4], [0.4, 0.6], [0.6, 0.85], [0.85, 1.01]].map(([lo, hi]) => {
  const inBand = shown.filter(([c]) => c >= lo && c < hi);
  const avgShown = inBand.reduce((sum, [c]) => sum + c, 0) / (inBand.length || 1);
  const right = inBand.filter(([, ok]) => ok).length / (inBand.length || 1);
  return { band: `${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}%`, answers: inBand.length,
    shown: Math.round(avgShown * 100), right: Math.round(right * 100) };
});
console.log(JSON.stringify({ maxAllowed: MAX_QUESTIONS, full, fresh, vague: vagueResult, calibration: bands, deadAnswers }));
