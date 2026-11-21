# caylor-ui 1.0.0

Shared look for Caylor Made Technologies apps, taken from Controls Academy and the Critical Facilities
Simulator. It is **copied** into each app (no shared package). Keep every copy identical to the
`VERSION` it names; an app changes only its own accent file.

| File | What it is |
|---|---|
| `tokens.css` | Colors, type scale, 4 px spacing, radii, depth, motion. Dark default, `data-theme="light"` opt-in. |
| `base.css` | Base element styles + `.btn`, `.card`, `.sheet`, `.state-box`, `.skeleton`, `.stage3d`. |
| `react/` | `Button`, `Card`, `Sheet`, `EmptyState`, `ErrorState`, `Skeleton` (React 18/19). |
| `vanilla/ui.js` | The same six as DOM helpers, for apps without a build step. |
| `three/support.js` | The 3D gate (WebGL, reduced motion, ≤4 GB / ≤4 cores → SVG) and `afterFirstPaint()`. No three.js import. |
| `three/stage.js` | Renderer + camera + room light, render on demand, DPR ≤ 2, `flyTo`, full disposal. Lazy chunk only. |

## Accent
Each app sets these after `tokens.css` (values must pass WCAG AA; check `--on-accent` on `--accent-strong`
and `--accent-text` on `--bg`):
```css
:root { --accent: …; --accent-strong: …; --on-accent: …; --accent-text: …; --accent-soft: …; --rgb-accent: r g b; }
```
car-doctor amber · leak-trace cyan · dust-log green · website CM logo blue (#3054B5, sampled from `logo-mark.png`).
