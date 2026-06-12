// Instant theme-aware tooltips for [data-tip] elements; replaces native title
// (no 1 s delay, styled, follows the active theme). Shown on hover and focus.
(function (App) {
  "use strict";
  if (typeof document === "undefined") return;

  var tip = null, cur = null;

  function ensure() {
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "tooltip";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function show(el) {
    var text = el.dataset.tip;
    if (!text) return;
    cur = el;
    var d = ensure();
    d.textContent = text;
    d.style.display = "block";
    var r = el.getBoundingClientRect(), tr = d.getBoundingClientRect();
    var x = r.left + r.width / 2 - tr.width / 2;
    x = Math.max(8, Math.min(x, innerWidth - tr.width - 8));
    var y = r.top - tr.height - 7;
    if (y < 6) y = r.bottom + 7;
    d.style.left = x + "px";
    d.style.top = y + "px";
  }

  function hide() {
    cur = null;
    if (tip) tip.style.display = "none";
  }

  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (el && el !== cur) show(el);
    else if (!el && cur) hide();
  });
  document.addEventListener("mouseout", function (e) {
    if (cur && !(e.relatedTarget && cur.contains(e.relatedTarget))) hide();
  });
  document.addEventListener("focusin", function (e) {
    var el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (el) show(el);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("mousedown", hide);
  addEventListener("scroll", hide, true);
  addEventListener("resize", hide);

  App.tooltip = { hide: hide };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
