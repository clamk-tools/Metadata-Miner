// Runs before the page's own script, as a plain file: the built page's Content-Security-Policy allows no inline
// script (vite.config.ts). Two jobs.

// 1. The theme chosen on the hub or on any Clamk tool (same origin, same key as src/theme.ts), put on <html> before
//    the first paint.
try {
  var t = localStorage.getItem("clamk-tools:theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}

// 2. A page opened before a release (a tab the browser restored) asks for scripts and styles the release replaced.
//    When one of the site's own files is missing, the page cannot start: say so, and offer the reload that fixes it.
//    (A missing Python worker is told by the page itself: src/detectClient.ts.)
(function () {
  var shown = false;
  function show() {
    if (shown) return;
    shown = true;
    var root = document.getElementById("root");
    if (!root) return;
    var note = document.createElement("p");
    note.className = "notice bad";
    note.setAttribute("role", "alert");
    note.appendChild(document.createTextNode("A newer version of MetadataMiner was published. "));
    var button = document.createElement("button");
    button.type = "button";
    button.className = "link";
    button.textContent = "Reload the page";
    button.addEventListener("click", function () {
      location.reload();
    });
    note.appendChild(button);
    note.appendChild(document.createTextNode(" to use it."));
    root.replaceChildren(note);
  }
  window.addEventListener(
    "error",
    function (e) {
      var el = e.target;
      var url = el && (el.src || el.href);
      if ((el.tagName === "SCRIPT" || el.tagName === "LINK") && url && url.indexOf(location.origin + "/") === 0) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
        else show();
      }
    },
    true, // a file that does not load does not bubble its error: only a listener on the way down sees it
  );
})();
