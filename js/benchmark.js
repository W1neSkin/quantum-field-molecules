// Lightweight benchmark card against built-in STO-3G references.
// This is a quick confidence signal, not a rigorous validation suite.
(function (App) {
  "use strict";
  var REFS = {
    "H2": { basis: "STO-3G", E: -1.1167, tol: 5e-4 },
    "HeH+": { basis: "STO-3G", E: -2.8418, tol: 2e-2 },
    "H2O": { basis: "STO-3G", E: -74.9659, tol: 2e-3 },
    "CH4": { basis: "STO-3G", E: -39.7269, tol: 2e-3 },
    "N2": { basis: "STO-3G", E: -107.4960, tol: 5e-3 }
  };

  function evaluate(result, preset) {
    if (!result || !result.scf) return { available: false, reason: "noresult" };
    if (!preset || !preset.id) return { available: false, reason: "nopreset" };
    var ref = REFS[preset.id];
    if (!ref) return { available: false, reason: "noref" };
    var basis = result.basisName || "STO-3G";
    if (basis !== ref.basis) return { available: false, reason: "basis", ref: ref, basis: basis };
    var dE = result.scf.E - ref.E;
    return { available: true, pass: Math.abs(dE) <= ref.tol, dE: dE, E: result.scf.E, basis: basis, ref: ref };
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
    var b = evaluate(state.result, state.preset);
    if (!b.available) {
      box.innerHTML = "";
      note.textContent = b.reason === "basis"
        ? t("bench.basis", { basis: b.ref ? b.ref.basis : "STO-3G" })
        : t("bench.noref");
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
  }

  App.benchmark = { evaluate: evaluate, render: render };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
