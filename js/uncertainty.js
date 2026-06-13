// Lightweight uncertainty hints for quick trust calibration.
// This is a qualitative score, not a statistical error bar.
(function (App) {
  "use strict";

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function evaluate(result, preset, provenance) {
    if (!result || !result.scf) return { level: "na", score: 0, confidence: 0, reasons: [] };
    var scf = result.scf;
    var props = result.props || {};
    var exp = preset && preset.exp ? preset.exp : {};
    var reasons = [];
    var score = 0;
    var basis = result.basisName || "STO-3G";
    if (basis === "STO-3G") { score += 2; reasons.push("basis-minimal"); }
    else if (basis === "6-31G") { score += 1; reasons.push("basis-small"); }

    if (scf.converged === false) { score += 4; reasons.push("scf-not-converged"); }

    var virial = scf.ET ? (-(scf.EVne + scf.EJ + scf.EK + scf.Enuc) / scf.ET) : null;
    if (virial != null && isFinite(virial)) {
      var dv = Math.abs(virial - 2);
      if (dv > 0.30) { score += 2; reasons.push("virial-off"); }
      else if (dv > 0.15) { score += 1; reasons.push("virial-borderline"); }
    }

    if (scf.uhf && scf.S2 != null && scf.S2exact != null) {
      var ds = Math.abs(scf.S2 - scf.S2exact);
      if (ds > 0.40) { score += 2; reasons.push("spin-contamination"); }
      else if (ds > 0.20) { score += 1; reasons.push("spin-borderline"); }
    }

    if (!(provenance && provenance.requestKey)) { score += 1; reasons.push("no-repro-key"); }

    if (exp.dipole != null && props.dipole && isFinite(props.dipole.debye)) {
      var rel = Math.abs(props.dipole.debye - exp.dipole) / Math.max(0.2, Math.abs(exp.dipole));
      if (rel > 0.35) { score += 2; reasons.push("dipole-mismatch"); }
      else if (rel > 0.20) { score += 1; reasons.push("dipole-borderline"); }
    }

    var level = score <= 1 ? "low" : score <= 3 ? "medium" : "high";
    var confidence = clamp(1 - score / 8, 0.05, 1);
    return {
      level: level,
      score: score,
      confidence: confidence,
      reasons: reasons,
      basis: basis,
      virial: virial
    };
  }

  function render(state, t, $) {
    var box = $("uncertaintyHint");
    if (!box) return;
    if (!state || !state.result) { box.innerHTML = ""; return; }
    var u = evaluate(state.result, state.preset, state.provenance);
    if (!u || u.level === "na") { box.innerHTML = ""; return; }
    var rows = [
      [t("unc.level"), t("unc." + u.level)],
      [t("unc.score"), String(u.score) + "/8"],
      [t("unc.conf"), Math.round(u.confidence * 100) + "%"]
    ];
    var reasons = u.reasons.length
      ? "<p class='small faint'>" + t("unc.reasons") + ": " + u.reasons.map(function (k) {
        return t("unc.r." + k);
      }).join("; ") + "</p>"
      : "";
    box.innerHTML = "<p class='small muted'>" + t("unc.title") + "</p>" + rows.map(function (r) {
      return "<div class='brow'><span>" + r[0] + "</span><b>" + r[1] + "</b></div>";
    }).join("") + reasons;
  }

  App.uncertainty = { evaluate: evaluate, render: render };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
