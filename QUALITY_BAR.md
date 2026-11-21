# Quality bar (caylor-ui 1.0.0)
Taken from the two reference apps: **Controls Academy** (CA) and **Critical Facilities Simulator** (CFS).
Every target app meets this before its PR leaves draft.

## 3D
- **Lib:** three.js (CA 0.182 via React Three Fiber 9; CFS 0.186 plain). Plain three + `caylor-ui/three/stage.js` here; R3F only where React already is and it saves code.
- **Renderer:** WebGL, `antialias` only when DPR < 1.5, ACES Filmic tone mapping, exposure ≈ 1.05, sRGB output.
- **Lighting:** procedural `RoomEnvironment` reflections (PMREM, no downloaded HDRs) + hemisphere + one key light; ambient kept low. No real-time shadow maps on phones; ground with a soft baked/contact shadow.
- **Materials:** `MeshStandardMaterial` recipes per real surface (painted metal, steel, rubber, glass); shared, cached, few programs. Color is a signal, never decoration.
- **Camera/controls:** fit to the subject; ease (`flyTo`, cubic in-out, ~0.9 s) to the thing that matters. No free orbit unless it helps; never hijack page scroll (`touch-action: pan-y`).
- **Animation:** finite and purposeful (a glide, a pulse, a flow that settles). Off under reduced motion.
- **DPR cap:** 2 (CA: 2 high / 1.5 medium / 1 low).
- **On-demand render:** a frame only on change or while an animation runs; idle = 0 frames; paused off-screen and on hidden tabs.
- **Disposal:** geometries, materials, textures, env map, PMREM, renderer, then `forceContextLoss()`.
- **Lazy chunk:** 3D code + three load after first paint and an idle moment, never in the initial bundle. Gate first: no WebGL, reduced motion, deviceMemory ≤ 4 or cores ≤ 4 → static SVG of the same scene. Context loss → same SVG.
- **Budget:** < 100k triangles, < 100 draw calls, one 3D focal point per screen.

## UI
- **Color tokens:** navy surfaces `--bg #0b0f14 / --surface #121821 / --surface-raised #1a2230 / --surface-sunk #0e131a`, borders `#253043 / #34425a`, text `#fff / #c9d3e0 / #9aa7b8`, status ok `#3ddc97` warn `#ffb547` alarm `#ff6b6b`, one app accent. AA everywhere.
- **Type:** Montserrat headings, Inter body, self-hosted, subset, `font-display: swap`. Scale 11/12/14/16/18/20/26/32/44 px. Inputs ≥ 16 px.
- **Spacing:** 4 px grid (4–64). **Radii:** 6/10/12/16/22/pill.
- **Components:** Button (one primary per screen), Card (one glow per screen), Sheet (bottom on phone, dialog ≥ 768 px, focus trap), EmptyState / ErrorState (trace art + one action), Skeleton.
- **Motion:** 120/200/420 ms, `--ease` for fades, `--ease-spring` for things that land; press = scale .97. All off under `prefers-reduced-motion`.
- **Layout:** phone first (390 px), dark default, 44 px targets, no sideways scroll ≥ 320 px, one job per screen.

## Engineering
- **Folders:** logic with no UI imports (CA `src/engine/`, CFS `src/sim/`); UI in features; content as data; `caylor-ui/` copied verbatim.
- **State/storage:** IndexedDB with localStorage fallback, every access in try/catch; **versioned schema** (`schemaVersion`), forward-only migrations, tested against a fixture of the real v1 writes. Never lose user data.
- **PWA/offline:** manifest (192/512/maskable icons), service worker precaches the app shell; core flows work offline; update on return.
- **Errors:** error boundary / global handler → ErrorState with a way back; zero console errors.
- **Tests:** unit tests for core logic + migrations; Playwright smoke (console errors, axe, 390×844 screenshots).
- **README:** one-line pitch, live link, screenshots, what it is, run/test commands, quality numbers (measured only), privacy, trademarks.
