// Applies the saved light/dark choice before the page paints (no flash).
// Kept in its own file because the Content Security Policy blocks inline scripts.
try {
  if (localStorage.getItem("cardoctor.theme") === "light") document.documentElement.dataset.theme = "light";
} catch (err) { /* private mode: stay dark */ }
