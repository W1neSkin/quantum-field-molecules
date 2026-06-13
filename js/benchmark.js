// Lightweight benchmark card and mini-suite against built-in references.
// Quick confidence signal, not a strict certification harness.
(function (App) {
  "use strict";
  var CASES = {
    "H2": { basis: "STO-3G", E: -1.1167, tol: 5e-4, charge: 0, mult: 0, xyz: "H 0 0 0\nH 0 0 0.7408" },
    "HeH+": { basis: "STO-3G", E: -2.8418, tol: 2e-2, charge: 1, mult: 0, xyz: "He 0 0 0\nH 0 0 0.7743" },
    "H2O": { basis: "STO-3G", E: -74.9659, tol: 2e-3, charge: 0, mult: 0, xyz: "O 0 0 0\nH 0.758130 0 0.635742\nH -0.758130 0 0.635742" },
    "CH4": { basis: "STO-3G", E: -39.7269, tol: 2e-3, charge: 0, mult: 0, xyz: "C 0 0 0\nH 0.6276 0.6276 0.6276\nH 0.6276 -0.6276 -0.6276\nH -0.6276 0.6276 -0.6276\nH -0.6276 -0.6276 0.6276" },
    "N2": { basis: "STO-3G", E: -107.4960, tol: 5e-3, charge: 0, mult: 0, xyz: "N 0 0 0\nN 0 0 1.0977" }
  };
  var SUITE_IDS = ["H2", "HeH+", "H2O", "CH4", "N2"];
  var S = { bound: false, running: false, progress: 0, summary: null };

  function evaluateByCase(result, ref) {
    if (!result || !result.scf) return { available: false, reason: "noresult" };
    var basis = result.basisName || "STO-3G";
    if (basis !== ref.basis) return { available: false, reason: "basis", ref: ref, basis: basis };
    var dE = result.scf.E - ref.E;
    return { available: true, pass: Math.abs(dE) <= ref.tol, dE: dE, E: result.scf.E, basis: basis, ref: ref };
  }

  function evaluate(result, preset) {
    if (!result || !result.scf) return { available: false, reason: "noresult" };
    if (!preset || !preset.id) return { available: false, reason: "nopreset" };
    var ref = CASES[preset.id];
    if (!ref) return { available: false, reason: "noref" };
    return evaluateByCase(result, ref);
  }

  function runSuite(opts, onProgress, done) {
    opts = opts || {};
    var basis = opts.basis || "STO-3G";
    var ids = SUITE_IDS.filter(function (id) { return CASES[id] && CASES[id].basis === basis; });
    var out = [], pass = 0, fail = 0, i = 0;
    // Run one case per tick to keep the browser responsive.
    function step() {
      if (i >= ids.length) {
        if (done) done({ total: ids.length, pass: pass, fail: fail, basis: basis, cases: out });
        return;
      }
      var id = ids[i];
      var c = CASES[id];
      try {
        var res = App.engine.compute(c.xyz, c.charge, c.mult, c.basis);
        var ev = evaluateByCase(res, c);
        out.push({ id: id, pass: !!ev.pass, dE: ev.dE });
        if (ev.pass) pass++; else fail++;
      } catch (e) {
        out.push({ id: id, pass: false, err: e.message });
        fail++;
      }
      i++;
      if (onProgress) onProgress(i / ids.length);
      setTimeout(step, 0);
    }
    if (!ids.length) { if (done) done({ total: 0, pass: 0, fail: 0, basis: basis, cases: [] }); return; }
    step();
  }

  function bindSuiteUi(t, $) {
    if (S.bound) return;
    var btn = $("benchRunBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (S.running) return;
      S.running = true;
      S.progress = 0;
      S.summary = null;
      renderSuiteUi(t, $);
      runSuite({ basis: "STO-3G" }, function (p) {
        S.progress = p;
        renderSuiteUi(t, $);
      }, function (sum) {
        S.running = false;
        S.summary = sum;
        renderSuiteUi(t, $);
      });
    });
    S.bound = true;
  }

  function renderSuiteUi(t, $) {
    var status = $("benchSuiteStatus");
    var rows = $("benchSuiteRows");
    if (!status || !rows) return;
    if (S.running) {
      status.textContent = t("bench.running", { p: Math.round(S.progress * 100) });
      rows.textContent = "";
      return;
    }
    if (!S.summary) {
      status.textContent = t("bench.suite.idle");
      rows.textContent = "";
      return;
    }
    status.textContent = t("bench.suite.summary", { n: S.summary.total, pass: S.summary.pass, fail: S.summary.fail });
    rows.innerHTML = S.summary.cases.map(function (c) {
      var tail = "n/a";
      if (c.err) tail = c.err;
      else if (typeof c.dE === "number") tail = (c.dE >= 0 ? "+" : "") + c.dE.toExponential(2) + " Ha";
      return "<div class='brow'><span>" + c.id + "</span><b>" + (c.pass ? t("bench.pass") : t("bench.warn")) + " | " + tail + "</b></div>";
    }).join("");
  }

  function render(state, t, $) {
    var card = $("benchCard"), box = $("benchRows"), note = $("benchNote");
    if (!card || !box || !note) return;
    if (!state || !state.result || !state.preset) {
      card.style.display = "none";
      box.innerHTML = "";
      note.textContent = "";
      return;
    }
    card.style.display = "";
    bindSuiteUi(t, $);
    var b = evaluate(state.result, state.preset);
    if (!b.available) {
      box.innerHTML = "";
      note.textContent = b.reason === "basis"
        ? t("bench.basis", { basis: b.ref ? b.ref.basis : "STO-3G" })
        : t("bench.noref");
      renderSuiteUi(t, $);
      return;
    }
    var row = function (k, v) { return "<div class='brow'><span>" + k + "</span><b>" + v + "</b></div>"; };
    box.innerHTML =
      row(t("bench.status"), b.pass ? t("bench.pass") : t("bench.warn")) +
      row(t("bench.current"), b.E.toFixed(6) + " Ha") +
      row(t("bench.reference"), b.ref.E.toFixed(6) + " Ha") +
      row(t("bench.delta"), (b.dE >= 0 ? "+" : "") + b.dE.toExponential(2) + " Ha") +
      row(t("bench.tolerance"), b.ref.tol.toExponential(1) + " Ha");
    note.textContent = t("bench.note");
    renderSuiteUi(t, $);
  }

  App.benchmark = { evaluate: evaluate, render: render, runSuite: runSuite };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
