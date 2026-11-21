// The engine bay in 3D: low-poly, lit like the reference apps, draws only when something changes.
// Built into app/3d/engine-bay.js by `npm run build` (three.js is bundled into this one lazy file).
import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createStage } from '../caylor-ui/three/stage.js';

const AMBER = 0xf5a524;
const MATS = {
  iron: { color: 0x3a4049, metalness: 0.6, roughness: 0.7 },
  alloy: { color: 0x9aa3ad, metalness: 0.85, roughness: 0.4 },
  steel: { color: 0x6b737c, metalness: 0.9, roughness: 0.45 },
  plastic: { color: 0x1f242b, metalness: 0, roughness: 0.65 },
  rubber: { color: 0x15181c, metalness: 0, roughness: 0.92 },
  rust: { color: 0x5a4436, metalness: 0.5, roughness: 0.85 },
  paint: { color: 0x1f2735, metalness: 0.2, roughness: 0.6 },
  core: { color: 0x2b3036, metalness: 0.5, roughness: 0.75 },
  translucent: { color: 0xd8e4ee, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.55 },
};

function material(key) {
  const m = new MeshStandardMaterial(MATS[key] || MATS.steel);
  m.emissive.setHex(AMBER);
  m.emissiveIntensity = 0;
  return m;
}

/** One part as a small group of primitives (detail kept low: < 2k triangles each). */
function buildPart(id, p) {
  const g = new Group();
  g.name = id;
  const [w, h, d] = p.size;
  const m = material(p.mat);
  const add = (geo, mat = m, at = [0, 0, 0], rot) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(...at);
    if (rot) mesh.rotation.set(...rot);
    g.add(mesh);
    return mesh;
  };
  switch (p.shape) {
    case 'cyl': add(new CylinderGeometry(w / 2, w / 2, h, 20)); break;
    case 'cylx': add(new CylinderGeometry(h / 2, h / 2, w, 20), m, [0, 0, 0], [0, 0, Math.PI / 2]); break;
    case 'cylz': add(new CylinderGeometry(w / 2, w / 2, d, 20), m, [0, 0, 0], [Math.PI / 2, 0, 0]); break;
    case 'wheel': {
      add(new TorusGeometry(h / 2 - 0.09, 0.11, 10, 28), m, [0, 0, 0], [0, Math.PI / 2, 0]);
      add(new CylinderGeometry(h / 2 - 0.15, h / 2 - 0.15, w * 0.6, 24), material('alloy'), [0, 0, 0], [0, 0, Math.PI / 2]);
      // Strut and spring above the hub.
      add(new CylinderGeometry(0.05, 0.05, 0.5, 12), material('steel'), [-0.22, 0.34, 0], [0, 0, 0.25]);
      add(new TorusGeometry(0.08, 0.016, 6, 16), m, [-0.24, 0.36, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    default: add(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, w / 4, h / 4, d / 4)));
  }
  // Recognisable detail on the parts people look for first.
  if (id === 'engine') {
    const vc = material('plastic');
    add(new BoxGeometry(0.16, 0.08, d * 0.9), vc, [-0.2, h / 2 + 0.04, 0]);
    add(new BoxGeometry(0.16, 0.08, d * 0.9), vc, [0.2, h / 2 + 0.04, 0]);
  }
  if (id === 'battery') {
    add(new CylinderGeometry(0.022, 0.022, 0.04, 10), material('alloy'), [-0.08, h / 2 + 0.02, 0]);
    const red = new MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    add(new CylinderGeometry(0.022, 0.022, 0.04, 10), red, [0.08, h / 2 + 0.02, 0]);
  }
  if (id === 'radiator') add(new CylinderGeometry(0.26, 0.26, 0.03, 24), material('plastic'), [0, 0, -0.06], [Math.PI / 2, 0, 0]);
  if (id === 'brakes') {
    // Driver-side wheel around the rotor, plus the caliper (the part that lights up with it).
    const tire = material('rubber');
    add(new TorusGeometry(0.29, 0.11, 10, 28), tire, [-0.08, 0, 0], [0, Math.PI / 2, 0]);
    add(new BoxGeometry(0.08, 0.16, 0.12), m, [0.02, 0.18, 0.14]);
  }
  if (id === 'coils') {
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(new CylinderGeometry(0.03, 0.03, 0.12, 8), m, [s * 0.2, 0.08, -0.27 + i * 0.18]);
    g.children[0].visible = false; // the box is only the footprint
  }
  if (id === 'body') {
    g.children[0].visible = false;
    for (const s of [-1, 1]) {
      add(new BoxGeometry(0.06, 0.08, 2.0), m, [s * 0.55, 0, 0]);         // frame rails
      add(new BoxGeometry(0.22, 0.04, 1.3), m, [s * 0.86, 0.62, 0.15]);  // fender lips
    }
  }
  g.position.set(...p.pos);
  return g;
}

/** A soft round shadow under the bay, painted once into a small texture (one draw call). */
function groundShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.65)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(3.6, 3.2), new MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.4;
  return mesh;
}

const OVERVIEW = { cam: [1.7, 2.6, 2.3], at: [0, 0.15, -0.05] };

/** Where the camera goes to look at one part: same side as the overview, closer, never below the floor. */
export function viewFor(p) {
  if (!p) return OVERVIEW;
  const at = new Vector3(...p.pos);
  const dir = new Vector3(...OVERVIEW.cam).sub(new Vector3(...OVERVIEW.at)).normalize();
  if (p.pos[2] < -0.8) dir.set(0.35, 0.55, 1).normalize(); // firewall: look from the front
  else if (Math.abs(p.pos[0]) > 0.8) dir.set(Math.sign(p.pos[0]) * 1.2, 0.45, 0.9).normalize(); // a wheel: from its own side
  else if (p.pos[1] < 0.05) dir.set(0.8, 0.35, 1.2).normalize(); // low parts: from lower down
  const dist = 1.25 + Math.max(...p.size) * 1.1;
  const cam = at.clone().addScaledVector(dir, dist);
  cam.y = Math.max(cam.y, 0.55);
  return { cam: cam.toArray(), at: at.toArray() };
}

/**
 * Mount the engine bay on `canvas`, lit up at `partId` ("unknown" = overview, nothing lit).
 * @returns {{ show(partId: string): void, dispose(): void, stats(): object }}
 */
export function mount(canvas, { parts, partId = 'unknown', onLost }) {
  const stage = createStage(canvas, { camera: OVERVIEW.cam, target: OVERVIEW.at, fov: 38, onLost });
  stage.scene.add(groundShadow());
  const groups = {};
  for (const [id, p] of Object.entries(parts)) {
    groups[id] = buildPart(id, p);
    stage.scene.add(groups[id]);
  }
  let lit = null;
  const setGlow = (id, k) => groups[id]?.traverse((o) => { if (o.material && o.material.emissive) o.material.emissiveIntensity = k; });

  function show(id) {
    if (lit) setGlow(lit, 0);
    lit = Object.prototype.hasOwnProperty.call(groups, id) ? id : null;
    const v = viewFor(lit ? parts[lit] : null);
    stage.flyTo(v.cam, v.at, 1100);
    if (!lit) return;
    // Three soft pulses, then a steady glow: draws for ~2.4 s, then the scene goes idle (0 frames).
    let t = 0;
    const me = lit;
    stage.animate((dt) => {
      t += dt;
      if (lit !== me) return false;
      const done = t >= 2.4;
      setGlow(me, done ? 0.55 : 0.35 + 0.45 * (0.5 - 0.5 * Math.cos((t / 0.8) * Math.PI * 2)));
      return !done;
    });
  }
  stage.warm();
  show(partId);
  return { show, dispose: () => stage.dispose(), stats: stage.stats, frames: stage.frames, workStats: stage.workStats, firstFrame: stage.firstFrame };
}
