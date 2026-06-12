// R-scan controller for diatomic presets: requests the RHF scan, owns the
// slider and readout, re-renders the E(R) chart, and pushes the geometry of
// the current scan point into the density map via the app callback.
(function (App) {
  "use strict";

  var HA_TO_EV = App.energyChart.HA_TO_EV;
  var S = {
    preset: null, morse: null, points: null, Eplot: null, minIdx: 0, eqIdx: 0,
    idx: 0, is3d: false, apply: null, raf: false, mu: null
  };
  var $ = function (id) { return document.getElementById(id); };
  var t = function (key, params) { return App.i18n.t(key, params); };

  function buildRs(morse) {
    var rs = [], Rmin = morse.Re * 0.55, Rmax = morse.Re + 4.5 / morse.a;
    for (var i = 0; i < 36; i++) rs.push(Rmin + (Rmax - Rmin) * i / 35);
    rs.push(morse.Re);
    rs.sort(function (a, b) { return a - b; });
    return rs.filter(function (r, i) { return i === 0 || r - rs[i - 1] > 1e-4; });
  }

  function chart() {
    App.energyChart.render($("energySvg"), S.morse,
      S.points ? { Rs: S.points.map(function (p) { return p.R; }), Eplot: S.Eplot, Efci: S.Efci,
                   minIdx: S.minIdx, method: S.method, basis: S.basis } : null,
      S.idx, S.mu);
  }

  function readout() {
    var ro = $("rReadout");
    if (!S.points) { ro.textContent = ""; return; }
    var p = S.points[S.idx];
    var dE = (p.result.scf.E - S.points[S.minIdx].result.scf.E) * HA_TO_EV;
    ro.textContent = t("scan.readout", { R: p.R.toFixed(2), E: p.result.scf.E.toFixed(4) }) +
      (S.idx === S.minIdx ? t("scan.min", { method: S.method || "RHF" })
        : t("scan.plus", { dE: dE.toFixed(2) }));
  }

  // map redraw at most once per frame while dragging
  function pushGeometry() {
    if (S.raf) return;
    S.raf = true;
    requestAnimationFrame(function () {
      S.raf = false;
      if (S.points && S.apply) S.apply(S.idx === S.eqIdx ? null : S.points[S.idx].result);
    });
  }

  function setSliderEnabled() {
    var sl = $("rSlider");
    sl.disabled = !S.points || S.is3d;
    // disabled controls swallow mouse events, so the 3D hint lives on the row
    if (S.is3d) { $("scanRow").dataset.tip = t("scan.slider3d"); delete sl.dataset.tip; }
    else { delete $("scanRow").dataset.tip; sl.dataset.tip = t("scan.slider.tip"); }
  }

  function caption() {
    $("energyCaption").textContent =
      t("scan.cap.base", { method: S.method, basis: S.basis }) +
      (S.Efci ? t("scan.cap.fci")
        : t(S.method === "UHF" ? "scan.cap.uhf" : "scan.cap.rhf")) +
      t("scan.cap.tail") + t("energy.vlevels");
  }

  // re-render chart, readout and caption (language or theme switch)
  function refresh() {
    if (!S.morse) return;
    chart();
    readout();
    setSliderEnabled();
    if (S.points) caption();
  }

  function init(opts) {
    S.apply = opts.apply;
    $("rSlider").addEventListener("input", function () {
      S.idx = parseInt(this.value, 10) || 0;
      chart(); readout(); pushGeometry();
    });
  }

  // called by the app whenever a molecule finished loading
  function presetLoaded(preset, result) {
    S.preset = preset;
    S.points = null;
    S.morse = preset && preset.morse;
    S.mu = null;
    var row = $("scanRow");
    if (!S.morse) { row.style.display = "none"; return; }
    row.style.display = "";
    var token = preset.id;
    var atoms = result.atoms;
    var basisName = result.basisName || "STO-3G";
    var m1 = App.vib.MASS[atoms[0].Z], m2 = App.vib.MASS[atoms[1].Z];
    S.mu = m1 * m2 / (m1 + m2) * App.vib.AMU; // reduced mass, electron masses
    S.method = preset.mult > 1 ? "UHF" : "RHF";
    S.basis = basisName;
    $("rReadout").textContent = t("scan.start", { method: S.method });
    setSliderEnabled();
    chart();
    App.compute.requestScan({
      key: "scan:v3:" + preset.id + ":" + basisName,
      sym: [App.SYMBOLS[atoms[0].Z], App.SYMBOLS[atoms[1].Z]],
      charge: preset.charge,
      mult: preset.mult,
      basis: basisName,
      rs: buildRs(S.morse),
      onProgress: function (p) {
        if (S.preset && S.preset.id === token) {
          $("rReadout").textContent = t("scan.progress", { method: S.method, p: Math.round(p.frac * 100) });
        }
      }
    }).then(function (res) {
      if (!S.preset || S.preset.id !== token) return; // molecule changed meanwhile
      S.points = res.points;
      var Emin = Infinity;
      res.points.forEach(function (p, i) { if (p.result.scf.E < Emin) { Emin = p.result.scf.E; S.minIdx = i; } });
      // one common shift for all computed curves: SCF minimum lands on -De
      S.Eplot = res.points.map(function (p) { return (p.result.scf.E - Emin) * HA_TO_EV - S.morse.De; });
      S.Efci = null;
      if (res.points.some(function (p) { return p.result.scf.fci; })) {
        S.Efci = res.points.map(function (p) {
          return p.result.scf.fci ? (p.result.scf.fci.E - Emin) * HA_TO_EV - S.morse.De : null;
        });
      }
      var best = Infinity;
      res.points.forEach(function (p, i) {
        if (Math.abs(p.R - S.morse.Re) < best) { best = Math.abs(p.R - S.morse.Re); S.eqIdx = i; }
      });
      S.idx = S.eqIdx;
      var sl = $("rSlider");
      sl.min = 0; sl.max = res.points.length - 1; sl.value = S.idx;
      setSliderEnabled();
      chart(); readout(); caption();
    }).catch(function () {
      if (S.preset && S.preset.id === token) $("rReadout").textContent = t("scan.fail");
    });
  }

  function set3d(active) {
    S.is3d = active;
    setSliderEnabled();
    if (!active && S.points && S.apply) S.apply(S.idx === S.eqIdx ? null : S.points[S.idx].result);
  }

  App.scanCtl = { init: init, presetLoaded: presetLoaded, set3d: set3d, refresh: refresh };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
