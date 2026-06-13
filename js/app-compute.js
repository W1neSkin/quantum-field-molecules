// Compute-flow controller extracted from app.js:
// calculation requests, status line, vibrations and geometry optimization.
(function (App) {
  "use strict";

  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var setBusy = ctx.setBusy;
    var setStatus = ctx.setStatus;
    var renderAll = ctx.renderAll;
    var renderVib = ctx.renderVib;
    var HA_TO_EV = ctx.haToEv;

    function renderOkStatus() {
      var i = state.okInfo;
      if (!i) return;
      var optNote = i.opt
        ? t(i.opt.converged ? "status.optdone" : "status.optnotconv", { n: i.opt.n, dE: i.opt.dE })
        : "";
      setStatus(optNote + t("status.done", {
        src: i.cache ? t("status.cache") : t("status.secs", { s: i.secs }),
        E: i.E, method: i.method, basis: i.basis, it: i.it
      }), "ok");
    }

    function loadMolecule(xyz, charge, preset) {
      if (state.busy) return;
      var gen = state.resultGen + 1;
      state.resultGen = gen;
      setBusy(true);
      state.preset = preset || null;
      state.lastXyz = xyz;
      state.lastCharge = charge;
      $("errorBox").style.display = "none";
      setStatus(t("status.compute"), "busy");

      App.compute.request({
        xyz: xyz, charge: charge, mult: preset && preset.mult, basis: state.basis,
        onProgress: function (p) {
          if (p.stage === "eri") setStatus(t("status.integrals", { p: Math.round(p.frac * 100) }), "busy");
          else if (p.stage === "scf") setStatus(t("status.scf"), "busy");
        }
      }).then(function (result) {
        if (gen !== state.resultGen) return;
        state.result = result;
        state.provenance = App.provenance && App.provenance.build
          ? App.provenance.build({
            result: result,
            xyz: xyz,
            charge: charge,
            mult: preset && preset.mult,
            basis: state.basis
          })
          : null;
        setStatus(t("status.map"), "busy");
        App.heatmap.prepareAsync(result, null, function (prep) {
          if (gen !== state.resultGen) return;
          state.prep = prep;
          state.prepMain = prep;
          renderAll();
          // structured snapshot so the status line can be re-rendered on language switch
          state.okInfo = {
            cache: !!result.fromCache, secs: (result.elapsedMs / 1000).toFixed(1),
            E: result.scf.E.toFixed(4), method: result.scf.uhf ? "UHF" : "RHF",
            basis: result.basisName || "STO-3G", it: result.scf.iterations,
            opt: state.optInfo ? { converged: state.optInfo.converged, n: state.optInfo.iters,
              dE: (state.optInfo.dE * HA_TO_EV).toFixed(2) } : null
          };
          state.optInfo = null;
          renderOkStatus();
          setBusy(false);
        });
      }).catch(function (err) {
        if (gen !== state.resultGen) return;
        if (App.compute.isCancelledError && App.compute.isCancelledError(err)) {
          setBusy(false);
          return;
        }
        setStatus(t("status.error"), "error");
        var box = $("errorBox");
        box.textContent = err.message;
        box.style.display = "";
        setBusy(false);
      });
    }

    function runVib() {
      if (!state.result || state.busy) return;
      setBusy(true);
      $("errorBox").style.display = "none";
      var vs = $("vibStatus");
      App.compute.requestVib({
        xyz: state.lastXyz, charge: state.lastCharge,
        mult: state.preset && state.preset.mult, basis: state.basis,
        onProgress: function (p) {
          if (p.stage === "vib") vs.textContent = t("vib.progress", { p: Math.round(p.frac * 100) });
        }
      }).then(function (res) {
        setBusy(false);
        state.vib = res;
        state.vibPick = -1;
        vs.textContent = t("vib.summary", { n: res.modes.length,
          list: res.modes.filter(function (m) { return m.freq > 0; })
            .map(function (m) { return m.freq.toFixed(0); }).join(", ") });
        renderVib();
      }).catch(function (err) {
        setBusy(false);
        vs.textContent = t("vib.fail", { msg: err.message });
      });
    }

    function optimizeGeometry() {
      if (!state.result || state.busy) return;
      setBusy(true);
      $("errorBox").style.display = "none";
      setStatus(t("status.optimizing"), "busy");
      var charge = state.lastCharge;
      App.compute.requestOpt({
        xyz: state.lastXyz, charge: charge,
        mult: state.preset && state.preset.mult, basis: state.basis,
        onProgress: function (p) {
          if (p.stage === "opt") {
            setStatus(t("status.opt", { i: p.iter + 1, E: p.E.toFixed(5),
              g: p.gmax.toExponential(1) }), "busy");
          }
        }
      }).then(function (opt) {
        setBusy(false);
        $("xyzInput").value = opt.xyz; // optimized coordinates, ready to copy
        state.optInfo = { dE: opt.E - opt.E0, iters: opt.iters, converged: opt.converged };
        loadMolecule(opt.xyz, charge, state.preset);
      }).catch(function (err) {
        setBusy(false);
        setStatus(t("status.optfail"), "error");
        var box = $("errorBox");
        box.textContent = err.message;
        box.style.display = "";
      });
    }

    return {
      renderOkStatus: renderOkStatus,
      loadMolecule: loadMolecule,
      runVib: runVib,
      optimizeGeometry: optimizeGeometry
    };
  }

  App.appCompute = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
