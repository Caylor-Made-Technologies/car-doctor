// caylor-ui 1.0.0 — decide whether to load 3D at all. No three.js import: safe in the main bundle.
// Pattern from controls-academy/src/three/support.ts and critical-facilities-sim/src/ui/three/Scene3D.tsx.

/** @typedef {{ webgl: boolean, renderer: string, cores: number, memoryGB: number, dpr: number, reducedMotion: boolean }} DeviceProbe */

export function isSoftwareRenderer(renderer) {
  return /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(renderer || '');
}

/**
 * The 3D gate. 3D only when: WebGL works, the person hasn't asked for reduced motion, and the device is
 * not weak (deviceMemory ≤ 4 GB or ≤ 4 cores, when the browser reports them). Otherwise: static SVG.
 * `force` ('3d' | '2d') is a test/user override.
 * @param {DeviceProbe} d
 * @returns {{ use3D: boolean, reason: string }}
 */
export function decide3D(d, force) {
  if (force === '2d') return { use3D: false, reason: 'forced-2d' };
  if (!d.webgl) return { use3D: false, reason: 'no-webgl' };
  if (force === '3d') return { use3D: true, reason: 'forced-3d' };
  if (d.reducedMotion) return { use3D: false, reason: 'reduced-motion' };
  if (d.memoryGB > 0 && d.memoryGB <= 4) return { use3D: false, reason: 'low-memory' };
  if (d.cores > 0 && d.cores <= 4) return { use3D: false, reason: 'few-cores' };
  return { use3D: true, reason: 'ok' };
}

let cached = null;
/** Probe once per page load; the test context is released right away. @returns {DeviceProbe} */
export function probeDevice() {
  if (cached) return cached;
  let webgl = false, renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      webgl = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { webgl = false; }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  cached = {
    webgl, renderer,
    cores: nav.hardwareConcurrency || 0,
    memoryGB: nav.deviceMemory || 0,
    dpr: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  return cached;
}

/** `?3d=1` / `?3d=0` in the URL forces the gate (QA and screenshots). */
export function forcedMode() {
  try { const v = new URLSearchParams(location.search).get('3d'); return v === '1' ? '3d' : v === '0' ? '2d' : undefined; } catch { return undefined; }
}

/** Resolve after first paint and an idle moment, so the 3D chunk never competes with the LCP. */
export function afterFirstPaint(timeout = 1500) {
  return new Promise((done) => {
    const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(() => done(), { timeout }) : setTimeout(done, 200));
    const go = () => requestAnimationFrame(() => setTimeout(idle, 0));
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  });
}
