/* Car Doctor: hidden surprises.
 *
 *   - Type "Bella Rodriguez" in the chat, or in the vehicle Make and/or
 *     Model boxes (no need to tap Save): hearts fly and pulse around the
 *     screen with a little note.
 *   - A few vehicle years get a fun one-liner when saved.
 *
 * Uses el(), buzz() and REDUCED_MOTION from app.js / features.js.
 */

// Lowercase letters only, accents removed: "Bella Rodríguez!" -> "bellarodriguez".
function surpriseKey(text) {
  return String(text).normalize("NFD").toLowerCase().replace(/[^a-z]/g, "");
}

// Returns true when the text was a surprise (so it isn't used as normal input).
function surprise(text) {
  if (!surpriseKey(text).includes("bellarodriguez")) return false;
  showLove();
  return true;
}

function showLove() {
  if (document.querySelector(".love")) return;
  buzz(40);
  const calm = REDUCED_MOTION.matches;
  const layer = el("div", { class: "love-hearts", "aria-hidden": "true" });
  const close = el("button", { class: "btn primary love-btn", type: "button" }, "❤️ Love you too");
  const card = el("div", { class: "love-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "loveText" },
    el("div", { class: "love-big", "aria-hidden": "true" }, "❤️"),
    el("p", { class: "love-text", id: "loveText" }, "I love you so much baby"),
    close);
  const overlay = el("div", { class: "love" }, layer, card);
  const back = document.activeElement;

  // Hearts that float up from the bottom, then keep coming for a few seconds.
  const COLORS = ["❤️", "💖", "💕", "💗", "💘", "💓"];
  const flyHeart = () => {
    const h = el("span", { class: "fly-heart" }, COLORS[Math.floor(Math.random() * COLORS.length)]);
    h.style.left = Math.random() * 100 + "%";
    h.style.fontSize = 18 + Math.random() * 26 + "px";
    h.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    h.style.setProperty("--spin", `${(Math.random() - 0.5) * 70}deg`);
    h.style.animationDuration = 2.6 + Math.random() * 2.2 + "s";
    layer.append(h);
    h.addEventListener("animationend", () => h.remove());
  };
  // Hearts that sit around the edges and beat.
  const pulseHeart = (i, total) => {
    const angle = (i / total) * Math.PI * 2;
    const h = el("span", { class: "beat-heart" }, i % 2 ? "💗" : "❤️");
    h.style.left = 50 + Math.cos(angle) * 40 + "%";
    h.style.top = 50 + Math.sin(angle) * 38 + "%";
    h.style.fontSize = 26 + (i % 3) * 10 + "px";
    h.style.animationDelay = (i * 0.09).toFixed(2) + "s";
    layer.append(h);
  };

  const ring = calm ? 6 : 12;
  for (let i = 0; i < ring; i++) pulseHeart(i, ring);
  let timer = null;
  if (!calm) {
    for (let i = 0; i < 28; i++) setTimeout(flyHeart, i * 45);
    timer = setInterval(flyHeart, 140);
    setTimeout(() => clearInterval(timer), 6000);
  }

  const done = () => {
    clearInterval(timer);
    document.removeEventListener("keydown", onKey);
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), calm ? 0 : 350);
    if (back && back.focus) back.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === "Escape") done(); else if (e.key === "Tab") { e.preventDefault(); close.focus(); } };
  close.addEventListener("click", done);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) done(); });
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  close.focus({ preventScroll: true });
}

// Make and Model boxes: show it as soon as the name is typed, then put the
// saved vehicle back so the name never gets saved as a car.
function setupSurprises() {
  const form = document.getElementById("profileForm");
  const check = () => {
    if (surprise(`${form.make.value} ${form.model.value}`)) renderProfile();
  };
  form.make.addEventListener("input", check);
  form.model.addEventListener("input", check);
}

// Fun lines for a few vehicle years (shown after saving).
function yearSurprise(year) {
  const y = Number(year);
  if (!/^\d{4}$/.test(year)) return;
  const now = new Date().getFullYear();
  let text = null;
  if (y === 1886) text = "🏁 1886? That's the Benz Patent-Motorwagen, the very first car. Bring a crank, not a code reader.";
  else if (y === 1908) text = "🎩 A 1908 Model T! Any color you want, as long as it's black.";
  else if (y === 1955) text = "⚡ 1955! Hit 88 mph and you'll see some serious stuff.";
  else if (y === 2005) text = "🤝 Good year. The Car Doctor's own truck is a 2005 Silverado.";
  else if (y > now + 1) text = "🚀 A car from the future? Great Scott! Let us know what breaks first.";
  else if (y < 1886) text = "🐴 Before cars existed? That's a horse. Try hay and a vet.";
  if (!text) return;
  const toast = el("div", { class: "toast", role: "status" }, text);
  document.querySelector(".toast")?.remove();
  document.body.append(toast);
  setTimeout(() => toast.classList.add("out"), 4200);
  setTimeout(() => toast.remove(), 4700);
}

