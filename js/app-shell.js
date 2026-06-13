// Shell/UI controller extracted from app.js:
// preset selection, language/theme rerender, and onboarding wiring.
(function (App) {
  "use strict";

  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var loadMolecule = ctx.loadMolecule;
    var renderModePills = ctx.renderModePills;
    var renderLevels = ctx.renderLevels;
    var renderBudget = ctx.renderBudget;
    var renderFacts = ctx.renderFacts;
    var renderVib = ctx.renderVib;
    var updateNote = ctx.updateNote;
    var drawMap = ctx.drawMap;
    var renderOkStatus = ctx.renderOkStatus;
    var getBuilderCtl = ctx.getBuilderCtl;

    function selectPreset(id) {
      var p = App.getPreset(id);
      $("customPanel").style.display = id === "custom" ? "" : "none";
      if (id !== "custom") {
        var b = getBuilderCtl();
        if (b) b.close();
        else $("builderOverlay").style.display = "none";
      }
      if (p) loadMolecule(p.xyz, p.charge, p);
    }

    // reload whatever is currently selected (after a basis change)
    function reloadCurrent() {
      var id = $("molSelect").value;
      if (id === "custom") {
        loadMolecule($("xyzInput").value, parseInt($("chargeInput").value, 10) || 0, null);
      } else {
        selectPreset(id);
      }
    }

    // (re)fill the molecule selector with localized titles, keeping the selection
    function fillMolSelect() {
      var sel = $("molSelect");
      var keep = sel.value;
      sel.innerHTML = "";
      App.PRESETS.forEach(function (p) {
        var o = document.createElement("option");
        o.value = p.id; o.textContent = App.presetTitle(p);
        sel.appendChild(o);
      });
      var custom = document.createElement("option");
      custom.value = "custom"; custom.textContent = t("custom.option");
      sel.appendChild(custom);
      if (keep) sel.value = keep;
    }

    // everything text-bearing, re-rendered on a language switch
    function rerenderText() {
      fillMolSelect();
      if (App.diagrams && App.diagrams.renderExchange) App.diagrams.renderExchange($("exchange"));
      App.builder.render();
      var b = getBuilderCtl();
      if (b) b.renderInfo();
      if (!state.result) return;
      renderModePills();
      renderLevels();
      renderBudget();
      renderFacts();
      renderVib();
      updateNote();
      $("sliceHint").textContent = t(state.view === "3d" ? "sliceHint.3d" : "sliceHint.2d");
      if (!state.busy) {
        if (state.okInfo) renderOkStatus();
        $("vibStatus").textContent = state.vib
          ? t("vib.summary", { n: state.vib.modes.length,
              list: state.vib.modes.filter(function (m) { return m.freq > 0; })
                .map(function (m) { return m.freq.toFixed(0); }).join(", ") })
          : t("vib.hint");
      }
      if (App.scanCtl && App.scanCtl.refresh) App.scanCtl.refresh();
      if (App.cavitySandbox && App.cavitySandbox.refresh) App.cavitySandbox.refresh();
      if (App.scalingLab && App.scalingLab.refresh) App.scalingLab.refresh();
      if (App.crossBridge && App.crossBridge.refresh) App.crossBridge.refresh();
    }

    // charts and canvases re-painted with the new palette on a theme switch
    function rerenderTheme() {
      App.heatmap.refreshTheme();
      if (App.diagrams && App.diagrams.renderExchange) App.diagrams.renderExchange($("exchange"));
      App.builder.render();
      if (!state.result) return;
      drawMap();
      renderLevels();
      renderVib();
      if (App.scanCtl && App.scanCtl.refresh) App.scanCtl.refresh();
      if (App.cavitySandbox && App.cavitySandbox.refresh) App.cavitySandbox.refresh();
      if (App.scalingLab && App.scalingLab.refresh) App.scalingLab.refresh();
      if (App.crossBridge && App.crossBridge.refresh) App.crossBridge.refresh();
    }

    function initOnboarding() {
      var box = $("onbBox");
      var close = $("onbClose");
      if (!box || !close) return;
      var dismissed = false;
      try { dismissed = localStorage.getItem("qft.onb.dismissed") === "1"; } catch (e) { /* noop */ }
      box.style.display = dismissed ? "none" : "";
      close.addEventListener("click", function () {
        box.style.display = "none";
        try { localStorage.setItem("qft.onb.dismissed", "1"); } catch (e) { /* noop */ }
      });
    }

    return {
      selectPreset: selectPreset,
      reloadCurrent: reloadCurrent,
      fillMolSelect: fillMolSelect,
      rerenderText: rerenderText,
      rerenderTheme: rerenderTheme,
      initOnboarding: initOnboarding
    };
  }

  App.appShell = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
