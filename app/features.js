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
  { id: "noise", emoji: "🔊", label: "A noise", q: "What does it sound like?", where: true, options: [
    ["Grinding", "grinding noise"], ["Squealing", "squealing noise"], ["Clicking", "clicking noise"],
    ["Humming / growling", "humming noise"], ["Ticking", "ticking noise"], ["Clunking", "clunk"],
    ["Rattling", "rattle"], ["Whining", "whining noise"], ["Hissing", "hissing noise"]] },
  { id: "shake", emoji: "📳", label: "Shaking", q: "What shakes?", where: false, options: [
    ["Steering wheel", "steering wheel shakes"], ["Whole vehicle", "whole truck shakes vibration"],
    ["Brake pedal pulses", "brake pedal pulses"], ["Engine at idle", "engine shakes at idle rough"]] },
  { id: "smell", emoji: "👃", label: "A smell", q: "What does it smell like?", where: false, options: [
    ["Burning oil", "burning oil smell"], ["Sweet, like syrup", "sweet smell coolant leak"],
    ["Rotten eggs", "rotten egg smell"], ["Gasoline", "gas smell near the tank"],
    ["Exhaust inside", "exhaust smell in the cab"], ["Burning electrical", "burning electrical smell battery light"],
    ["Musty vents", "musty smell from the ac vents"]] },
  { id: "light", emoji: "💡", label: "Warning light", q: "Which light is on?", where: false, options: [
    ["Check engine (flashing)", "check engine light flashing misfire"], ["Check engine (steady)", "check engine light on runs fine gas cap"],
    ["Battery", "battery light on while driving"], ["Oil", "oil light on low oil pressure"],
    ["Temperature", "temperature light on running hot"], ["Brake", "brake warning light"],
    ["ABS", "abs light on wheel"]] },
  { id: "nostart", emoji: "🔑", label: "Won't start", q: "What happens when you turn the key?", where: false, options: [
    ["Fast clicking", "clicks fast wont start dim lights"], ["One loud click", "one click no crank lights bright"],
    ["Cranks, won't start", "cranks but wont start"], ["Cranks slowly", "slow crank"],
    ["Nothing at all", "nothing happens no lights dead"]] },
  { id: "leak", emoji: "💧", label: "A leak", q: "What color is the fluid?", where: false, options: [
    ["Brown or black", "oil leak brown drip under the engine"], ["Red", "red fluid leaking"],
    ["Green, orange or pink", "coolant leak green sweet smell"], ["Clear and slippery", "clear slippery fluid leaking near the wheel brake"],
    ["Clear water, front", "__ac_water"], ["Blue", "__washer"]] },
  { id: "hot", emoji: "🌡️", label: "Running hot", q: "What's happening?", where: false, options: [
    ["Gauge in the red", "temperature gauge in the red"], ["Steam from the hood", "steam from under the hood"],
    ["Losing coolant", "losing coolant"], ["White smoke, milky oil", "white smoke milky oil"],
    ["Heater blows cold", "heater blows cold"]] },
  { id: "brakes", emoji: "🛑", label: "Brakes", q: "What do the brakes do?", where: false, options: [
    ["Squeal", "squealing when braking"], ["Grind", "grinding when braking"],
    ["Pedal pulses", "brake pedal pulses when stopping"], ["Soft or sinking pedal", "brake pedal soft sinks to the floor"],
    ["Pulls to one side", "pulls when braking"]] },
  { id: "steer", emoji: "🛞", label: "Steering", q: "What's the steering doing?", where: false, options: [
    ["Pulls to one side", "pulls to one side alignment"], ["Hard to turn", "steering hard to turn"],
    ["Loose / wanders", "steering loose sloppy wanders"], ["Clicks when turning", "clicking when turning"],
    ["Whines when turning", "whine when turning the wheel"]] },
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
      el("div", { class: "options" }, ...cat.options.map(([label, words]) =>
        el("button", { class: "option", type: "button", onclick: () => {
          buzz();
          if (words.startsWith("__")) {
            box.replaceChildren(header(steps, cat.q), el("p", { class: "friendly" }, "💙 " + FRIENDLY[words]),
              chipRow(["New problem"], welcome));
            return;
          }
          state.words = [words];
          cat.where ? stepWhere() : stepWhen();
        } }, label))));
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
      sendMessage(text);
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
