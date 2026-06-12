// QFT panel: t-channel photon exchange diagram and exchange-pair counting.
(function (App) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, fill, anchor, size) {
    var t = el("text", { x: x, y: y, "font-size": size || 10, fill: fill, "text-anchor": anchor || "start" }, parent);
    t.textContent = s;
    return t;
  }

  function wavy(x1, y1, x2, y2, amp, waves) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    var nx = -dy / len, ny = dx / len, n = waves * 12;
    var d = "M " + x1 + " " + y1;
    for (var i = 1; i <= n; i++) {
      var t = i / n, s = Math.sin(t * waves * 2 * Math.PI) * amp;
      d += " L " + (x1 + dx * t + nx * s).toFixed(1) + " " + (y1 + dy * t + ny * s).toFixed(1);
    }
    return d;
  }

  function arrowUp(svg, x, y, color) {
    el("polygon", { points: (x - 4) + "," + (y + 5) + " " + (x + 4) + "," + (y + 5) + " " + x + "," + (y - 4), fill: color }, svg);
  }

  function renderExchange(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 220 170");
    var t = App.i18n.t, C = App.theme.color;
    var photon = C("curve-calc");
    var line = C("text-2"), faint = C("chart-grid"), text3 = C("chart-axis");

    el("line", { x1: 16, y1: 150, x2: 16, y2: 32, stroke: faint }, svg);
    el("polygon", { points: "12,34 20,34 16,24", fill: faint }, svg);
    txt(svg, 13, 18, "t", text3);

    el("line", { x1: 62, y1: 152, x2: 62, y2: 22, stroke: line, "stroke-width": 1.6 }, svg);
    el("line", { x1: 168, y1: 152, x2: 168, y2: 22, stroke: line, "stroke-width": 1.6 }, svg);
    arrowUp(svg, 62, 48, line); arrowUp(svg, 168, 48, line);
    arrowUp(svg, 62, 130, line); arrowUp(svg, 168, 130, line);

    el("path", { d: wavy(62, 87, 168, 87, 4, 5), fill: "none", stroke: photon, "stroke-width": 1.5 }, svg);
    el("circle", { cx: 62, cy: 87, r: 2.5, fill: line }, svg);
    el("circle", { cx: 168, cy: 87, r: 2.5, fill: line }, svg);
    txt(svg, 115, 76, "γ*", photon, "middle", 11);

    txt(svg, 62, 166, t("ex.electron"), line, "middle", 11);
    txt(svg, 168, 166, t("ex.nucleus"), line, "middle", 11);
    txt(svg, 62, 14, t("ex.electron"), line, "middle", 11);
    txt(svg, 168, 14, t("ex.nucleus"), line, "middle", 11);
  }

  // Numbers of pairwise photon-exchange channels in the molecule.
  function pairCounts(atoms, nelec) {
    var nn = atoms.length * (atoms.length - 1) / 2;
    return {
      ee: nelec * (nelec - 1) / 2,
      en: nelec * atoms.length,
      nn: nn
    };
  }

  App.diagrams = { renderExchange: renderExchange, pairCounts: pairCounts, wavy: wavy };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
