// Scaling-law lab (toy): A~L^4 and RvdW~A^(1/7) exploration.
// This is a qualitative module for trend intuition, not a strict fit engine.
(function (App) {
  "use strict";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var deps = null;
  var L0 = 3.0; // reference length in angstrom
  var S = { L: 3.0, A0: 10.0, R0: 1.9 };
  var $ = function (id) { return document.getElementById(id); };

  function predictAlpha(L, Lref, Aref, power) {
    if (!(L > 0) || !(Lref > 0) || !(Aref > 0)) return null;
    return Aref * Math.pow(L / Lref, power == null ? 4 : power);
  }

  function predictRvdw(alpha, alphaRef, rRef, power) {
    if (!(alpha > 0) || !(alphaRef > 0) || !(rRef > 0)) return null;
    return rRef * Math.pow(alpha / alphaRef, power == null ? (1 / 7) : power);
  }

  function sizeSpanAngstrom(result) {
    if (!result || !result.atoms || result.atoms.length < 2) return null;
    var BOHR = 1 / App.engine.ANGSTROM_TO_BOHR;
    var atoms = result.atoms;
    var maxD = 0;
    for (var i = 0; i < atoms.length; i++) {
      for (var j = i + 1; j < atoms.length; j++) {
        var a = atoms[i].xyz, b = atoms[j].xyz;
        var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz) * BOHR;
        if (d > maxD) maxD = d;
      }
    }
    return maxD > 0 ? maxD : null;
  }

  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function el(tag, attrs, p) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (p) p.appendChild(e);
    return e;
  }
  function path(svg, xs, ys, sx, sy, color, dash) {
    var d = "";
    for (var i = 0; i < xs.length; i++) d += (i ? " L " : "M ") + sx(xs[i]).toFixed(1) + " " + sy(ys[i]).toFixed(1);
    var attrs = { d: d, fill: "none", stroke: color, "stroke-width": 1.7 };
    if (dash) attrs["stroke-dasharray"] = dash;
    el("path", attrs, svg);
  }
  function label(svg, x, y, s, c, anchor, cls) {
    var t = el("text", {
      x: x, y: y, fill: c,
      "text-anchor": anchor || "start",
      "class": cls || "chart-label"
    }, svg);
    t.textContent = s;
  }
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
  function colors() {
    var C = App.theme && App.theme.color ? App.theme.color : null;
    return {
      axis: C ? C("chart-axis") : "#9aa1ab",
      grid: C ? C("chart-grid") : "#6c737d",
      text: C ? C("text-2") : "#b9c0ca",
      c1: C ? C("curve-calc") : "#e3a153",
      c2: C ? C("curve-exp") : "#6aa0dc",
      c3: C ? C("curve-fci") : "#7fbf7f",
      surface: C ? C("surface") : "#181818",
      stroke2: C ? C("stroke-2") : "rgba(255,255,255,0.12)"
    };
  }

  function alphaData(Lmol) {
    var Lmax = Math.max(8.0, S.L * 1.25, Lmol ? Lmol * 1.2 : 0);
    var n = 70;
    var xs = [], y4 = [], y3 = [];
    for (var i = 0; i < n; i++) {
      var L = 0.6 + (Lmax - 0.6) * i / (n - 1);
      xs.push(L);
      y4.push(predictAlpha(L, L0, S.A0, 4));
      y3.push(predictAlpha(L, L0, S.A0, 3));
    }
    return { x: xs, y4: y4, y3: y3, Lmax: Lmax };
  }

  function rData(aMax) {
    var n = 70;
    var minA = Math.max(0.4, S.A0 * 0.15);
    var maxA = Math.max(minA * 3, aMax * 1.05);
    var xs = [], y7 = [], y3 = [];
    for (var i = 0; i < n; i++) {
      var A = minA + (maxA - minA) * i / (n - 1);
      xs.push(A);
      y7.push(predictRvdw(A, S.A0, S.R0, 1 / 7));
      y3.push(predictRvdw(A, S.A0, S.R0, 1 / 3));
    }
    return { x: xs, y7: y7, y3: y3, minA: minA, maxA: maxA };
  }

  function drawAlpha(data, Lmol) {
    var svg = $("scaleAlpha");
    if (!svg) return;
    clear(svg);
    svg.setAttribute("viewBox", "0 0 360 200");
    var c = colors(), t = App.i18n.t;
    var W = 360, H = 200, L = 42, R = 14, T = 14, B = 30;
    var yMax = Math.max.apply(null, data.y4.concat(data.y3)) * 1.05;
    var sx = function (x) { return L + (x - 0.6) / (data.Lmax - 0.6) * (W - L - R); };
    var sy = function (y) { return T + (yMax - y) / yMax * (H - T - B); };
    el("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: c.axis }, svg);
    el("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: c.axis }, svg);
    path(svg, data.x, data.y4, sx, sy, c.c1);
    path(svg, data.x, data.y3, sx, sy, c.c2, "4 3");
    el("line", { x1: sx(S.L), y1: T, x2: sx(S.L), y2: H - B, stroke: c.grid, "stroke-dasharray": "2 2" }, svg);
    if (Lmol) el("line", { x1: sx(Lmol), y1: T, x2: sx(Lmol), y2: H - B, stroke: c.c3, "stroke-dasharray": "3 2" }, svg);
    label(svg, W - R, H - 4, t("scale.axis.L"), c.text, "end", "chart-label axis-label");
    label(svg, 6, T + 4, t("scale.axis.A"), c.text, "start", "chart-label axis-label");
    var legendItems = [
      { label: shortLegend(t("scale.legend.l4"), 32), color: c.c1, dash: null },
      { label: shortLegend(t("scale.legend.l3"), 32), color: c.c2, dash: "4 3" }
    ];
    if (Lmol) legendItems.push({ label: shortLegend(t("scale.legend.mol"), 32), color: c.c3, dash: "3 2" });
    var legendX = L + 4;
    var legendY = T + 4;
    var legendH = 6 + legendItems.length * 12;
    el("rect", {
      x: legendX, y: legendY, width: 220, height: legendH,
      rx: 4, ry: 4,
      fill: c.surface, opacity: 0.95,
      stroke: c.stroke2
    }, svg);
    legendItems.forEach(function (it, i) {
      var ly = legendY + 10 + i * 12;
      legendLine(svg, legendX + 6, ly - 1, it.color, it.dash);
      label(svg, legendX + 24, ly + 3, it.label, it.color, "start", "chart-label legend-label");
    });
  }

  function drawR(data, Acur, Amol) {
    var svg = $("scaleRvdw");
    if (!svg) return;
    clear(svg);
    svg.setAttribute("viewBox", "0 0 360 200");
    var c = colors(), t = App.i18n.t;
    var W = 360, H = 200, L = 42, R = 14, T = 14, B = 30;
    var yMax = Math.max.apply(null, data.y7.concat(data.y3)) * 1.05;
    var sx = function (x) { return L + (x - data.minA) / (data.maxA - data.minA) * (W - L - R); };
    var sy = function (y) { return T + (yMax - y) / yMax * (H - T - B); };
    el("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: c.axis }, svg);
    el("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: c.axis }, svg);
    path(svg, data.x, data.y7, sx, sy, c.c1);
    path(svg, data.x, data.y3, sx, sy, c.c2, "4 3");
    el("line", { x1: sx(Acur), y1: T, x2: sx(Acur), y2: H - B, stroke: c.grid, "stroke-dasharray": "2 2" }, svg);
    if (Amol) el("line", { x1: sx(Amol), y1: T, x2: sx(Amol), y2: H - B, stroke: c.c3, "stroke-dasharray": "3 2" }, svg);
    label(svg, W - R, H - 4, t("scale.axis.A"), c.text, "end", "chart-label axis-label");
    label(svg, 6, T + 4, t("scale.axis.R"), c.text, "start", "chart-label axis-label");
    var legendItems = [
      { label: shortLegend(t("scale.legend.r7"), 32), color: c.c1, dash: null },
      { label: shortLegend(t("scale.legend.r3"), 32), color: c.c2, dash: "4 3" }
    ];
    if (Amol) legendItems.push({ label: shortLegend(t("scale.legend.mol"), 32), color: c.c3, dash: "3 2" });
    var legendX = L + 4;
    var legendY = T + 4;
    var legendH = 6 + legendItems.length * 12;
    el("rect", {
      x: legendX, y: legendY, width: 220, height: legendH,
      rx: 4, ry: 4,
      fill: c.surface, opacity: 0.95,
      stroke: c.stroke2
    }, svg);
    legendItems.forEach(function (it, i) {
      var ly = legendY + 10 + i * 12;
      legendLine(svg, legendX + 6, ly - 1, it.color, it.dash);
      label(svg, legendX + 24, ly + 3, it.label, it.color, "start", "chart-label legend-label");
    });
  }

  function syncControlLabels() {
    if ($("scaleLVal")) $("scaleLVal").textContent = S.L.toFixed(2) + " Å";
    if ($("scaleA0Val")) $("scaleA0Val").textContent = S.A0.toFixed(1) + " a0^3";
    if ($("scaleR0Val")) $("scaleR0Val").textContent = S.R0.toFixed(2) + " Å";
  }

  function refresh() {
    if (typeof document === "undefined") return;
    syncControlLabels();
    if (!$("scaleSummary")) return;
    var t = App.i18n.t;
    var result = deps && deps.getResult ? deps.getResult() : null;
    var Lmol = sizeSpanAngstrom(result);
    var Acur = predictAlpha(S.L, L0, S.A0, 4);
    var Rcur = predictRvdw(Acur, S.A0, S.R0, 1 / 7);
    $("scaleSummary").textContent = t("scale.summary", { L: S.L.toFixed(2), A: Acur.toFixed(2), R: Rcur.toFixed(2) }) +
      (Lmol ? (" " + t("scale.mol", {
        L: Lmol.toFixed(2),
        A: predictAlpha(Lmol, L0, S.A0, 4).toFixed(2),
        R: predictRvdw(predictAlpha(Lmol, L0, S.A0, 4), S.A0, S.R0, 1 / 7).toFixed(2)
      })) : "");
    $("scaleNote").textContent = t("scale.note");
    var aData = alphaData(Lmol);
    drawAlpha(aData, Lmol);
    drawR(rData(Math.max.apply(null, aData.y4)), Acur, Lmol ? predictAlpha(Lmol, L0, S.A0, 4) : null);
  }

  function init(opts) {
    deps = opts || {};
    if (typeof document === "undefined") return;
    var l = $("scaleL"), a0 = $("scaleA0"), r0 = $("scaleR0");
    if (!l || !a0 || !r0) return;
    l.value = String(S.L);
    a0.value = String(S.A0);
    r0.value = String(S.R0);
    l.addEventListener("input", function () { S.L = parseFloat(l.value) || S.L; refresh(); });
    a0.addEventListener("input", function () { S.A0 = parseFloat(a0.value) || S.A0; refresh(); });
    r0.addEventListener("input", function () { S.R0 = parseFloat(r0.value) || S.R0; refresh(); });
    refresh();
  }

  App.scalingLab = {
    init: init,
    refresh: refresh,
    predictAlpha: predictAlpha,
    predictRvdw: predictRvdw,
    sizeSpanAngstrom: sizeSpanAngstrom
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
