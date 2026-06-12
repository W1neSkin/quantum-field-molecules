// MO level diagram: occupied/virtual field modes, degeneracy grouping,
// clickable levels (click -> show that MO in the heatmap).
// UHF: two columns, alpha (up arrows) and beta (down arrows).
(function (App) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var HA_TO_EV = 27.211386;
  var CORE_CUT = -3; // hartree: deeper levels are core, collapsed into a note

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

  // Visual rows: levels closer than ROW_EPS share a row and sit side by side,
  // otherwise nearly-degenerate lines overlap (N2: 3sg vs 1pi, ~0.1 eV apart).
  var ROW_EPS = 0.012; // hartree
  function groupRows(eps, from, to) {
    var rows = [];
    for (var i = from; i < to; i++) {
      var r = rows[rows.length - 1];
      if (r && Math.abs(eps[i] - r.eps0) < ROW_EPS) r.members.push(i);
      else rows.push({ eps0: eps[i], members: [i] });
    }
    return rows;
  }

  function shownRange(eps, nocc) {
    var first = 0;
    while (first < nocc && eps[first] < CORE_CUT) first++;
    return { first: first, last: Math.min(eps.length, nocc + 3) };
  }

  // One stack of levels inside [x0, x0+width]; cfg.arrow: "\u2191\u2193" etc.
  function drawColumn(svg, eps, nocc, range, sy, cfg) {
    var C = App.theme.color;
    var rows = groupRows(eps, range.first, range.last);
    var lw = Math.min(44, (cfg.width - 8) / 2), gap = 6;
    rows.forEach(function (r) {
      var totalW = r.members.length * lw + (r.members.length - 1) * gap;
      var x0 = cfg.x0 + (cfg.width - totalW) / 2;
      var rowEnd = x0 + totalW;
      r.members.forEach(function (mo, mi) {
        var x = x0 + mi * (lw + gap), y = sy(eps[mo]);
        var occupied = mo < nocc;
        var selected = cfg.selected === mo && cfg.spinMatch;
        var hit = el("rect", { x: x - 4, y: y - 8, width: lw + 8, height: 16, fill: "transparent", cursor: "pointer" }, svg);
        el("line", {
          x1: x, y1: y, x2: x + lw, y2: y,
          stroke: selected ? C("accent") : occupied ? C("chart-fg") : C("chart-axis"),
          "stroke-width": selected ? 3 : 2,
          "stroke-dasharray": occupied ? "" : "4 3",
          "pointer-events": "none"
        }, svg);
        if (occupied) {
          txt(svg, x + lw / 2, y - 4, cfg.arrow, selected ? C("accent") : C("text-2"), "middle")
            .setAttribute("pointer-events", "none");
        }
        if (cfg.homoLabel && (mo === nocc - 1 || (cfg.lumoLabel && mo === nocc))) {
          var isHomo = mo === nocc - 1;
          var lb = txt(svg, rowEnd + 3, y + 3, isHomo ? cfg.homoLabel : "LUMO",
            isHomo ? C("curve-calc") : C("chart-axis"));
          lb.setAttribute("pointer-events", "none");
        }
        hit.addEventListener("click", function () { if (cfg.onSelect) cfg.onSelect(mo, cfg.spin); });
      });
    });
  }

  // render(svg, scf, {selected, selectedSpin, onSelect})
  function render(svg, scf, opts) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var t = App.i18n.t, C = App.theme.color;
    var W = 340, H = 290, L = 52, R = 10, T = 16, B = 30;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var sets = scf.uhf
      ? [{ eps: scf.eps, nocc: scf.nocc, spin: "a", arrow: "\u2191" },
         { eps: scf.epsB, nocc: scf.noccB, spin: "b", arrow: "\u2193" }]
      : [{ eps: scf.eps, nocc: scf.nocc, spin: "a", arrow: "\u2191\u2193" }];

    var eMin = Infinity, eMax = -Infinity, hiddenCore = 0;
    sets.forEach(function (s) {
      s.range = shownRange(s.eps, s.nocc);
      hiddenCore = Math.max(hiddenCore, s.range.first);
      eMin = Math.min(eMin, s.eps[s.range.first]);
      eMax = Math.max(eMax, s.eps[s.range.last - 1]);
    });
    var pad = Math.max((eMax - eMin) * 0.08, 0.05);
    eMin -= pad; eMax += pad;
    var sy = function (e) { return T + (eMax - e) / (eMax - eMin) * (H - T - B); };

    el("line", { x1: L - 8, y1: T, x2: L - 8, y2: H - B, stroke: C("stroke") }, svg);
    var step = (eMax - eMin) / 4;
    for (var k = 0; k <= 4; k++) {
      var ev = eMin + step * k;
      txt(svg, L - 12, sy(ev) + 3, (ev * HA_TO_EV).toFixed(1), C("chart-axis"), "end");
    }
    txt(svg, 6, T - 4, t("lev.unit"), C("chart-axis"));

    var inner = W - L - R;
    sets.forEach(function (s, si) {
      var colW = scf.uhf ? inner / 2 - 14 : inner;
      var x0 = L + (scf.uhf ? si * (inner / 2) + 7 : 0);
      if (scf.uhf) {
        txt(svg, x0 + colW / 2, T - 4, t(s.spin === "a" ? "lev.alpha" : "lev.beta"),
          C("text-2"), "middle");
      }
      drawColumn(svg, s.eps, s.nocc, s.range, sy, {
        x0: x0, width: colW, spin: s.spin, arrow: s.arrow,
        selected: opts.selected,
        spinMatch: (opts.selectedSpin || "a") === s.spin,
        onSelect: opts.onSelect,
        homoLabel: scf.uhf && s.spin === "a" && scf.nocc > scf.noccB ? "SOMO" : "HOMO",
        lumoLabel: !scf.uhf || s.spin === "b"
      });
    });

    if (hiddenCore > 0) {
      txt(svg, L, H - 8, t("lev.core", { n: hiddenCore, cut: (CORE_CUT * HA_TO_EV).toFixed(0) }),
        C("chart-axis"));
    }
    // for UHF the top row is taken by the spin column captions
    if (!scf.uhf) txt(svg, W - R, 10, t("lev.hint"), C("chart-note"), "end");
  }

  App.molevels = { render: render, HA_TO_EV: HA_TO_EV };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
