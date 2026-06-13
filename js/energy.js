// E(R) panel for diatomic presets: experimental Morse curve plus, when the
// R-scan is ready, the computed RHF curve (minima aligned) and a draggable
// current-R marker. RHF runs off the top at large R - its wrong dissociation
// is shown deliberately. The Morse well also carries its exact vibrational
// levels E_v with the nuclear wavefunctions chi_v(R) - quantized bond motion.
(function (App) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var HA_TO_EV = 27.211386;
  var BOHR = 1.8897259886;

  // Exact bound states of the Morse well. morse: {De eV, Re A, a 1/A};
  // mu: reduced mass in electron masses. Returns up to nmax levels with
  // E (eV above the well bottom) and sample(rs[A]) -> chi_v normalized to max 1.
  function morseLevels(morse, mu, nmax) {
    var De = morse.De / HA_TO_EV, a = morse.a / BOHR, Re = morse.Re * BOHR; // a.u.
    var lam = Math.sqrt(2 * mu * De) / a;
    var vmax = Math.floor(lam - 0.5);
    var w = a * Math.sqrt(2 * De / mu); // harmonic omega_e, hartree
    var levels = [];
    for (var v = 0; v <= Math.min(vmax, nmax - 1); v++) {
      levels.push({
        v: v,
        E: (w * (v + 0.5) - w * w * (v + 0.5) * (v + 0.5) / (4 * De)) * HA_TO_EV,
        sample: sampler(lam, a, Re, v)
      });
    }
    levels.omega = w * 219474.6313; // cm^-1, handy for tests
    return levels;
  }

  // chi_v(z) ~ z^(lam-v-1/2) e^(-z/2) L_v^(2lam-2v-1)(z), z = 2 lam e^(-a(r-Re)).
  // Evaluated in log space (z^lam overflows for heavy molecules), then
  // normalized so that max|chi| = 1 over the supplied grid.
  function sampler(lam, a, Re, v) {
    return function (rs) {
      var n = rs.length, ln = new Float64Array(n), sg = new Int8Array(n), mx = -Infinity;
      var alpha = 2 * lam - 2 * v - 1;
      for (var i = 0; i < n; i++) {
        var z = 2 * lam * Math.exp(-a * (rs[i] * BOHR - Re));
        var L0 = 1, L1 = 1 + alpha - z, L = v === 0 ? L0 : L1;
        for (var k = 2; k <= v; k++) {
          var Lk = ((2 * k - 1 + alpha - z) * L1 - (k - 1 + alpha) * L0) / k;
          L0 = L1; L1 = Lk; L = Lk;
        }
        ln[i] = (lam - v - 0.5) * Math.log(z) - z / 2 + Math.log(Math.abs(L) || 1e-300);
        sg[i] = L >= 0 ? 1 : -1;
        if (ln[i] > mx) mx = ln[i];
      }
      var out = new Float64Array(n);
      for (i = 0; i < n; i++) out[i] = sg[i] * Math.exp(ln[i] - mx);
      return out;
    };
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, fill, anchor, cls) {
    var t = el("text", {
      x: x, y: y, fill: fill,
      "text-anchor": anchor || "start",
      "class": cls || "chart-label"
    }, parent);
    t.textContent = s;
    return t;
  }
  // Keep chart legends compact: translated strings can be very long.
  function shortLegend(s, maxChars) {
    var v = String(s || "");
    if (v.length <= maxChars) return v;
    return v.slice(0, Math.max(1, maxChars - 1)).trim() + "…";
  }
  function legendLine(svg, x, y, color, dash) {
    var attrs = { x1: x, y1: y, x2: x + 14, y2: y, stroke: color, "stroke-width": 1.8 };
    if (dash) attrs["stroke-dasharray"] = dash;
    el("line", attrs, svg);
  }

  // scan: null | { Rs: [A], Eplot: [eV, minima-aligned], minIdx }, idx: current
  // point; mu: reduced mass (m_e) - when given, vibrational levels are drawn
  function render(svg, morse, scan, idx, mu) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var t = App.i18n.t, C = App.theme.color;
    var W = 360, H = 200, L = 42, R = 14, T = 14, B = 30;
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
      txt(svg, sx(r), H - B + 16, r.toFixed(1), text3, "middle", "chart-label axis-label");
    }
    [0, -De / 2, -De].forEach(function (e) {
      el("line", { x1: L - 4, y1: sy(e), x2: L, y2: sy(e), stroke: stroke }, svg);
      txt(svg, L - 7, sy(e) + 3, e.toFixed(1), text3, "end", "chart-label axis-label");
    });
    txt(svg, W - R, H - 4, "R, Å", text3, "end", "chart-label axis-label");
    txt(svg, 6, T + 4, t("energy.axis"), text3, "start", "chart-label axis-label");

    el("line", { x1: L, y1: sy(0), x2: W - R, y2: sy(0), stroke: C("chart-grid"), "stroke-dasharray": "4 4" }, svg);
    txt(svg, W - R - 2, sy(0) - 4, t("energy.sep"), text3, "end", "chart-label axis-label");

    // experimental Morse
    var d = "";
    for (var i = 0; i <= 140; i++) {
      var rr = Rmin + (Rmax - Rmin) * i / 140;
      d += (i ? " L " : "M ") + sx(rr).toFixed(1) + " " + sy(Math.min(V(rr), Emax)).toFixed(1);
    }
    el("path", { d: d, fill: "none", stroke: cExp, "stroke-width": 2 }, svg);
    el("circle", { cx: sx(Re), cy: sy(-De), r: 3, fill: cExp }, svg);

    // quantized nuclear motion: levels E_v and wavefunctions chi_v in the well
    if (mu) {
      var levels = morseLevels(morse, mu, 5);
      var cLev = C("chart-note");
      var gap = levels.length > 1 ? sy(levels[0].E - De) - sy(levels[1].E - De) : 16;
      var amp = Math.min(9, 0.42 * gap);
      levels.forEach(function (Lv) {
        var Ep = Lv.E - De;
        var s = Math.sqrt(Lv.E / De);
        var r1 = Re - Math.log(1 + s) / a;
        var r2 = Math.min(Re - Math.log(1 - s) / a, Rmax - 0.02 * (Rmax - Rmin));
        el("line", { x1: sx(r1), y1: sy(Ep), x2: sx(r2), y2: sy(Ep),
          stroke: cLev, "stroke-width": 0.7, opacity: 0.55 }, svg);
        var lo = Math.max(r1 - 0.18 * (r2 - r1), Rmin), hi = Math.min(r2 + 0.30 * (r2 - r1), Rmax);
        var rs = [];
        for (var i = 0; i < 90; i++) rs.push(lo + (hi - lo) * i / 89);
        var ps = Lv.sample(rs);
        var dw = "";
        for (i = 0; i < rs.length; i++) {
          dw += (i ? " L " : "M ") + sx(rs[i]).toFixed(1) + " " + (sy(Ep) - ps[i] * amp).toFixed(1);
        }
        el("path", { d: dw, fill: "none", stroke: cLev, "stroke-width": 1, opacity: 0.9 }, svg);
      });
    }

    if (!scan) {
      txt(svg, sx(Re) + 6, sy(-De) + 11,
        t("energy.morse", { Re: Re.toFixed(2), De: De.toFixed(2) }), C("text-2"), "start", "chart-label legend-label");
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
    var legendItems = [{
      label: shortLegend(t("energy.leg.calc", {
        method: scan.method || "RHF",
        basis: scan.basis || "STO-3G"
      }), 30),
      color: cCalc,
      dash: null
    }];
    if (scan.Efci) {
      curve(scan.Efci, cFci, 1.6);
      legendItems.push({ label: shortLegend(t("energy.leg.fci"), 30), color: cFci, dash: null });
    }
    legendItems.push({ label: shortLegend(t("energy.leg.exp"), 30), color: cExp, dash: "4 3" });
    var legendX = L + 3;
    var legendY = T + 4;
    var legendH = 6 + legendItems.length * 12;
    el("rect", {
      x: legendX, y: legendY, width: 176, height: legendH,
      rx: 4, ry: 4,
      fill: C("surface"), opacity: 0.95,
      stroke: C("stroke-2")
    }, svg);
    legendItems.forEach(function (it, i) {
      var ly = legendY + 10 + i * 12;
      legendLine(svg, legendX + 6, ly - 1, it.color, it.dash);
      txt(svg, legendX + 24, ly + 3, it.label, it.color, "start", "chart-label legend-label");
    });

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

  App.energyChart = { render: render, morseLevels: morseLevels, HA_TO_EV: HA_TO_EV };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
