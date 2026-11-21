// "Where to look": the engine bay with the diagnosed part lit up.
// A flat drawing of the same bay paints at once (and stays on weak devices, without WebGL or with
// Reduce Motion on). On capable devices the 3D view (app/3d/engine-bay.js) loads after first paint
// and fades in over it. Only one 3D view is alive at a time; older result cards keep their drawing.
import { afterFirstPaint, decide3D, forcedMode, probeDevice } from "./ui/support.js";

const { PARTS, partFor } = window.CarParts;
const NS = "http://www.w3.org/2000/svg";
let live = null; // { view, figure }

/** Isometric projection matching the 3D overview camera (front-right, above). */
const iso = (x, y, z) => [(x - z) * 0.866 * 100, (-y + (x + z) * 0.5) * 100];

function svgEl(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** The flat drawing: each part as a shaded box, far to near, the lit part in amber. */
export function drawing(partId) {
  const svg = svgEl("svg", { class: "bay-svg", "aria-hidden": "true", focusable: "false", preserveAspectRatio: "xMidYMid meet" });
  // Far to near; the lit part is drawn last so nothing hides it (an x-ray view, like a service manual).
  const order = Object.entries(PARTS).filter(([id]) => id !== "body" || id === partId)
    .sort((a, b) => (a[0] === partId) - (b[0] === partId) || (a[1].pos[0] + a[1].pos[1] + a[1].pos[2]) - (b[1].pos[0] + b[1].pos[1] + b[1].pos[2]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const shapes = [];
  for (const [id, p] of order) {
    const [cx, cy, cz] = p.pos;
    const [hx, hy, hz] = p.size.map((s) => s / 2);
    const P = (dx, dy, dz) => {
      const [x, y] = iso(cx + dx * hx, cy + dy * hy, cz + dz * hz);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      return x.toFixed(1) + "," + y.toFixed(1);
    };
    const g = svgEl("g", { class: "bay-part bay-" + p.mat + (id === partId ? " bay-lit" : "") });
    g.append(
      svgEl("polygon", { class: "f-top", points: [P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)].join(" ") }),
      svgEl("polygon", { class: "f-side", points: [P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), P(1, -1, -1)].join(" ") }),
      svgEl("polygon", { class: "f-front", points: [P(-1, 1, 1), P(1, 1, 1), P(1, -1, 1), P(-1, -1, 1)].join(" ") }));
    shapes.push(g);
  }
  const pad = 14;
  svg.setAttribute("viewBox", [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad].map((n) => n.toFixed(0)).join(" "));
  svg.append(svgEl("ellipse", { cx: ((minX + maxX) / 2).toFixed(0), cy: (maxY - 18).toFixed(0), rx: ((maxX - minX) / 2).toFixed(0), ry: 40, class: "bay-floor" }), ...shapes);
  return svg;
}

/**
 * A "Where to look" figure for a diagnosis label. `meter` (optional node) sits on the caption row.
 * @param {string} label diagnosis label from the model
 */
export function createBay(label, meter) {
  const partId = partFor(label);
  const part = PARTS[partId];
  const stage = document.createElement("div");
  stage.className = "stage3d bay-stage";
  stage.append(drawing(partId));
  const caption = document.createElement("figcaption");
  caption.className = "bay-caption";
  const text = document.createElement("div");
  text.className = "bay-text";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Where to look";
  const name = document.createElement("p");
  name.className = "bay-name";
  name.textContent = part ? part.label : "Not tied to one part";
  const where = document.createElement("p");
  where.className = "bay-where";
  where.textContent = part ? part.where.charAt(0).toUpperCase() + part.where.slice(1) + "." : "This one can come from several places. Start with the checks below.";
  text.append(eyebrow, name, where);
  caption.append(text);
  if (meter) caption.append(meter);
  const figure = document.createElement("figure");
  figure.className = "bay";
  figure.setAttribute("role", "group");
  figure.setAttribute("aria-label", part ? `Where to look: ${part.label}` : "Where to look: not tied to one part");
  figure.append(stage, caption);
  start3D(figure, stage, partId);
  return figure;
}

async function start3D(figure, stage, partId) {
  const gate = decide3D(probeDevice(), forcedMode());
  figure.dataset.mode = gate.use3D ? "3d-pending" : "2d:" + gate.reason;
  if (!gate.use3D) return;
  await afterFirstPaint();
  if (!figure.isConnected) return;
  try {
    const mod = await import("./3d/engine-bay.js");
    if (!figure.isConnected) return;
    if (live) { live.view.dispose(); live.figure.dataset.mode = "2d:replaced"; live.canvas.remove(); live = null; }
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    stage.append(canvas);
    const view = mod.mount(canvas, {
      parts: PARTS, partId,
      onLost: () => { view.dispose(); canvas.remove(); figure.dataset.mode = "2d:context-lost"; live = null; },
    });
    live = { view, figure, canvas };
    requestAnimationFrame(() => { stage.dataset.live = "true"; });
    figure.dataset.mode = "3d";
    if (location.search.includes("debug3d")) window.__bay3d = view;
  } catch (err) {
    figure.dataset.mode = "2d:load-failed"; // offline before the 3D file was cached, or no module support
  }
}

/** Free the live 3D view (Delete all my data, leaving the chat). */
export function disposeBay() {
  if (!live) return;
  live.view.dispose(); live.canvas.remove(); live = null;
}

window.CarDoctorBay = { createBay, disposeBay };
