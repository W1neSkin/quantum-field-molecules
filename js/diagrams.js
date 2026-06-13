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
    var t = el("text", { x: x, y: y, "font-size": size || 9, fill: fill, "text-anchor": anchor || "start" }, parent);
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
    svg.setAttribute("viewBox", "0 0 240 190");
    var t = App.i18n.t, C = App.theme.color;
    var photon = C("curve-calc");
    var line = C("text-2"), faint = C("chart-grid"), text3 = C("chart-axis");

    el("line", { x1: 20, y1: 166, x2: 20, y2: 38, stroke: faint }, svg);
    el("polygon", { points: "16,40 24,40 20,30", fill: faint }, svg);
    txt(svg, 17, 22, "t", text3);

    el("line", { x1: 70, y1: 168, x2: 70, y2: 30, stroke: line, "stroke-width": 1.6 }, svg);
    el("line", { x1: 190, y1: 168, x2: 190, y2: 30, stroke: line, "stroke-width": 1.6 }, svg);
    arrowUp(svg, 70, 56, line); arrowUp(svg, 190, 56, line);
    arrowUp(svg, 70, 140, line); arrowUp(svg, 190, 140, line);

    el("path", { d: wavy(70, 98, 190, 98, 4, 5), fill: "none", stroke: photon, "stroke-width": 1.5 }, svg);
    el("circle", { cx: 70, cy: 98, r: 2.5, fill: line }, svg);
    el("circle", { cx: 190, cy: 98, r: 2.5, fill: line }, svg);
    txt(svg, 130, 86, "γ*", photon, "middle", 10);

    txt(svg, 70, 184, t("ex.electron"), line, "middle", 9);
    txt(svg, 190, 184, t("ex.nucleus"), line, "middle", 9);
    txt(svg, 70, 20, t("ex.electron"), line, "middle", 9);
    txt(svg, 190, 20, t("ex.nucleus"), line, "middle", 9);
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
