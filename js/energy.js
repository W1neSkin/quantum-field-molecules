// E(R) panel for diatomic presets: experimental Morse curve plus, when the
// R-scan is ready, the computed RHF curve (minima aligned) and a draggable
// current-R marker. RHF runs off the top at large R — its wrong dissociation
// is shown deliberately.
(function (App) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var HA_TO_EV = 27.211386;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, fill, anchor) {
    var t = el("text", { x: x, y: y, "font-size": 9, fill: fill, "text-anchor": anchor || "start" }, parent);
    t.textContent = s;
    return t;
  }

  // scan: null | { Rs: [A], Eplot: [eV, minima-aligned], minIdx }, idx: current point
  function render(svg, morse, scan, idx) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var t = App.i18n.t, C = App.theme.color;
    var W = 340, H = 190, L = 40, R = 12, T = 12, B = 28;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var De = morse.De, Re = morse.Re, a = morse.a;
    var V = function (r) { var u = 1 - Math.exp(-a * (r - Re)); return De * (u * u - 1); };
    var Rmin = Re * 0.55, Rmax = Re + 4.5 / a;
    var Emin = -1.14 * De, Emax = Math.min(V(Rmin) * 1.05, De * 1.2);
    if (Emax < De * 0.25) Emax = De * 0.25;

    var sx = function (r) { return L + (r - Rmin) / (Rmax - Rmin) * (W - L - R); };
    var sy = function (e) { return T + (Emax - e) / (Emax - Emin) * (H - T - B); };

    var stroke = C("stroke"), text3 = C("chart-axis");
    var cCalc = C("curve-calc"), cExp = C("curve-exp"), cFci = C("curve-fci");
    el("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: stroke }, svg);
    el("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: stroke }, svg);

    var rStep = (Rmax - Rmin) / 4;
    for (var k = 0; k <= 4; k++) {
      var r = Rmin + rStep * k;
      el("line", { x1: sx(r), y1: H - B, x2: sx(r), y2: H - B + 4, stroke: stroke }, svg);
      txt(svg, sx(r), H - B + 15, r.toFixed(1), text3, "middle");
    }
    [0, -De / 2, -De].forEach(function (e) {
      el("line", { x1: L - 4, y1: sy(e), x2: L, y2: sy(e), stroke: stroke }, svg);
      txt(svg, L - 7, sy(e) + 3, e.toFixed(1), text3, "end");
    });
    txt(svg, W - R, H - 4, "R, Å", text3, "end");
    txt(svg, 6, T + 2, t("energy.axis"), text3);

    el("line", { x1: L, y1: sy(0), x2: W - R, y2: sy(0), stroke: C("chart-grid"), "stroke-dasharray": "4 4" }, svg);
    txt(svg, W - R - 2, sy(0) - 4, t("energy.sep"), text3, "end");

    // experimental Morse
    var d = "";
    for (var i = 0; i <= 140; i++) {
      var rr = Rmin + (Rmax - Rmin) * i / 140;
      d += (i ? " L " : "M ") + sx(rr).toFixed(1) + " " + sy(Math.min(V(rr), Emax)).toFixed(1);
    }
    el("path", { d: d, fill: "none", stroke: cExp, "stroke-width": 2 }, svg);
    el("circle", { cx: sx(Re), cy: sy(-De), r: 3, fill: cExp }, svg);

    if (!scan) {
      txt(svg, sx(Re) + 6, sy(-De) + 1,
        t("energy.morse", { Re: Re.toFixed(2), De: De.toFixed(2) }), C("text-2"));
      return;
    }

    // computed curves; pen lifts where a curve exits the chart top
    function curve(Es, color, width) {
      var dr = "", pen = false;
      for (var i = 0; i < scan.Rs.length; i++) {
        var e2 = Es[i];
        if (e2 === null || e2 === undefined || e2 > Emax) { pen = false; continue; }
        dr += (pen ? " L " : "M ") + sx(scan.Rs[i]).toFixed(1) + " " + sy(e2).toFixed(1);
        pen = true;
      }
      el("path", { d: dr, fill: "none", stroke: color, "stroke-width": width }, svg);
    }
    curve(scan.Eplot, cCalc, 1.8);
    var ly = T + 10;
    txt(svg, L + 4, ly, t("energy.leg.calc",
      { method: scan.method || "RHF", basis: scan.basis || "STO-3G" }), cCalc); ly += 11;
    if (scan.Efci) {
      curve(scan.Efci, cFci, 1.6);
      txt(svg, L + 4, ly, t("energy.leg.fci"), cFci); ly += 11;
    }
    txt(svg, L + 4, ly, t("energy.leg.exp"), cExp);

    // current slider position
    var cr = scan.Rs[idx], ce = scan.Eplot[idx];
    el("line", { x1: sx(cr), y1: T, x2: sx(cr), y2: H - B, stroke: C("chart-note"), "stroke-dasharray": "3 3" }, svg);
    if (ce <= Emax) {
      el("circle", { cx: sx(cr), cy: sy(ce), r: 4.5, fill: cCalc, stroke: C("surface"), "stroke-width": 1.5 }, svg);
    } else {
      el("polygon", {
        points: sx(cr) + "," + (T + 2) + " " + (sx(cr) - 4) + "," + (T + 10) + " " + (sx(cr) + 4) + "," + (T + 10),
        fill: cCalc
      }, svg);
    }
  }

  App.energyChart = { render: render, HA_TO_EV: HA_TO_EV };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
