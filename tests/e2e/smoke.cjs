// Browser check: every tab, a diagnosis in 3D and 2D, zero console errors, axe clean, no sideways
// scroll at 320 px, the v1 -> v2 upgrade in a real browser, offline reload. Saves the 390x844 screenshots.
// Run: npm run e2e   (uses the Playwright + Chromium that come with the cloud environment)
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../../app");
const OUT = path.join(__dirname, "../../docs/screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
const fixture = require("../fixtures/v1-localstorage.json");
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true });
  await ctx.addInitScript((seed) => { if (!sessionStorage.getItem("seeded")) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); } }, fixture);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const axe = async (name) => {
    await page.addScriptTag({ content: axeSrc });
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => v.id + " x" + v.nodes.length));
    check(r.length === 0, `axe ${name}: ${r.join(", ") || "clean"}`);
  };

  await page.goto(base + "?3d=1&debug3d", { waitUntil: "networkidle" });
  // The fixture is real v1 data: the upgrade must have run and kept it.
  const up = await page.evaluate(() => ({ schema: localStorage.getItem("cardoctor.schema"), backup: !!localStorage.getItem("cardoctor.backup.v1"), log: JSON.parse(localStorage.getItem("cardoctor.log")).length, title: document.getElementById("vehicleTitle").textContent }));
  check(up.schema === "2" && up.backup && up.log === 1, `v1 data upgraded in the browser (schema ${up.schema}, ${up.log} log entry kept)`);
  check(/Silverado/.test(up.title), `vehicle from v1 data shown: ${up.title}`);
  await page.evaluate(() => localStorage.setItem("cardoctor.installHint", "true"));
  await page.screenshot({ path: `${OUT}/after-chat.png` });
  await axe("chat");

  await page.fill("#msgInput", "my brakes make a loud grinding noise when I stop");
  await page.press("#msgInput", "Enter");
  await page.waitForFunction(() => window.__bay3d, null, { timeout: 20000 });
  // Wait for the glide and pulses to finish (frames stop advancing), then measure idle.
  for (let i = 0, prev = -1; i < 40; i++) { const f = await page.evaluate(() => window.__bay3d.frames()); if (f === prev) break; prev = f; await page.waitForTimeout(400); }
  const mode = await page.evaluate(() => document.querySelector(".bay").dataset.mode);
  check(mode === "3d", `3D engine bay mounted (mode ${mode})`);
  const st = await page.evaluate(() => window.__bay3d.stats());
  check(st.calls < 100 && st.triangles < 100000, `3D budget: ${st.calls} draw calls, ${st.triangles} triangles`);
  const f0 = await page.evaluate(() => window.__bay3d.frames());
  await page.waitForTimeout(1500);
  const idle = (await page.evaluate(() => window.__bay3d.frames())) - f0;
  check(idle === 0, `idle scene draws 0 frames (drew ${idle})`);
  await page.locator(".bay").last().scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector(".result-card").scrollIntoView());
  await page.screenshot({ path: `${OUT}/after-result-3d.png` });
  await axe("result");

  for (const tab of ["codes", "reminders", "log", "vehicle"]) {
    await page.click(`#tabbtn-${tab}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/after-${tab}.png` });
    await axe(tab);
  }

  // Weak device / reduced motion: flat drawing, no WebGL context.
  const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce", isMobile: true, hasTouch: true, bypassCSP: true });
  await rm.addInitScript(() => { localStorage.setItem("cardoctor.state", '"TX"'); localStorage.setItem("cardoctor.installHint", "true"); });
  const p2 = await rm.newPage();
  p2.on("pageerror", (e) => errors.push(String(e)));
  await p2.goto(base, { waitUntil: "networkidle" });
  await p2.fill("#msgInput", "my brakes make a loud grinding noise when I stop");
  await p2.press("#msgInput", "Enter");
  await p2.waitForSelector(".bay", { timeout: 15000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const m2 = await p2.evaluate(() => document.querySelector(".bay")?.dataset.mode || "no result");
  check(/^2d:/.test(m2) && !(await p2.$(".bay canvas")), `reduced motion -> flat drawing (${m2})`);
  await p2.evaluate(() => document.querySelector(".bay")?.scrollIntoView({ block: "center" }));
  await p2.screenshot({ path: `${OUT}/after-result-2d.png` });

  // 320 px: no sideways scroll on any tab.
  await p2.setViewportSize({ width: 320, height: 640 });
  for (const tab of ["chat", "codes", "reminders", "log", "vehicle"]) {
    await p2.click(`#tabbtn-${tab}`);
    const w = await p2.evaluate(() => document.documentElement.scrollWidth);
    check(w <= 320, `320 px ${tab}: page width ${w}`);
  }

  // Offline: the service worker serves the app shell.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1500);
  check(await page.isVisible("#msgInput"), "works offline after first visit");
  await ctx.setOffline(false);

  check(errors.length === 0, `console errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll browser checks passed");
  process.exit(failed ? 1 : 0);
})();
