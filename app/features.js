"use strict";
/*
 * Car Doctor - extra features (loaded after app.js and uses its helpers).
 *
 *   1. Vehicle known problems (vehicles.json)
 *   2. Guided symptom picker (tap instead of type)
 *   3. Match dial (gauge needle)
 *   4. Dash warning light guide
 *   5. Roadside help + find a mechanic near you
 *   6. Little celebrations (haptics, check pop)
 */

// ===========================================================================
// 1. Vehicle known problems
// ===========================================================================

let VEHICLES = null; // filled from vehicles.json

const norm = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// "chevy" -> "Chevrolet", "vw" -> "Volkswagen"; unknown makes stay as typed.
function canonicalMake(make) {
  const typed = String(make || "").trim();
  if (!VEHICLES || !typed) return typed;
  const lower = typed.toLowerCase();
  return VEHICLES.aliases[lower] || Object.keys(VEHICLES.names).find((m) => m.toLowerCase() === lower) || typed;
}

// Known problems for one vehicle. Needs make, model and year (problems
// differ a lot between generations, so we don't guess without a year).
function vehicleIssues(v) {
  if (!VEHICLES || !v || !v.make || !v.model || !v.year) return [];
  let make = canonicalMake(v.make);
  let model = norm(v.model);
  const year = Number(v.year);
  // Before 2010 the Ram pickup was sold as a "Dodge Ram".
  if (make === "Dodge" && model.startsWith("ram")) { make = "Ram"; model = model.slice(3) || "1500"; }
  const engine = norm(v.engine);
  // Score how well each entry's name matches what was typed; keep the best.
  const scored = VEHICLES.models
    .filter((r) => r.make === make && year >= r.from && year <= r.to)
    .map((r) => {
      let best = 0;
      for (const name of [r.model, ...r.aka]) {
        const key = norm(name);
        if (!key) continue;
        if (model === key || model.startsWith(key)) best = Math.max(best, key.length);
        else if (key.startsWith(model) && model.length >= 3) best = Math.max(best, model.length - 0.5);
      }
      return { r, best };
    })
    .filter((x) => x.best > 0);
  const top = Math.max(0, ...scored.map((x) => x.best));
  const seen = new Set();
  const issues = [];
  for (const { r, best } of scored) {
    if (best !== top) continue;
    for (const group of r.groups) {
      for (const issue of VEHICLES.groups[group] || []) {
        if (seen.has(issue.t)) continue;
        // Engine-specific problems only show if the saved engine matches.
        if (engine && issue.e && !issue.e.some((k) => engine.includes(k))) continue;
        seen.add(issue.t);
        issues.push(issue);
      }
    }
  }
  return issues;
}

// Small extra weight for problems this vehicle is known for (max +1.2 per cause).
function vehicleBoosts() {
  const boosts = {};
  for (const issue of vehicleIssues(load(KEYS.profile, {}))) {
    if (issue.c) boosts[issue.c] = Math.min((boosts[issue.c] || 0) + 0.6, 1.2);
  }
  return boosts;
}

function issueCard(issue) {
  const seen = new Set();
  return el("article", { class: "issue card" },
    el("h3", { class: "issue-title" }, issue.t),
    el("p", {}, el("strong", {}, "Signs: "), explain(issue.s, seen)),
    el("p", {}, el("strong", {}, "What to do: "), explain(issue.w, seen)),
    el("button", { class: "btn small-btn", type: "button", onclick: () => {
      showTab("chat");
      if (session.done || session.messages.length) welcome();
      sendMessage(issue.s);
    } }, "Check my symptoms in Chat"));
}

function issueList(issues, label) {
  if (!issues.length) {
    return el("div", { class: "empty" },
      icon("check"),
      el("strong", {}, "Nothing widely reported"),
      el("p", {}, `We don't have common problems listed for ${label || "this vehicle"}. That's usually good news. Keep up with oil changes, tires and brakes in Reminders.`));
  }
  return el("div", { class: "issue-list" }, ...issues.map((i) => issueCard(i)));
}

// Known problems for the saved vehicle (My Vehicle tab).
function renderMyIssues() {
  const box = document.getElementById("myIssues");
  const p = load(KEYS.profile, {});
  const label = [p.year, canonicalMake(p.make), p.model].filter(Boolean).join(" ");
  const title = document.getElementById("myIssuesTitle");
  if (!p.make || !p.model || !p.year) {
    title.textContent = "Known problems";
    box.replaceChildren(el("p", { class: "hint" }, "Add the year, make and model above to see problems your vehicle is known for."));
    return;
  }
  const issues = vehicleIssues(p);
  title.textContent = issues.length ? `${issues.length} known problem${issues.length === 1 ? "" : "s"} for your ${label}` : `Known problems: ${label}`;
  box.replaceChildren(
    issues.length ? el("p", { class: "hint" }, "Commonly reported on this vehicle. Yours may never have them, but now you know the signs.") : null,
    issueList(issues, label));
}

// Make and model suggestions while typing.
function fillMakeModelLists(makeInput, makeList, modelList) {
  makeList.replaceChildren(...Object.keys(VEHICLES.names).map((m) => el("option", { value: m })));
  const update = () => {
    const names = VEHICLES.names[canonicalMake(makeInput.value)] || [];
    modelList.replaceChildren(...names.map((n) => el("option", { value: n })));
  };
  makeInput.addEventListener("input", update);
  update();
}

// "Look up any vehicle" (for checking a vehicle before buying it).
function setupLookup() {
  const make = document.getElementById("lookMake");
  const model = document.getElementById("lookModel");
  const year = document.getElementById("lookYear");
  const out = document.getElementById("lookResult");
  make.replaceChildren(el("option", { value: "" }, "Make"), ...Object.keys(VEHICLES.names).map((m) => el("option", { value: m }, m)));
  const thisYear = new Date().getFullYear() + 1;
  year.replaceChildren(el("option", { value: "" }, "Year"),
    ...Array.from({ length: thisYear - 1999 }, (_, i) => String(thisYear - i)).map((y) => el("option", { value: y }, y)));
  const fillModels = () => {
    const names = VEHICLES.names[make.value] || [];
    model.replaceChildren(el("option", { value: "" }, "Model"), ...names.map((n) => el("option", { value: n }, n)));
  };
  const show = () => {
    if (!make.value || !model.value || !year.value) {
      out.replaceChildren(el("p", { class: "hint" }, "Pick a year, make and model."));
      return;
    }
    const v = { year: year.value, make: make.value, model: model.value };
    out.replaceChildren(issueList(vehicleIssues(v), `${v.year} ${v.make} ${v.model}`));
  };
  make.addEventListener("change", () => { fillModels(); show(); });
  model.addEventListener("change", show);
  year.addEventListener("change", show);
  fillModels();
  show();
}

// ===========================================================================
// 2. Guided symptom picker: tap through instead of typing
// ===========================================================================

// Each option is [button label, words sent to the model].
// Words starting with "__" show a friendly answer instead of diagnosing.
const PICKER = [
  { id: "noise", emoji: "🔊", label: "A noise", q: "What does it sound like? Tap 🔊 to hear examples.", where: true, options: [
    ["Grinding", "grinding noise", "grind"], ["Squealing", "squealing noise", "squeal"], ["Clicking", "clicking noise", "cv_click"],
    ["Humming / growling", "humming noise", "hum"], ["Ticking", "ticking noise", "tick"], ["Clunking", "clunk", "clunk"],
    ["Rattling", "rattle", "rattle"], ["Whining", "whining noise", "whine"], ["Hissing", "hissing noise", "hiss"]] },
  { id: "shake", emoji: "📳", label: "Shaking", q: "What shakes?", where: false, options: [
    ["Steering wheel", "steering wheel shakes"], ["Whole vehicle", "whole truck shakes vibration"],
    ["Brake pedal pulses", "brake pedal pulses"], ["Engine, at a stop", "shakes at idle in drive rough"]] },
  { id: "smell", emoji: "👃", label: "A smell", q: "What does it smell like?", where: false, options: [
    ["Burning oil", "burning oil smell"], ["Sweet, like syrup", "sweet smell coolant"],
    ["Rotten eggs", "rotten egg smell"], ["Gasoline", "gas smell near the tank"],
    ["Exhaust inside", "exhaust smell in the cab"], ["Burning, from one wheel", "burning smell from one wheel hot"],
    ["Burnt toast (stick shift)", "burnt smell clutch manual"], ["Musty vents", "musty smell from the ac vents"]] },
  { id: "light", emoji: "💡", label: "Warning light", q: "Which light is on?", where: false, options: [
    ["Check engine (flashing)", "check engine light flashing misfire"], ["Check engine (steady)", "check engine light on"],
    ["Battery", "battery light on while driving"], ["Oil", "oil light on low oil pressure"],
    ["Temperature", "temperature light on running hot"], ["Brake", "brake warning light"],
    ["ABS / traction", "abs light and traction light on"], ["Tire pressure", "tire pressure light on"]] },
  { id: "nostart", emoji: "🔑", label: "Won't start", q: "What happens when you turn the key or press Start? Tap 🔊 to compare.", where: false, options: [
    ["Fast clicking", "clicks fast wont start dim lights", "fast_click"], ["One loud click", "one click no crank lights bright", "one_click"],
    ["Cranks, won't catch", "cranks but wont start", "crank"], ["Cranks slowly", "slow crank", "slow_crank"],
    ["Key won't turn / not detected", "key wont turn key not detected"], ["Nothing at all", "nothing happens no lights dead"]] },
  { id: "leak", emoji: "💧", label: "A leak", q: "What color is the fluid?", where: false, options: [
    ["Brown or black", "oil leak brown drip under the engine"], ["Red", "red fluid leaking"],
    ["Green, orange or pink", "coolant leak green sweet smell"], ["Clear and slippery", "clear slippery fluid leaking near the wheel brake"],
    ["Wet carpet inside", "wet carpet passenger side sweet smell"], ["Clear water, front", "__ac_water"], ["Blue", "__washer"]] },
  { id: "hot", emoji: "🌡️", label: "Running hot", q: "What's happening?", where: false, options: [
    ["Gauge in the red", "temperature gauge in the red"], ["Steam from the hood", "steam from under the hood"],
    ["Losing coolant", "losing coolant"], ["White smoke, milky oil", "white smoke milky oil"]] },
  { id: "air", emoji: "🌬️", label: "Heat & A/C", q: "What's the heat or A/C doing?", where: false, options: [
    ["A/C blows warm", "ac blows warm air"], ["Fan only works on high", "fan only works on high"],
    ["No air from the vents", "no air from the vents"], ["Heat is weak", "heater blows lukewarm temp gauge low"],
    ["Windows fog, sweet smell", "windows fog sweet smell inside"]] },
  { id: "rough", emoji: "⚡", label: "Runs rough", q: "What's the engine doing?", where: false, options: [
    ["Shakes at idle", "rough idle shaking"], ["Stalls", "stalls"], ["Hesitates when I press the gas", "hesitates when accelerating"],
    ["No power uphill", "loses power uphill"], ["Revs but won't go faster", "engine revs but doesnt go faster"]] },
  { id: "brakes", emoji: "🛑", label: "Brakes", q: "What do the brakes do?", where: false, options: [
    ["Squeal", "squealing when braking", "squeal"], ["Grind", "grinding when braking", "grind"],
    ["Pedal pulses", "brake pedal pulses when stopping"], ["Soft or sinking pedal", "brake pedal soft sinks to the floor"],
    ["Pulls to one side", "pulls when braking one wheel hot"]] },
  { id: "tires", emoji: "🛞", label: "Tires", q: "What's going on with the tires?", where: false, options: [
    ["Tire light on", "tire pressure light on"], ["One looks low", "tire looks low"],
    ["Wearing on one edge", "tires wearing on the edge"], ["Bulge on the side", "bulge on the side of the tire shakes"],
    ["Shakes at highway speed", "shakes at highway speed tires"]] },
  { id: "steer", emoji: "🧭", label: "Steering", q: "What's the steering doing?", where: false, options: [
    ["Pulls to one side", "pulls to one side alignment"], ["Hard to turn", "steering hard to turn"],
    ["Loose / wanders", "steering loose sloppy wanders"], ["Clicks when turning", "clicking when turning", "cv_click"],
    ["Whines when turning", "whine when turning the wheel", "whine"]] },
];

// "Where is it coming from?" Tap a spot on the vehicle.
const ZONES = [
  ["fl", "Front left wheel", "from the front wheel"], ["engine", "Engine / hood", "from the engine"], ["fr", "Front right wheel", "from the front wheel"],
  ["dash", "Inside / dash", "from behind the dash"], ["middle", "Underneath, middle", "from under the middle of the truck"],
  ["rl", "Rear left wheel", "from the rear wheels"], ["exhaust", "Exhaust / back", "from the exhaust"], ["rr", "Rear right wheel", "from the rear wheels"],
];

const WHEN = [
  ["When starting", "when starting"], ["At idle", "at idle"], ["When braking", "when braking"],
  ["When turning", "when turning"], ["Speeding up", "when accelerating"], ["Highway speed", "at highway speed"],
  ["Over bumps", "over bumps"], ["Only when cold", "only when cold"],
];

const FRIENDLY = {
  __ac_water: "Good news: clear water dripping under the front after using the A/C is normal condensation. Nothing to fix.",
  __washer: "Blue fluid is almost always windshield washer fluid. A cracked washer tank or hose; cheap and easy to fix.",
};

function pickerTiles() {
  return el("div", { class: "tiles", role: "group", "aria-label": "What kind of problem?" },
    ...PICKER.map((cat) => el("button", { class: "tile", type: "button", onclick: (e) => openPicker(cat, e.currentTarget) },
      el("span", { class: "tile-emoji", "aria-hidden": "true" }, cat.emoji),
      el("span", {}, cat.label))));
}

// Runs the picker steps inside one chat bubble.
function openPicker(cat) {
  buzz();
  const state = { words: [], zone: "", when: new Set() };
  const box = el("div", { class: "picker" });
  addMsg("bot wide picker-msg", box);
  const steps = cat.where ? 3 : 2;

  const header = (n, q) => el("div", { class: "picker-head" },
    el("span", { class: "picker-cat" }, `${cat.emoji} ${cat.label}`),
    el("span", { class: "steps", role: "img", "aria-label": `Step ${n} of ${steps}` },
      ...Array.from({ length: steps }, (_, i) => el("span", { class: "step-dot" + (i < n ? " on" : "") }))),
    el("p", { class: "picker-q" }, q));

  const stepWhat = () => {
    box.replaceChildren(header(1, cat.q),
      // With example sounds, use one wide column so labels and speakers fit.
      el("div", { class: cat.options.some((o) => o[2]) ? "options list" : "options" }, ...cat.options.map(([label, words, sound]) => {
        const choose = el("button", { class: "option", type: "button", onclick: () => {
          buzz();
          stopSound();
          if (words.startsWith("__")) {
            box.replaceChildren(header(steps, cat.q), el("p", { class: "friendly" }, "💙 " + FRIENDLY[words]),
              chipRow(["New problem"], welcome));
            return;
          }
          state.words = [words];
          state.label = label;
          cat.where ? stepWhere() : stepWhen();
        } }, label);
        // Options with an example sound get a little speaker next to them.
        return sound ? el("div", { class: "option-wrap" }, choose, soundButton(sound, { label: false })) : choose;
      })));
    scrollChat(box.parentElement);
  };

  const stepWhere = () => {
    box.replaceChildren(header(2, "Where does it seem to come from?"),
      el("div", { class: "carmap", role: "group", "aria-label": "Tap where it comes from" },
        el("span", { class: "carmap-body", "aria-hidden": "true" }),
        ...ZONES.map(([id, label, words]) => el("button", { class: "zone zone-" + id, type: "button", onclick: () => {
          buzz();
          state.zone = words;
          stepWhen();
        } }, label))),
      el("button", { class: "btn small-btn ghost", type: "button", onclick: stepWhen }, "Not sure, skip"));
  };

  const stepWhen = () => {
    const go = el("button", { class: "btn primary", type: "button", onclick: () => {
      const text = [...state.words, state.zone, ...state.when].filter(Boolean).join(" ");
      box.closest(".msg").remove();
      sendMessage(text, `${cat.emoji} ${[state.label, ZONES.find((z) => z[2] === state.zone)?.[1].toLowerCase(), ...WHEN.filter((w) => state.when.has(w[1])).map((w) => w[0].toLowerCase())].filter(Boolean).join(", ")}`);
    } }, "Diagnose it");
    box.replaceChildren(header(steps, "When does it happen? Pick any that fit."),
      el("div", { class: "options" }, ...WHEN.map(([label, words]) => {
        const btn = el("button", { class: "option toggle", type: "button", "aria-pressed": "false", onclick: () => {
          buzz();
          const on = !state.when.has(words);
          on ? state.when.add(words) : state.when.delete(words);
          btn.setAttribute("aria-pressed", String(on));
        } }, label);
        return btn;
      })),
      el("div", { class: "picker-go" }, go));
    scrollChat(box.parentElement);
  };

  stepWhat();
}

// ===========================================================================
// 3. Match dial: a gauge needle that sweeps to the match %
// ===========================================================================

function dial(prob) {
  const pct = Math.round(prob * 100);
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 160 92");
  svg.setAttribute("class", "dial-svg");
  svg.setAttribute("aria-hidden", "true");
  const arc = "M14 84 A66 66 0 0 1 146 84";
  const make = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
    return node;
  };
  make("path", { d: arc, class: "dial-track", pathLength: "100" });
  const fill = make("path", { d: arc, class: "dial-fill", pathLength: "100" });
  // Tick marks every 25%.
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI - (i / 4) * Math.PI;
    make("line", { x1: 80 + 56 * Math.cos(a), y1: 84 - 56 * Math.sin(a), x2: 80 + 48 * Math.cos(a), y2: 84 - 48 * Math.sin(a), class: "dial-tick" });
  }
  const needle = make("g", { class: "dial-needle" });
  const line = document.createElementNS(NS, "line");
  for (const [k, v] of Object.entries({ x1: 80, y1: 84, x2: 80, y2: 30 })) line.setAttribute(k, v);
  needle.append(line);
  make("circle", { cx: 80, cy: 84, r: 6, class: "dial-hub" });
  // Sweep from 0 to the value (CSSOM styles are allowed by the CSP).
  needle.style.transform = "rotate(-90deg)";
  fill.style.strokeDashoffset = "100";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    needle.style.transform = `rotate(${-90 + 1.8 * pct}deg)`;
    fill.style.strokeDashoffset = String(100 - pct);
  }));
  const word = pct >= 80 ? "Strong match" : pct >= 50 ? "Likely" : "Possible";
  return el("div", { class: "dial", role: "img", "aria-label": `${pct}% match: ${word}` },
    svg,
    el("div", { class: "dial-read", "aria-hidden": "true" }, el("strong", {}, pct + "%"), el("span", {}, word)));
}

// ===========================================================================
// 4. Dash warning light guide
// ===========================================================================

// Simple drawings of each light (SVG paths on a 24x24 grid).
const LIGHTS = [
  { id: "engine", name: "Check engine", color: "amber",
    svg: '<path d="M4 10h2V8h3V6h6v2h2l2 2h2v6h-2l-2 2H8l-2-2H4z"/><path d="M1.5 10v6M9 4h6"/>',
    meaning: "The engine computer saved a trouble code. Steady = get it checked soon. Flashing = serious misfire; ease off and get it checked right away.",
    ask: "check engine light on" },
  { id: "battery", name: "Battery / charging", color: "red",
    svg: '<rect x="3" y="7" width="18" height="12" rx="1.5"/><path d="M7 7V5h2v2M15 7V5h2v2M6.5 13h3M15 11.5v3M13.5 13h3"/>',
    meaning: "The battery isn't being charged. You may have only minutes of driving left. Turn off extras and head to a shop.",
    ask: "battery light on while driving" },
  { id: "oil", name: "Oil pressure", color: "red",
    svg: '<path d="M3 13h9l4-3 5 1-6 5H5z"/><path d="M12 10V8M9 8h6M21 14.5c0 1-.7 1.7-1.5 1.7S18 15.5 18 14.5c0-.8 1.5-2.5 1.5-2.5s1.5 1.7 1.5 2.5z"/>',
    meaning: "Low oil pressure. Pull over and turn off the engine now; driving can destroy it. Check the oil level.",
    ask: "oil light on low oil pressure" },
  { id: "temp", name: "Engine temperature", color: "red",
    svg: '<path d="M12 3v11M12 6h3M12 9h3"/><circle cx="12" cy="16.5" r="2.5"/><path d="M3 20c2-1.5 4 1.5 6 0s4 1.5 6 0 4 1.5 6 0"/>',
    meaning: "The engine is too hot. Pull over, turn it off, and let it cool. Don't open the radiator cap hot.",
    ask: "temperature light on running hot" },
  { id: "brake", name: "Brake system", color: "red",
    svg: '<circle cx="12" cy="12" r="6"/><path d="M12 9v3.5M12 15v.1M4.5 6.5a9 9 0 0 0 0 11M19.5 6.5a9 9 0 0 1 0 11"/>',
    meaning: "The parking brake is on, or brake fluid is low. If the parking brake is off, get the brakes checked before driving.",
    ask: "brake warning light" },
  { id: "abs", name: "ABS", color: "amber",
    svg: '<circle cx="12" cy="12" r="7"/><path d="M3.5 6.5a10 10 0 0 0 0 11M20.5 6.5a10 10 0 0 1 0 11"/><text x="12" y="14.5" text-anchor="middle" font-size="6.5" font-weight="700" stroke="none" fill="currentColor">ABS</text>',
    meaning: "Anti-lock brakes are off. Normal brakes still work, but wheels can lock in hard stops. Often a wheel speed sensor.",
    ask: "abs light on" },
  { id: "tpms", name: "Tire pressure", color: "amber",
    svg: '<path d="M6 7c-2 3-2 7 0 10h12c2-3 2-7 0-10"/><path d="M5 19h14M12 9v4.5M12 15.5v.1"/>',
    meaning: "One or more tires are low. Check pressures (the number is on the driver's door sticker) and add air.",
    ask: "tire pressure light low tire" },
  { id: "airbag", name: "Airbag", color: "red",
    svg: '<circle cx="9" cy="5" r="2"/><path d="M9 8v6l4 3M6 11h4M14 6a6 6 0 0 1 6 6"/>',
    meaning: "The airbag system has a fault, so airbags may not deploy in a crash. Get it checked soon.",
    ask: null },
  { id: "traction", name: "Traction control", color: "amber",
    svg: '<path d="M5 13l2-4h10l2 4v3H5z"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><path d="M6 21c1.5-1.5 1.5-1.5 3 0M15 21c1.5-1.5 1.5-1.5 3 0"/>',
    meaning: "Flashing = it's working (slippery road). Steady = the system is off or has a fault; drive gently and get it checked.",
    ask: null },
];

function renderLights() {
  const grid = document.getElementById("lightGrid");
  const out = document.getElementById("lightResult");
  grid.replaceChildren(...LIGHTS.map((light) => {
    const btn = el("button", { class: "light-tile " + light.color, type: "button", "aria-label": light.name, onclick: () => {
      buzz();
      grid.querySelectorAll(".light-tile").forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      const card = el("article", { class: "card light-card " + light.color },
        el("h3", {}, light.name),
        el("p", {}, explain(light.meaning)),
        el("p", { class: "hint" }, light.color === "red" ? "Red lights mean stop soon." : "Yellow/orange lights mean get it checked soon."),
        light.ask ? el("button", { class: "btn primary", type: "button", onclick: () => {
          showTab("chat");
          if (session.done || session.messages.length) welcome();
          sendMessage(light.ask);
        } }, "Diagnose this light") : null);
      out.replaceChildren(card);
    } });
    btn.setAttribute("aria-pressed", "false");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "light-icon");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = light.svg; // fixed drawings from this file, never user text
    btn.append(svg, el("span", {}, light.name));
    return btn;
  }));
}

// ===========================================================================
// 5. Roadside help + find a mechanic near you
// ===========================================================================

// What kind of shop to search for, by problem.
const SHOP_TYPE = {
  transmission_problem: "transmission repair",
  worn_brake_pads: "brake repair", warped_rotors: "brake repair", brake_fluid_leak: "brake repair",
  tire_balance: "tire shop", alignment_problem: "wheel alignment",
  ac_problem: "auto AC repair", exhaust_leak: "muffler shop", catalytic_converter_problem: "muffler shop",
  bad_alternator: "auto electrical repair", bad_starter: "auto electrical repair", electrical_ground_problem: "auto electrical repair",
};

let lastCoords = null; // only kept while the app is open; never saved

function mapLinks(query) {
  const q = encodeURIComponent(query);
  if (lastCoords) {
    const { lat, lon } = lastCoords;
    return {
      apple: `https://maps.apple.com/?q=${q}&sll=${lat},${lon}&z=12`,
      google: `https://www.google.com/maps/search/${q}/@${lat},${lon},12z`,
    };
  }
  const zip = (document.getElementById("shopZip") || {}).value || "";
  const near = encodeURIComponent(`${query} near ${zip.trim() || "me"}`);
  return { apple: `https://maps.apple.com/?q=${near}`, google: `https://www.google.com/maps/search/?api=1&query=${near}` };
}

function openShopSheet(causeKey) {
  const cause = lookupCause(causeKey);
  const query = SHOP_TYPE[causeKey] || "auto repair";
  const sheet = document.getElementById("shopSheet");
  const status = el("p", { class: "hint", role: "status" });
  const links = el("div", { class: "btn-row" });
  const zip = el("input", { class: "input", id: "shopZip", inputmode: "numeric", maxlength: "10", placeholder: "ZIP or city", "aria-label": "ZIP code or city" });
  const refresh = () => {
    const l = mapLinks(query);
    links.replaceChildren(
      el("a", { class: "btn primary", href: l.apple, target: "_blank", rel: "noopener noreferrer" }, "Apple Maps"),
      el("a", { class: "btn", href: l.google, target: "_blank", rel: "noopener noreferrer" }, "Google Maps"));
  };
  zip.addEventListener("input", () => { lastCoords = null; refresh(); });
  const locate = el("button", { class: "btn", type: "button", onclick: () => {
    if (!navigator.geolocation) { status.textContent = "This browser can't share location. Type a ZIP instead."; return; }
    status.textContent = "Asking for your location…";
    navigator.geolocation.getCurrentPosition((pos) => {
      // Rounded to about half a mile: plenty for finding a shop.
      lastCoords = { lat: pos.coords.latitude.toFixed(2), lon: pos.coords.longitude.toFixed(2) };
      status.textContent = "Got it ✓ The map buttons now search near you.";
      refresh();
    }, () => {
      status.textContent = "No location shared. Type a ZIP or city instead, or just open Maps (it can use your location itself).";
    }, { timeout: 10000, maximumAge: 600000 });
  } }, "📍 Use my location");
  sheet.querySelector(".sheet-body").replaceChildren(
    el("h2", { class: "sheet-title" }, "Find a pro near you"),
    el("p", {}, `${cause.name} is a job for a ${query === "auto repair" ? "mechanic" : query.replace(" repair", "") + " shop"}. Search nearby shops and check their reviews.`),
    el("div", { class: "row" }, locate, zip),
    status,
    links,
    cause.severity === "critical" ? el("div", { class: "tow" },
      el("p", {}, el("strong", {}, "Shouldn't drive it? "), "Get a tow instead."),
      el("div", { class: "btn-row" },
        el("a", { class: "btn", href: mapLinks("tow truck").apple, target: "_blank", rel: "noopener noreferrer" }, "Find a tow truck"),
        el("button", { class: "btn", type: "button", onclick: openHelpSheet }, "Roadside help"))) : null,
    el("p", { class: "hint" }, "Your location is only used on this phone to build the map link. Apple or Google gets it when you open their map."));
  refresh();
  openSheet(sheet);
}

function openHelpSheet() {
  const shop = document.getElementById("shopSheet");
  if (shop.open) shop.close();
  openSheet(document.getElementById("helpSheet"));
}

function openSheet(sheet) {
  if (typeof sheet.showModal === "function") sheet.showModal();
  else sheet.setAttribute("open", "");
}

// Should the result card offer "find a pro"? Hard, shop-only, or dangerous.
function needsPro(cause) {
  return cause.severity === "critical" || cause.diy === "Shop" || cause.diy === "Hard" || cause.severity === "high";
}

// ===========================================================================
// 6. Little celebrations
// ===========================================================================

// A tiny vibration on Android phones (iPhones ignore it).
function buzz(ms = 12) {
  try { if (navigator.vibrate && !REDUCED_MOTION.matches) navigator.vibrate(ms); } catch (err) { /* not supported */ }
}

// A check mark that pops in after "That was it".
function celebrate(card) {
  buzz(30);
  const pop = el("div", { class: "pop", "aria-hidden": "true" }, "✓");
  card.append(pop);
  setTimeout(() => pop.remove(), 1200);
}

// Called from app.js once the data files are loaded.
function initFeatures(vehicles) {
  VEHICLES = vehicles;
  window.addEventListener("resize", moveTabIndicator);
  fillMakeModelLists(document.querySelector("#profileForm [name=make]"), document.getElementById("makeList"), document.getElementById("modelList"));
  setupLookup();
  renderMyIssues();
  renderLights();
  document.getElementById("helpBtn").addEventListener("click", openHelpSheet);
  for (const sheet of document.querySelectorAll(".sheet")) {
    sheet.querySelector(".sheet-close").addEventListener("click", () => sheet.close());
    // Tap outside the sheet to close it.
    sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  }
}

// ===========================================================================
// 7. Smart follow-up questions
// When two or three problems look alike, ask ONE simple question that tells
// them apart. Everyday questions anyone can answer: no tools, no jargon.
// "about" = the problems this question helps separate.
// "always" questions are asked whenever the top guess is in "about", unless
// the description already contains one of the "skipIf" words.
// Each option is [what the person taps, words added to the description].
// Empty words = "no / not sure": nothing is added, we just move on.
// ===========================================================================

const QUESTIONS = [
  { id: "start_sound", q: "What happens when you turn the key (or press Start)?",
    about: ["dead_battery", "bad_starter", "fuel_delivery_problem", "key_ignition_problem"],
    options: [["Fast clicking", "fast clicking wont start"], ["One loud click", "one click no crank"],
      ["Engine turns over but won't catch", "cranks but wont start"], ["Nothing, or the key won't turn", "key wont turn not detected"]] },
  { id: "dash_lights", q: "When you try to start it, what do the dashboard lights do?",
    about: ["dead_battery", "bad_starter", "fuel_delivery_problem", "electrical_ground_problem", "key_ignition_problem"],
    options: [["Stay bright", "lights stay bright"], ["Go dim or flicker", "lights dim flicker"],
      ["Don't come on at all", "no lights at all dead"], ["Not sure", ""]] },
  { id: "battery_light", q: "Did a battery-shaped light come on while you were driving?",
    about: ["bad_alternator", "dead_battery", "worn_serpentine_belt", "electrical_ground_problem"],
    options: [["Yes, while driving", "battery light on while driving"], ["No, it died while parked", "died while parked sitting"], ["Not sure", ""]] },
  { id: "pedal_feel", q: "How does the brake pedal feel?",
    about: ["worn_brake_pads", "warped_rotors", "brake_fluid_leak", "sticking_brake_caliper", "abs_sensor_problem"],
    options: [["Normal", "brake pedal normal"], ["It pulses or shakes", "brake pedal pulses"],
      ["Soft, or sinks down", "brake pedal soft sinks"], ["Normal, but it pulls to one side", "pulls to one side one wheel hot"]] },
  { id: "speed_or_rev", q: "Does it change with how fast you're going, or when you rev the engine while parked?",
    about: ["bad_wheel_bearing", "tire_balance", "worn_u_joint", "power_steering_problem", "worn_serpentine_belt", "bad_alternator", "exhaust_leak", "transmission_problem"],
    options: [["Faster driving = louder", "louder with speed"], ["Revving while parked = louder", "louder when revving the engine rpm"],
      ["Only when turning", "when turning"], ["Not sure", ""]] },
  { id: "turn_sound", q: "When you turn the steering wheel, what do you hear?",
    about: ["worn_cv_axle", "power_steering_problem", "bad_wheel_bearing", "worn_suspension"],
    options: [["Clicking", "clicking when turning"], ["Whining or groaning", "whine when turning the wheel"],
      ["A hum that changes", "hum changes when turning"], ["A clunk", "clunk when turning"]] },
  { id: "temp_needle", q: "Where is the temperature needle on your dash?",
    about: ["overheating", "thermostat_stuck_open", "head_gasket_failure", "heater_core_problem"],
    options: [["High, near H or red", "temperature gauge high red"], ["Low, never warms up", "temp gauge stays low"],
      ["In the middle, normal", "temp gauge normal"]] },
  { id: "smoke", q: "Any smoke from the tailpipe?",
    about: ["head_gasket_failure", "overheating", "oil_leak_low_oil", "catalytic_converter_problem", "engine_misfire"],
    options: [["White, smells sweet", "white smoke sweet smell"], ["Blue-gray", "blue smoke burning oil"],
      ["Black", "black smoke"], ["No smoke", ""]] },
  { id: "engine_light", q: "Is the check engine light on?",
    about: ["engine_misfire", "dirty_maf_sensor", "vacuum_leak", "fuel_delivery_problem", "evap_leak", "catalytic_converter_problem", "timing_chain_problem", "bad_motor_mounts"],
    options: [["Yes, flashing", "check engine light flashing"], ["Yes, steady", "check engine light on"], ["No", ""]] },
  { id: "rough_when", q: "When is it worst?",
    about: ["engine_misfire", "dirty_maf_sensor", "vacuum_leak", "fuel_delivery_problem", "bad_motor_mounts"],
    options: [["Sitting still at idle", "at idle"], ["When I press the gas", "when accelerating hesitates"],
      ["Highway or going uphill", "highway uphill loses power"]] },
  { id: "shake_when", q: "When do you feel the shaking?",
    about: ["tire_balance", "warped_rotors", "worn_suspension", "worn_u_joint", "bad_motor_mounts", "engine_misfire", "bad_wheel_bearing"],
    options: [["Only when braking", "shakes when braking"], ["At a certain speed", "shakes at highway speed"],
      ["Stopped at a light", "shakes at idle in drive"], ["Over bumps", "over bumps"]] },
  { id: "startup_length", q: "How long does the noise last after you start it?",
    about: ["timing_chain_problem", "worn_serpentine_belt", "exhaust_leak", "bad_starter"],
    options: [["Just a few seconds", "rattle few seconds at startup"], ["Until the engine warms up", "until warm when cold"],
      ["A squeal that fades", "squeal at startup belt"], ["The whole time", ""]] },
  { id: "clunk_when", q: "When does the clunk happen?",
    about: ["worn_u_joint", "bad_motor_mounts", "worn_suspension", "transmission_problem", "worn_cv_axle"],
    options: [["Shifting into drive or reverse", "clunk shifting into drive reverse"], ["Over bumps", "clunk over bumps"],
      ["When I step on the gas", "clunk when accelerating"], ["When turning", "clunk when turning"]] },
  { id: "manual", q: "Do you drive a stick shift (with a clutch pedal)?",
    about: ["clutch_problem", "transmission_problem"],
    // The model can't guess this, so always ask unless they already said.
    always: true, skipIf: ["manual", "stick", "clutch", "automatic"],
    options: [["Yes, stick shift", "manual stick shift clutch"], ["No, automatic", "automatic transmission"]] },
  { id: "vent_air", q: "Is air coming out of the vents?",
    about: ["ac_problem", "blower_motor_problem", "heater_core_problem", "thermostat_stuck_open"],
    options: [["Yes, but it's not cold", "air blowing but ac not cold"], ["Only on the highest fan setting", "fan only works on high"],
      ["Barely or none", "no air from vents"], ["Yes, but the heat is weak", "heat lukewarm"]] },
  { id: "after_gas", q: "Did the light come on right after you got gas?",
    about: ["evap_leak", "catalytic_converter_problem", "engine_misfire"],
    options: [["Yes", "after getting gas cap"], ["No", ""]] },
  { id: "leak_color", q: "What color is the drip?",
    about: ["oil_leak_low_oil", "transmission_problem", "power_steering_problem", "brake_fluid_leak", "overheating", "heater_core_problem"],
    options: [["Brown or black", "oil leak brown"], ["Red", "red fluid leak"], ["Green, orange or pink", "coolant leak green"],
      ["Clear and slippery", "clear slippery brake fluid"]] },
  { id: "pull_check", q: "Look at your tires and wheels. Anything stand out?",
    about: ["alignment_problem", "low_tire_pressure", "sticking_brake_caliper", "tire_balance"],
    options: [["One tire looks low", "tire looks low"], ["One wheel is hot or smells burnt", "one wheel hot burning smell"],
      ["Nope, they look fine", "pulls after pothole alignment"]] },
];

const MAX_QUESTIONS = 3; // per problem, so it never feels like a quiz

// Picks the best question for the current top guesses, or null.
function pickQuestion(top, usefulWords) {
  if (session.asked.size >= MAX_QUESTIONS) return null;
  const best = top[0];
  const second = top[1];
  const unsure = best.prob < 0.75 || (second && second.prob > 0.12) || usefulWords < 2;
  const labels = top.map((g) => g.label);
  const said = new Set(tokenize(sessionText()));
  for (const q of QUESTIONS) {
    if (q.always && !session.asked.has(q.id) && q.about.includes(best.label) && !q.skipIf.some((w) => said.has(w))) return q;
  }
  let pick = null;
  let score = 0;
  for (const q of QUESTIONS) {
    if (!unsure) break;
    if (session.asked.has(q.id) || q.always) continue;
    const hits = labels.filter((l) => q.about.includes(l)).length;
    // Must touch the top guess and at least one other, to tell them apart.
    if (!q.about.includes(best.label) || hits < 2) continue;
    if (hits > score) { score = hits; pick = q; }
  }
  return pick;
}

function questionBlock(q) {
  const block = el("div", { class: "followup quick-q" },
    el("p", { class: "eyebrow" }, "Quick question"),
    el("p", { class: "quick-q-text" }, q.q));
  block.append(el("div", { class: "options" }, ...q.options.map(([label, words]) =>
    el("button", { class: "option", type: "button", onclick: () => {
      buzz();
      session.asked.add(q.id);
      block.remove();
      answerQuestion(label, words);
    } }, label))));
  return block;
}

// ===========================================================================
// 8. Personal touch: check in about the last answer, and remember fixes
// ===========================================================================

// Saved when we show a result, so next visit we can ask how it went.
function rememberGuess(label) {
  const old = load(KEYS.pending, {});
  save(KEYS.pending, {
    label,
    text: sessionText(),          // the words the model used (for teaching)
    said: session.shown[0] || "", // what the person actually typed or tapped first
    at: Date.now(),
    asks: old.label === label ? old.asks || 0 : 0,
  });
}

function clearGuess() {
  forget(KEYS.pending);
}

// "Hey, welcome back! Last time I thought ... Did I get it right?"
// Only after at least 30 minutes, and at most twice per guess.
function checkInBubble() {
  const p = load(KEYS.pending, null);
  if (!p || !p.label || !CAUSES[p.label] || Date.now() - p.at < 30 * 60000 || (p.asks || 0) >= 2) return null;
  const name = CAUSES[p.label].name.toLowerCase();
  const words = p.said || p.text;
  const said = words.length > 60 ? words.slice(0, 57) + "…" : words;
  const box = el("div", { class: "checkin" });
  const done = (...children) => box.replaceChildren(...children);
  box.append(
    el("p", { class: "lead" }, "Welcome back! 👋"),
    el("p", {}, "Last time you said “", el("em", {}, said), "” and I guessed ", el("strong", {}, name), ". Did I get it right?"),
    el("div", { class: "options three" },
      el("button", { class: "option yes", type: "button", onclick: () => {
        celebrate(box);
        addTraining(p.label, p.text);
        const profile = load(KEYS.profile, {});
        addLogEntry({ date: localDate(), mileage: profile.mileage || "", note: `${CAUSES[p.label].name} (confirmed): ${p.text}` });
        clearGuess();
        done(el("p", {}, "Yay! 🎉 Thanks for telling me. I'll remember that, and I added it to your repair log."));
      } }, "👍 Spot on"),
      el("button", { class: "option", type: "button", onclick: () => {
        const select = el("select", { class: "input", "aria-label": "What was it really?" },
          el("option", { value: "" }, "What was it really?"),
          ...Object.entries(CAUSES).sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([key, c]) => el("option", { value: key }, c.name)));
        done(el("p", {}, "Thanks for being honest! What was it really?"), select,
          el("div", { class: "btn-row" },
            el("button", { class: "btn primary", type: "button", onclick: () => {
              if (!select.value) { select.focus(); return; }
              addTraining(select.value, p.text);
              clearGuess();
              done(el("p", {}, `Got it: ${CAUSES[select.value].name}. I'll do better next time. 💪`));
            } }, "Save"),
            el("button", { class: "btn", type: "button", onclick: () => {
              clearGuess();
              done(el("p", {}, "No worries. Hope it gets sorted out soon!"));
            } }, "Still don't know")));
        select.focus();
      } }, "👎 Not quite"),
      el("button", { class: "option", type: "button", onclick: () => {
        save(KEYS.pending, { ...p, at: Date.now(), asks: (p.asks || 0) + 1 });
        done(el("p", {}, "No problem! I'll check back later. 🙂"));
      } }, "🤷 Not sure yet")),
    el("button", { class: "linklike", type: "button", onclick: () => { clearGuess(); box.closest(".msg").remove(); } }, "Don't ask about this one"));
  return box;
}

// Personal memory: if this sounds like a problem you confirmed before,
// lean toward it (word overlap with your past answers, max +1.5).
function personalMatch(text) {
  const words = new Set(tokenize(text).filter((t) => !t.includes("_")));
  if (!words.size) return { boosts: {}, best: null };
  const boosts = {};
  let best = null;
  for (const ex of load(KEYS.training, [])) {
    const theirs = new Set(tokenize(ex.text || "").filter((t) => !t.includes("_")));
    if (!theirs.size) continue;
    let shared = 0;
    for (const w of words) if (theirs.has(w)) shared++;
    const similarity = shared / (words.size + theirs.size - shared);
    if (similarity < 0.3) continue;
    boosts[ex.label] = Math.max(boosts[ex.label] || 0, 1.5 * similarity);
    if (!best || similarity > best.similarity) best = { ...ex, similarity };
  }
  return { boosts, best };
}

function seenBefore(label) {
  const { best } = personalMatch(sessionText());
  if (!best || best.label !== label) return null;
  return el("div", { class: "seen-before" },
    el("span", { "aria-hidden": "true" }, "💙"),
    el("span", {}, best.date ? `This sounds like the ${CAUSES[label].name.toLowerCase()} you had on ${prettyDate(best.date)}.` : `This sounds like a ${CAUSES[label].name.toLowerCase()} you've had before.`));
}

// ===========================================================================
// 9. Glowing circuits (decoration) and the sliding tab highlight
// ===========================================================================

// Draws faint circuit traces behind the app with little lights running along
// some of them. Same style as the Caylor Made Technologies website.
function buildCircuits() {
  const NS = "http://www.w3.org/2000/svg";
  const W = 400, H = 860;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const snap = (n) => Math.round(n / 8) * 8;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const add = (parent, tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.append(node);
    return node;
  };
  const traces = add(svg, "g", { class: "traces" });
  const pulses = add(svg, "g", { class: "pulses" });
  for (let i = 0; i < 16; i++) {
    const left = i % 2 === 0;
    const dir = left ? 1 : -1;
    const y0 = snap(30 + rand() * (H - 60));
    const x0 = left ? -10 : W + 10;
    const x1 = x0 + dir * snap(40 + rand() * 110);
    const jog = snap(16 + rand() * 50) * (rand() > 0.5 ? 1 : -1);
    const x2 = x1 + dir * Math.abs(jog);
    const x3 = x2 + dir * snap(30 + rand() * 90);
    const d = `M${x0} ${y0} H${x1} L${x2} ${y0 + jog} H${x3}`;
    add(traces, "path", { d });
    add(traces, "circle", { cx: x3, cy: y0 + jog, r: 3 });
    if (i % 2 === 0) {
      const p = add(pulses, "path", { d, pathLength: "100", class: "pulse p" + (i % 6) });
      p.style.animationDelay = `${(rand() * 6).toFixed(2)}s`;
    }
  }
  document.getElementById("circuits").append(svg);
}

// A quick brighten when a diagnosis appears.
function flashCircuits() {
  const layer = document.getElementById("circuits");
  if (!layer || REDUCED_MOTION.matches) return;
  layer.classList.remove("flash");
  void layer.offsetWidth;
  layer.classList.add("flash");
  setTimeout(() => layer.classList.remove("flash"), 1100);
}

// Moves the glowing pill under the active tab.
function moveTabIndicator() {
  const active = document.querySelector('.tabbar button[aria-selected="true"]');
  const pill = document.querySelector(".tab-indicator");
  if (!active || !pill) return;
  const width = 52;
  pill.style.width = width + "px";
  pill.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - width) / 2}px)`;
}
