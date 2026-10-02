// The theme chosen on the hub or on any Clamk tool (same origin, same key as src/theme.ts), put on <html> before the
// first paint. A file, not a script written in index.html: the page's Content-Security-Policy allows no inline script.
try {
  var t = localStorage.getItem("clamk-tools:theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
