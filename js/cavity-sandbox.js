// Toy cavity-QED sandbox (fast qualitative model, not full QED).
(function (App) {
  "use strict";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var HA_TO_EV = 27.211386;
  var deps = null;
  var S = { wc: 8.0, g: 0.20, pol: "parallel" };
  var $ = function (id) { return document.getElementById(id); };
  function polScale(pol) { return pol === "perp" ? 0.35 : 1.0; }
  // E± = (E_ex + w_c)/2 ± sqrt((Δ/2)^2 + g_eff^2), Δ = E_ex - w_c.
  function solve(Eex, wc, g, pol) {
    var gEff = Math.max(0, g) * polScale(pol);
    var detune = Eex - wc;
    var root = Math.sqrt(0.25 * detune * detune + gEff * gEff);
    return { minus: 0.5 * (Eex + wc) - root, plus: 0.5 * (Eex + wc) + root, split: 2 * root, detune: detune, gEff: gEff };
  }
  function gapEv(result) {
    if (!result || !result.scf || !result.scf.eps) return null;
    var scf = result.scf;
    var i = (scf.nocc || 0) - 1;
    if (i < 0 || i + 1 >= scf.eps.length) return null;
    return (scf.eps[i + 1] - scf.eps[i]) * HA_TO_EV;
  }
  function crossingData(Eex) {
    var s0 = solve(Eex, S.wc, S.g, S.pol);
    var span = Math.max(1.2, Math.abs(s0.detune) + 0.8, 6 * s0.gEff);
    var n = 64, out = { wc: [], exc: [], cav: [], lp: [], up: [] };
    for (var i = 0; i < n; i++) {
      var wc = Eex - span + 2 * span * i / (n - 1);
      var s = solve(Eex, wc, S.g, S.pol);
      out.wc.push(wc); out.exc.push(Eex); out.cav.push(wc); out.lp.push(s.minus); out.up.push(s.plus);
    }
    return out;
  }
  function morseV(m, r) { var u = 1 - Math.exp(-m.a * (r - m.Re)); return m.De * (u * u - 1); }
  function pesData(morse, Eex0) {
    if (!morse) return null;
    var slope = 0.7 * morse.a, rMin = morse.Re * 0.72, rMax = morse.Re + 2.6 / morse.a, n = 80;
    var out = { r: [], bare: [], lp: [] };
    for (var i = 0; i < n; i++) {
      var r = rMin + (rMax - rMin) * i / (n - 1);
      var vb = morseV(morse, r);
      var Eex = Eex0 + slope * (r - morse.Re);
      var s = solve(Eex, S.wc, S.g, S.pol);
      var shift = -(Math.sqrt(0.25 * s.detune * s.detune + s.gEff * s.gEff) - 0.5 * Math.abs(s.detune));
      out.r.push(r); out.bare.push(vb); out.lp.push(vb + shift);
    }
    return out;
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
  function label(svg, x, y, s, c, anchor) {
    var t = el("text", { x: x, y: y, "font-size": 9, fill: c, "text-anchor": anchor || "start" }, svg);
    t.textContent = s;
  }
  function colors() {
    var C = App.theme && App.theme.color ? App.theme.color : null;
    return { axis: C ? C("chart-axis") : "#9aa1ab", grid: C ? C("chart-grid") : "#6c737d", text: C ? C("text-2") : "#b9c0ca",
      calc: C ? C("curve-calc") : "#e3a153", exp: C ? C("curve-exp") : "#6aa0dc", fci: C ? C("curve-fci") : "#7fbf7f" };
  }
  function drawCrossing(data, Eex) {
    var svg = $("cavitySpectrum");
    if (!svg) return;
    clear(svg);
    svg.setAttribute("viewBox", "0 0 340 190");
    var c = colors(), t = App.i18n.t, W = 340, H = 190, L = 40, R = 12, T = 10, B = 26;
    var yMin = Math.min.apply(null, data.lp.concat(data.exc, data.cav)) - 0.3;
    var yMax = Math.max.apply(null, data.up.concat(data.exc, data.cav)) + 0.3;
    var sx = function (x) { return L + (x - data.wc[0]) / (data.wc[data.wc.length - 1] - data.wc[0]) * (W - L - R); };
    var sy = function (y) { return T + (yMax - y) / (yMax - yMin) * (H - T - B); };
    el("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: c.axis }, svg);
    el("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: c.axis }, svg);
    el("line", { x1: L, y1: sy(Eex), x2: W - R, y2: sy(Eex), stroke: c.grid, "stroke-dasharray": "3 3" }, svg);
    path(svg, data.wc, data.exc, sx, sy, c.exp, "4 3");
    path(svg, data.wc, data.cav, sx, sy, c.text, "4 3");
    path(svg, data.wc, data.lp, sx, sy, c.calc);
    path(svg, data.wc, data.up, sx, sy, c.fci);
    var s = solve(Eex, S.wc, S.g, S.pol);
    el("line", { x1: sx(S.wc), y1: T, x2: sx(S.wc), y2: H - B, stroke: c.grid, "stroke-dasharray": "2 2" }, svg);
    el("circle", { cx: sx(S.wc), cy: sy(s.minus), r: 3.2, fill: c.calc }, svg);
    el("circle", { cx: sx(S.wc), cy: sy(s.plus), r: 3.2, fill: c.fci }, svg);
    label(svg, W - R, H - 4, t("cavity.axis.wc"), c.text, "end");
    label(svg, 6, T + 3, t("cavity.axis.E"), c.text);
    label(svg, L + 3, T + 10, t("cavity.legend.exc"), c.exp);
    label(svg, L + 3, T + 21, t("cavity.legend.cav"), c.text);
    label(svg, L + 128, T + 10, t("cavity.legend.lp"), c.calc);
    label(svg, L + 128, T + 21, t("cavity.legend.up"), c.fci);
  }
  function drawPes(data) {
    var svg = $("cavityPes");
    if (!svg) return;
    clear(svg);
    if (!data) return;
    svg.setAttribute("viewBox", "0 0 340 190");
    var c = colors(), t = App.i18n.t, W = 340, H = 190, L = 40, R = 12, T = 10, B = 26;
    var yMin = Math.min.apply(null, data.bare.concat(data.lp)) - 0.3;
    var yMax = Math.max.apply(null, data.bare.concat(data.lp)) + 0.3;
    var sx = function (x) { return L + (x - data.r[0]) / (data.r[data.r.length - 1] - data.r[0]) * (W - L - R); };
    var sy = function (y) { return T + (yMax - y) / (yMax - yMin) * (H - T - B); };
    el("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: c.axis }, svg);
    el("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: c.axis }, svg);
    path(svg, data.r, data.bare, sx, sy, c.exp, "4 3");
    path(svg, data.r, data.lp, sx, sy, c.calc);
    label(svg, W - R, H - 4, "R, Å", c.text, "end");
    label(svg, 6, T + 3, t("cavity.axis.E"), c.text);
    label(svg, L + 3, T + 10, t("cavity.pes.bare"), c.exp);
    label(svg, L + 3, T + 21, t("cavity.pes.lp"), c.calc);
  }
  function syncControlLabels() {
    if ($("cavityWcVal")) $("cavityWcVal").textContent = S.wc.toFixed(2) + " eV";
    if ($("cavityGVal")) $("cavityGVal").textContent = S.g.toFixed(2) + " eV";
  }
  function refresh() {
    if (typeof document === "undefined") return;
    syncControlLabels();
    if (!$("cavitySummary") || !$("cavityNote")) return;
    var result = deps && deps.getResult ? deps.getResult() : null;
    var preset = deps && deps.getPreset ? deps.getPreset() : null;
    var t = App.i18n.t, Eex = gapEv(result);
    if (!isFinite(Eex)) {
      $("cavitySummary").textContent = t("cavity.wait");
      $("cavityNote").textContent = t("cavity.note");
      drawPes(null);
      drawCrossing({ wc: [0, 1], exc: [0, 0], cav: [0, 1], lp: [0, 0], up: [0, 1] }, 0);
      return;
    }
    var s = solve(Eex, S.wc, S.g, S.pol);
    $("cavitySummary").textContent = t("cavity.summary", { gap: Eex.toFixed(2), wc: S.wc.toFixed(2), g: s.gEff.toFixed(2), split: s.split.toFixed(2) });
    drawCrossing(crossingData(Eex), Eex);
    var pes = pesData(preset && preset.morse, Eex);
    drawPes(pes);
    $("cavityNote").textContent = pes ? t("cavity.pes.caption") : t("cavity.pes.none");
  }
  function init(opts) {
    deps = opts || {};
    if (typeof document === "undefined") return;
    var wc = $("cavityWc"), g = $("cavityG"), pol = $("cavityPol");
    if (!wc || !g || !pol) return;
    wc.value = String(S.wc); g.value = String(S.g); pol.value = S.pol;
    wc.addEventListener("input", function () { S.wc = parseFloat(wc.value) || 0; refresh(); });
    g.addEventListener("input", function () { S.g = parseFloat(g.value) || 0; refresh(); });
    pol.addEventListener("change", function () { S.pol = pol.value === "perp" ? "perp" : "parallel"; refresh(); });
    refresh();
  }
  App.cavitySandbox = { init: init, refresh: refresh, solve: solve };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
