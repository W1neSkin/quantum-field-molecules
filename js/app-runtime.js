// Runtime flow extracted from app.js:
// scan geometry application, full panel rerender, and vibration UI rendering.
(function (App) {
  "use strict";

  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var setStatus = ctx.setStatus;
    var drawMap = ctx.drawMap;
    var updateNote = ctx.updateNote;
    var renderModePills = ctx.renderModePills;
    var renderLevels = ctx.renderLevels;
    var renderBudget = ctx.renderBudget;
    var renderFacts = ctx.renderFacts;
    var renderEnergyCard = ctx.renderEnergyCard;
    var ensureVolume = ctx.ensureVolume;
    var setView = ctx.setView;

    // scan slider moved: show the density map for that geometry (null = back to Re)
    function applyScanGeometry(scanResult) {
      state.scanTarget = scanResult || null;
      if (!scanResult) {
        state.prep = state.prepMain;
        drawMap();
        updateNote();
        return;
      }
      // scan slider revisits points often; memoize per point to keep scrubbing smooth
      if (scanResult._prep) {
        state.prep = scanResult._prep;
        drawMap();
        updateNote();
        return;
      }
      if (scanResult._prepPending) return;
      scanResult._prepPending = true;
      var gen = state.resultGen;
      setStatus(t("status.map"), "busy");
      App.heatmap.prepareAsync(scanResult, null, function (prep) {
        scanResult._prepPending = false;
        scanResult._prep = prep;
        if (gen !== state.resultGen) return;
        if (state.scanTarget !== scanResult) return;
        state.prep = prep;
        drawMap();
        updateNote();
        setStatus(state.okStatus, "ok");
      });
    }

    function renderAll() {
      state.mode = { kind: "total" };
      state.prep3d = null;
      state.prep3dBuilding = false;
      state.prep3dWaiters = [];
      state.volCache = {};
      state.volLru = [];
      state.localized = false;
      state.vib = null;
      state.vibPick = -1;
      state.scanTarget = null;
      $("vibResult").style.display = "none";
      $("vibStatus").textContent = t("vib.hint");
      $("locToggle").checked = false;
      // Boys rotation is defined here for closed shells only
      $("locWrap").style.display = state.result.scf.uhf ? "none" : "";
      renderModePills();
      drawMap();
      renderLevels();
      renderBudget();
      renderFacts();
      renderEnergyCard();
      if (App.cavitySandbox && App.cavitySandbox.refresh) App.cavitySandbox.refresh();
      if (App.scalingLab && App.scalingLab.refresh) App.scalingLab.refresh();
      if (App.crossBridge && App.crossBridge.refresh) App.crossBridge.refresh();
      if (state.view === "3d") ensureVolume();
      updateNote();
    }

    function renderVib() {
      var box = $("vibResult");
      if (!state.vib) { box.style.display = "none"; return; }
      box.style.display = "";
      var modes = state.vib.modes;
      App.irChart.render($("irSvg"), modes, pickVib, state.vibPick);
      var wrap = $("vibModes");
      wrap.innerHTML = "";
      modes.forEach(function (m, i) {
        var b = document.createElement("button");
        b.className = "pill" + (i === state.vibPick ? " active" : "");
        b.textContent = m.freq < 0
          ? t("vib.imag", { f: Math.abs(m.freq).toFixed(0) })
          : t("vib.mode", { f: m.freq.toFixed(0), ir: m.ir.toFixed(0) });
        b.dataset.tip = t("vib.pill.tip");
        b.addEventListener("click", function () { pickVib(i === state.vibPick ? -1 : i); });
        wrap.appendChild(b);
      });
      $("vibCaption").textContent =
        (state.vib.nimag ? t("vib.imagwarn") : "") +
        t("vib.caption", { method: state.result.scf.uhf ? "UHF" : "RHF",
          basis: state.result.basisName || "STO-3G" });
    }

    function pickVib(i) {
      state.vibPick = i;
      if (i >= 0 && state.view === "3d") setView("2d");
      renderVib();
      drawMap();
    }

    return {
      applyScanGeometry: applyScanGeometry,
      renderAll: renderAll,
      renderVib: renderVib,
      pickVib: pickVib
    };
  }

  App.appRuntime = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
