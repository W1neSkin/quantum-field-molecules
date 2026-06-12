// Theme switcher (dark/light): persists choice, exposes CSS variable values
// to canvas/SVG renderers, notifies subscribers on change.
(function (App) {
  "use strict";

  var KEY = "qft.theme";
  var subs = [];

  function current() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function color(name) {
    return getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim();
  }

  // parsed {r,g,b} for canvas pixel work; accepts #rgb, #rrggbb, rgb()/rgba()
  function rgb(name) {
    var c = color(name);
    if (c[0] === "#") {
      if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
    }
    var m = c.match(/([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    return m ? { r: +m[1] | 0, g: +m[2] | 0, b: +m[3] | 0 } : { r: 128, g: 128, b: 128 };
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode */ }
    var b = document.getElementById("themeToggle");
    if (b) b.textContent = theme === "dark" ? "\u263E" : "\u2600";
    subs.forEach(function (cb) { cb(theme); });
  }

  function toggle() { apply(current() === "dark" ? "light" : "dark"); }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    var theme = saved ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
    var b = document.getElementById("themeToggle");
    if (b) {
      b.textContent = theme === "dark" ? "\u263E" : "\u2600";
      b.addEventListener("click", toggle);
    }
  }

  App.theme = { init: init, toggle: toggle, current: current, color: color, rgb: rgb,
    onChange: function (cb) { subs.push(cb); } };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
