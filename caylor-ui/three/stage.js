// caylor-ui 1.0.0 — the one way an app opens a 3D canvas (bundle it into the lazy 3D chunk only).
// House rules from critical-facilities-sim/src/ui/three/core.ts and controls-academy/src/three/Stage.tsx:
//   ACES tone mapping + sRGB, DPR capped at 2, procedural room reflections (no downloads),
//   render on demand (a frame only when something changed or an animation is running),
//   pause off-screen / hidden tab, context-loss → fallback, everything disposed on unmount.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PMREMGenerator, PerspectiveCamera,
  SRGBColorSpace, Scene, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ fov?: number, camera: [number,number,number], target?: [number,number,number], bg?: string, onLost?: () => void, maxDpr?: number }} o
 */
export function createStage(canvas, o) {
  const dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr ?? 2);
  const renderer = new WebGLRenderer({ canvas, antialias: dpr < 1.5, alpha: !o.bg, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  if (o.bg) scene.background = new Color(o.bg);
  const camera = new PerspectiveCamera(o.fov ?? 40, 1, 0.1, 200);
  camera.position.set(...o.camera);
  const target = new Vector3(...(o.target ?? [0, 0, 0]));
  camera.lookAt(target);

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.traverse((x) => { x.geometry?.dispose?.(); x.material?.dispose?.(); });
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const hemi = new HemisphereLight(0xcfe3ff, 0x1a2230, 1.1);
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(6, 10, 8);
  scene.add(hemi, key);

  const animators = new Set();   // fn(dt, t) => boolean (true = keep going)
  let raf = 0, last = 0, t = 0, dirty = true, visible = true, disposed = false, frames = 0;
  const work = []; // main-thread ms per drawn frame (animation + render submit), newest 240

  const render = () => { renderer.render(scene, camera); frames++; dirty = false; };
  const loop = (now) => {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now; t += dt;
    const t0 = performance.now();
    for (const fn of [...animators]) if (!fn(dt, t)) animators.delete(fn);
    if (visible && !document.hidden && (dirty || animators.size)) {
      render();
      work.push(performance.now() - t0);
      if (work.length > 240) work.shift();
    }
    if (animators.size && visible) raf = requestAnimationFrame(loop); else last = 0;
  };
  const kick = () => { if (!raf && !disposed) raf = requestAnimationFrame(loop); };
  const invalidate = () => { dirty = true; kick(); };

  const size = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
  ro?.observe(canvas);
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) invalidate(); }) : null;
  io?.observe(canvas);
  const onVis = () => { if (!document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', onVis);
  const onLost = (e) => { e.preventDefault(); if (!disposed) o.onLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);
  size();

  /** Ease the camera to look at `to` from `from` over `ms`. */
  function flyTo(from, to, ms = 900) {
    const p0 = camera.position.clone(), t0 = target.clone();
    const p1 = new Vector3(...from), t1 = new Vector3(...to);
    let e = 0;
    animate((dt) => {
      e = Math.min(1, e + (dt * 1000) / ms);
      const k = easeInOut(e);
      camera.position.lerpVectors(p0, p1, k);
      target.lerpVectors(t0, t1, k);
      camera.lookAt(target);
      return e < 1;
    });
  }
  function animate(fn) { animators.add(fn); kick(); }

  return {
    scene, camera, renderer, target, invalidate, animate, flyTo,
    frames: () => frames,
    /** Main-thread cost per drawn frame (ms): the part of a frame this code controls. */
    workStats: () => {
      const a = [...work].sort((x, y) => x - y);
      const q = (p) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(2) : 0);
      return { samples: a.length, median: q(0.5), p95: q(0.95), max: q(1) };
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, frames }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      disposeTree(scene);
      env.dispose(); pmrem.dispose();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    },
  };
}

/** Free every geometry, material and texture under `root`. */
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
      m.dispose();
    }
  });
}
