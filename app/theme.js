// Runs before the page paints. Kept in its own file because the Content
// Security Policy blocks inline scripts.

// 1. Refuse to run inside another site's frame (stops "clickjacking").
//    GitHub Pages can't send the header that normally does this.
if (window.top !== window.self) {
  document.documentElement.hidden = true;
  try { window.top.location.replace(window.self.location.href); } catch (err) { /* blocked: stay hidden */ }
}

// 2. Apply the saved light/dark choice (no flash of the wrong theme).
try {
  if (localStorage.getItem("cardoctor.theme") === "light") document.documentElement.dataset.theme = "light";
} catch (err) { /* private mode: stay dark */ }
