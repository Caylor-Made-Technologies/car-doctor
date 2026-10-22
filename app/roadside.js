/* Car Doctor: roadside help numbers for every US state.
 *
 * 911 is always shown first. These are the extra, official numbers each
 * state's highway patrol or DOT gives drivers (checked October 2026 on the
 * state's own sites or its news releases). Where the state's own advice is
 * "call 911 if you're stuck", there are no extra numbers: that's the answer.
 *
 * Each entry: [code, name, [[what to dial, what it's for], ...], extra note].
 * Star (*) and pound (#) codes only work from a cell phone in that state.
 */

const ROADSIDE = [
  ["AL", "Alabama", [["*47", "Alabama State Troopers (*HP), 24/7 highway help"]]],
  ["AK", "Alaska", [], "Call 911. Alaska State Troopers dispatch help from there. Cell service is spotty between towns, so tell someone your route."],
  ["AZ", "Arizona", [], "Arizona DPS says to call 911 if you're stranded on the highway."],
  ["AR", "Arkansas", [["*277", "Arkansas State Police (*ASP), non-emergency highway help"]]],
  ["CA", "California", [], "Call 911 to reach the CHP. On busy metro freeways, free Freeway Service Patrol trucks drive by at commute hours and help with flats, gas and jump-starts."],
  ["CO", "Colorado", [["*277", "Colorado State Patrol (*CSP), 24/7"], ["303-239-4501", "Colorado State Patrol dispatch"]]],
  ["CT", "Connecticut", [], "Call 911. State Police can send the free CTDOT Highway Safety Patrol on major highways."],
  ["DE", "Delaware", [["#77", "DelDOT traffic center, 24/7: breakdowns and road problems"], ["302-659-4600", "DelDOT traffic center"]]],
  ["DC", "District of Columbia", [], "Call 911 for a crash or danger."],
  ["FL", "Florida", [["*347", "Florida Highway Patrol (*FHP). Also sends free Road Rangers on major highways"]]],
  ["GA", "Georgia", [["*477", "Georgia State Patrol (*GSP), highway emergencies"], ["511", "Press 1 for free HERO or CHAMP roadside help (flats, gas, jump-starts)"]]],
  ["HI", "Hawaii", [["808-841-4357", "Oahu Freeway Service Patrol (841-HELP), free. Weekdays 5am to 7pm on H-1, H-2 and H-201"]]],
  ["ID", "Idaho", [["*477", "Idaho State Police (*ISP)"], ["1-800-233-1212", "Idaho State Police"]]],
  ["IL", "Illinois", [["*999", "Illinois Tollway roadside help, 24/7 (toll roads only)"]], "On other highways call 911. 911 can send IDOT's free Minuteman trucks in the Chicago area."],
  ["IN", "Indiana", [["855-463-6848", "INDOT (855-INDOT4U). Sends free Hoosier Helper trucks in metro areas"]]],
  ["IA", "Iowa", [["1-800-525-5555", "Iowa State Patrol, 24/7"]]],
  ["KS", "Kansas", [["*47", "Kansas Highway Patrol (*HP)"], ["*582", "Kansas Turnpike (*KTA)"]]],
  ["KY", "Kentucky", [["1-800-222-5555", "Kentucky State Police, 24/7"]]],
  ["LA", "Louisiana", [["*577", "Louisiana State Police (*LSP)"]]],
  ["ME", "Maine", [["207-871-7701", "Maine Turnpike traffic center, 24/7. Sends the free Turnpike Safety Patrol"]], "Off the Turnpike, call 911."],
  ["MD", "Maryland", [["#77", "Maryland State Police, non-emergency highway help"]]],
  ["MA", "Massachusetts", [], "Call 911. State Police dispatch help on highways (*77 no longer works)."],
  ["MI", "Michigan", [], "Call 911. MDOT's free freeway patrol trucks can't be called directly."],
  ["MN", "Minnesota", [], "Call 911. It can send a free MnDOT FIRST truck on metro freeways."],
  ["MS", "Mississippi", [["*47", "Mississippi Highway Patrol (*HP)"]]],
  ["MO", "Missouri", [["*55", "Missouri State Highway Patrol, nearest troop"], ["1-800-525-5555", "Missouri State Highway Patrol"]]],
  ["MT", "Montana", [["1-855-647-3777", "Montana Highway Patrol dispatch (855-MHP-3777), 24/7"]]],
  ["NE", "Nebraska", [["*55", "Nebraska State Patrol Highway Helpline, 24/7"], ["1-800-525-5555", "Nebraska State Patrol Highway Helpline"]]],
  ["NV", "Nevada", [["*647", "Nevada Highway Patrol (*NHP)"]]],
  ["NH", "New Hampshire", [], "Call 911."],
  ["NJ", "New Jersey", [], "Call 911."],
  ["NM", "New Mexico", [], "Call 911."],
  ["NY", "New York", [["1-800-842-2233", "Thruway emergencies and breakdowns (Thruway only)"]], "On other roads call 911."],
  ["NC", "North Carolina", [["*47", "Highway Patrol (*HP). Also sends free NCDOT Safety Patrol trucks"]]],
  ["ND", "North Dakota", [["1-800-472-2121", "State Radio (state dispatch), non-emergency"]]],
  ["OH", "Ohio", [["#677", "Ohio State Highway Patrol (#OHP), nearest post"]]],
  ["OK", "Oklahoma", [], "Call 911. It goes to the Highway Patrol (*55 was retired)."],
  ["OR", "Oregon", [["*677", "Oregon State Police (*OSP), non-emergency highway help"], ["1-800-452-7888", "Oregon State Police, if *677 doesn't work on your carrier"]]],
  ["PA", "Pennsylvania", [["*11", "PA Turnpike emergencies and breakdowns (Turnpike only)"], ["1-800-932-0586", "PA Turnpike"]], "On other roads call 911."],
  ["RI", "Rhode Island", [], "Call 911 for any highway emergency (*77 was replaced by 911)."],
  ["SC", "South Carolina", [["*47", "Highway Patrol (*HP). Also sends free SCDOT SHEP trucks (flats, gas, jump-starts)"]]],
  ["SD", "South Dakota", [], "SD Public Safety says to call 911 if you need help on the road."],
  ["TN", "Tennessee", [["*847", "Tennessee Highway Patrol (*THP), 24/7. Sends free TDOT HELP trucks in big cities"]]],
  ["TX", "Texas", [["1-800-525-5555", "Texas DPS roadside help, 24/7. It's on the back of your Texas driver license"], ["#999", "North Texas toll roads (NTTA) roadside help"]]],
  ["UT", "Utah", [], "Call 911. The Highway Patrol sends free UDOT Incident Management trucks on Wasatch Front freeways."],
  ["VT", "Vermont", [], "Call 911. Cell service is spotty in the mountains."],
  ["VA", "Virginia", [["#77", "Virginia State Police, highways and interstates"]]],
  ["WA", "Washington", [], "WSDOT says to call 911 for roadside help. It sends the free Incident Response Team on busy highways."],
  ["WV", "West Virginia", [["*77", "WV Turnpike State Police and Courtesy Patrol (*SP), 24/7 (Turnpike only)"]], "On other roads call 911."],
  ["WI", "Wisconsin", [["1-844-847-1234", "Wisconsin State Patrol, 24/7 non-emergency"]]],
  ["WY", "Wyoming", [["1-800-442-9090", "Wyoming Highway Patrol dispatch, 24/7"]]],
];

const STATES = new Map(ROADSIDE.map(([code, name, numbers, note]) => [code, { code, name, numbers, note }]));

// tel: links need # written as %23.
function telHref(dial) {
  return "tel:" + dial.replace(/[^0-9*#]/g, "").replace(/#/g, "%23");
}

function savedState() {
  const code = load(KEYS.state, null);
  return STATES.has(code) ? code : null;
}

function setState(code) {
  save(KEYS.state, STATES.has(code) ? code : "");
  renderRoadside();
}

function stateOptions(select, chosen) {
  select.replaceChildren(
    el("option", { value: "" }, "Choose your state"),
    ...ROADSIDE.map(([code, name]) => el("option", { value: code }, name)));
  select.value = chosen || "";
}

// Fills the Help sheet with the chosen state's numbers.
function renderRoadside() {
  const code = savedState();
  const box = document.getElementById("stateNumbers");
  for (const select of document.querySelectorAll(".state-select")) select.value = code || "";
  if (!code) {
    box.replaceChildren(el("p", { class: "hint" }, "Pick your state above to see its highway patrol roadside numbers."));
    return;
  }
  const s = STATES.get(code);
  const short = s.numbers.some(([dial]) => /[*#]/.test(dial));
  box.replaceChildren(...[
    ...s.numbers.map(([dial, label]) => el("a", { class: "call", href: telHref(dial) }, el("strong", {}, dial), el("span", {}, label))),
    s.note ? el("p", { class: "state-note" }, s.note) : null,
    !s.numbers.length && !s.note ? el("p", { class: "state-note" }, "Call 911.") : null,
    short ? el("p", { class: "hint" }, "Star and pound codes only work from a cell phone. If tapping doesn't dial, type it in your Phone app.") : null,
  ].filter(Boolean));
}

// First start: ask which state, so Roadside help is ready before it's needed.
function askStateOnce() {
  if (load(KEYS.state, null) !== null) return;
  const sheet = document.getElementById("stateSheet");
  const select = document.getElementById("firstState");
  const done = (code) => { setState(code); sheet.close(); };
  document.getElementById("stateSave").addEventListener("click", () => done(select.value));
  document.getElementById("stateSkip").addEventListener("click", () => done(""));
  // Closing it any other way (Esc, tap outside, X) counts as "Not now".
  sheet.addEventListener("close", () => { if (load(KEYS.state, null) === null) save(KEYS.state, ""); });
  openSheet(sheet);
}

function setupRoadside() {
  for (const select of document.querySelectorAll(".state-select")) {
    stateOptions(select, savedState());
    if (select.id !== "firstState") select.addEventListener("change", () => setState(select.value));
  }
  renderRoadside();
  askStateOnce();
}
