// IR spectrum panel: stick + Lorentzian-broadened curve, wavenumber axis
// reversed (spectroscopy convention). Imaginary modes drawn red at |freq|.
(function (App) {
  "use strict";

  var Wv = 560, Hv = 150, L = 34, R = 8, T = 10, B = 26;
  var GAMMA = 35; // Lorentzian half-width, cm^-1

  function el(svg, name, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  }
  function txt(svg, x, y, s, fill, anchor) {
    var t = el(svg, "text", { x: x, y: y, fill: fill,
      "font-size": "9px", "text-anchor": anchor || "start" });
    t.textContent = s;
    return t;
  }

  // render(svg, modes, onPick, picked): modes = [{freq, ir}], onPick(i|-1)
  function render(svg, modes, onPick, picked) {
    var t = App.i18n.t, C = App.theme.color;
    svg.setAttribute("viewBox", "0 0 " + Wv + " " + Hv);
    svg.innerHTML = "";

    var fmax = 4400;
    modes.forEach(function (m) { fmax = Math.max(fmax, Math.abs(m.freq) + 300); });
    // x: reversed axis (fmax on the left, 0 on the right)
    var X = function (f) { return L + (1 - f / fmax) * (Wv - L - R); };
    var Y = function (v) { return T + (1 - v) * (Hv - T - B); };

    el(svg, "rect", { x: L, y: T, width: Wv - L - R, height: Hv - T - B,
      fill: "none", stroke: C("chart-grid"), "stroke-width": 1 });
    for (var f = 0; f <= fmax; f += 1000) {
      el(svg, "line", { x1: X(f), y1: Hv - B, x2: X(f), y2: Hv - B + 4, stroke: C("chart-axis") });
      txt(svg, X(f), Hv - B + 14, String(f), C("chart-axis"), "middle");
    }
    txt(svg, Wv - R, Hv - 2, t("ir.x"), C("chart-note"), "end");
    txt(svg, L, T - 2, t("ir.y"), C("chart-note"));

    // broadened curve from real modes
    var pts = [];
    var nx = 240;
    for (var i = 0; i <= nx; i++) {
      var fr = fmax * i / nx;
      var a = 0;
      modes.forEach(function (m) {
        if (m.freq <= 0) return;
        var d = fr - m.freq;
        a += m.ir * GAMMA * GAMMA / (d * d + GAMMA * GAMMA);
      });
      pts.push([X(fr), Y(Math.min(a / 100, 1))]);
    }
    el(svg, "path", {
      d: "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L"),
      fill: "none", stroke: C("curve-calc"), "stroke-width": 1.4, opacity: 0.9
    });

    // sticks (clickable)
    modes.forEach(function (m, i) {
      var imag = m.freq < 0;
      var x = X(Math.abs(m.freq));
      var y1 = imag ? Y(0.5) : Y(Math.min(m.ir / 100, 1));
      var g = el(svg, "g", { cursor: "pointer" });
      var stick = el(svg, "line", { x1: x, y1: Hv - B, x2: x, y2: y1,
        stroke: imag ? C("imag") : C(i === picked ? "stick-active" : "stick"),
        "stroke-width": i === picked ? 3 : 1.6,
        "stroke-dasharray": imag ? "3,2" : "none" });
      g.appendChild(stick);
      // generous invisible hit area
      var hit = el(svg, "rect", { x: x - 5, y: T, width: 10, height: Hv - T - B, fill: "transparent" });
      g.appendChild(hit);
      g.addEventListener("click", function () { if (onPick) onPick(i === picked ? -1 : i); });
      svg.appendChild(g);
    });
  }

  App.irChart = { render: render };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
