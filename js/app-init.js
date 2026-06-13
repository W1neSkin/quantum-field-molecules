// Bootstrap wiring extracted from app.js:
// one-time controller initialization and DOM event bindings.
(function (App) {
  "use strict";

  function create(ctx) {
    var state = ctx.state;
    var $ = ctx.$;
    var createControllers = ctx.createControllers;
    var rerenderText = ctx.rerenderText;
    var rerenderTheme = ctx.rerenderTheme;
    var initOnboarding = ctx.initOnboarding;
    var fillMolSelect = ctx.fillMolSelect;
    var selectPreset = ctx.selectPreset;
    var initBuilder = ctx.initBuilder;
    var reloadCurrent = ctx.reloadCurrent;
    var setView = ctx.setView;
    var applyScanGeometry = ctx.applyScanGeometry;
    var ensurePrep3d = ctx.ensurePrep3d;
    var setLocalized = ctx.setLocalized;
    var drawMap = ctx.drawMap;
    var view3dOpts = ctx.view3dOpts;
    var updateNote = ctx.updateNote;
    var optimizeGeometry = ctx.optimizeGeometry;
    var runVib = ctx.runVib;
    var syncBusyUi = ctx.syncBusyUi;

    function safeRun(name, fn) {
      try { fn(); }
      catch (e) {
        if (typeof console !== "undefined" && console.error) {
          console.error("Startup step failed (" + name + "):", e);
        }
      }
    }

    function recoverFromFatalInit(err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("Fatal init error:", err);
      }
      safeRun("fatalErrorBox", function () {
        var box = $("errorBox");
        if (!box) return;
        box.textContent = "Startup error: " + ((err && err.message) || err);
        box.style.display = "";
      });
      safeRun("fatalPresetRetry", function () {
        if (state.result || state.busy) return;
        var m = $("molSelect");
        if (m && !m.value) m.value = "H2";
        selectPreset((m && m.value) || "H2");
      });
    }

    function init() {
      try {
        App.theme.init();
        App.i18n.init();
        createControllers();

      var langSel = $("langSelect");
      App.i18n.languages().forEach(function (l) {
        var o = document.createElement("option");
        o.value = l.code; o.textContent = l.name;
        langSel.appendChild(o);
      });
      langSel.value = App.LANG;
      langSel.addEventListener("change", function () { App.i18n.setLang(langSel.value); });
      App.i18n.onChange(rerenderText);
      App.theme.onChange(rerenderTheme);

      var sel = $("molSelect");
      fillMolSelect();
      sel.addEventListener("change", function () {
        if (state.busy) return;
        selectPreset(sel.value);
      });
      // Kick off the first calculation immediately after selector wiring.
      // If later optional init blocks throw, the user still sees data on load.
      if (!state.result && !state.busy) selectPreset(sel.value || "H2");
      initBuilder();

      var bsel = $("basisSelect");
      Object.keys(App.BASIS_TABLES).forEach(function (name) {
        var o = document.createElement("option");
        o.value = name; o.textContent = name;
        bsel.appendChild(o);
      });
      bsel.value = state.basis;
      bsel.addEventListener("change", function () {
        if (state.busy) { bsel.value = state.basis; return; }
        state.basis = bsel.value;
        reloadCurrent();
      });

      safeRun("view3d", function () {
        if (App.view3d.supported() && App.view3d.init($("gl"), $("glLabels"))) {
          $("btn3d").style.display = "";
          $("btn3d").addEventListener("click", function () {
            setView(state.view === "2d" ? "3d" : "2d");
          });
        }
      });
      safeRun("scanCtl", function () {
        if (App.scanCtl && App.scanCtl.init) App.scanCtl.init({ apply: applyScanGeometry });
      });

      safeRun("exporter", function () {
        App.exporter.init({
          getResult: function () { return state.result; },
          getMode: function () { return state.mode; },
          getPreset: function () { return state.preset; },
          getProvenance: function () { return state.provenance || null; },
          getView: function () { return state.view; },
          getCanvas2d: function () { return $("density"); },
          getCanvasGl: function () { return $("gl"); },
          ensurePrep3d: ensurePrep3d
        });
      });

      safeRun("cavitySandbox", function () {
        if (!App.cavitySandbox || !App.cavitySandbox.init) return;
        App.cavitySandbox.init({
          getResult: function () { return state.result; },
          getPreset: function () { return state.preset; }
        });
      });
      safeRun("scalingLab", function () {
        if (!App.scalingLab || !App.scalingLab.init) return;
        App.scalingLab.init({
          getResult: function () { return state.result; },
          getPreset: function () { return state.preset; }
        });
      });
      safeRun("crossBridge", function () {
        if (!App.crossBridge || !App.crossBridge.init) return;
        App.crossBridge.init({
          getResult: function () { return state.result; },
          getPreset: function () { return state.preset; },
          getProvenance: function () { return state.provenance || null; }
        });
      });
      ["btnPng", "btnCube", "btnJson", "btnReport"].forEach(function (id) {
        $(id).addEventListener("click", function () {
          if (!state.result || state.busy) return;
          if (id === "btnPng") App.exporter.png();
          else if (id === "btnCube") App.exporter.cube();
          else if (id === "btnJson") App.exporter.json();
          else App.exporter.report();
        });
      });

      $("locToggle").addEventListener("change", function () {
        if (!state.result || state.busy) { this.checked = state.localized; return; }
        setLocalized(this.checked);
      });
      $("efToggle").addEventListener("change", function () {
        state.efield = this.checked;
        drawMap();
      });
      $("oscToggle").addEventListener("change", function () {
        state.osc3d = this.checked;
        App.view3d.setOpts(view3dOpts());
        updateNote();
      });
      $("frameToggle").addEventListener("change", function () {
        state.frame3d = this.checked;
        App.view3d.setOpts(view3dOpts());
      });
      $("btnOpt").addEventListener("click", optimizeGeometry);
      $("vibBtn").addEventListener("click", runVib);

      safeRun("help", function () { App.help.init(); });
      safeRun("labTabs", function () {
        if (App.labTabs && App.labTabs.init) App.labTabs.init();
      });
      safeRun("onboarding", initOnboarding);
      safeRun("exchange", function () { App.diagrams.renderExchange($("exchange")); });
      syncBusyUi();
      // Fallback: ensure startup data is present even if a prior path aborted.
      if (!state.result && !state.busy) selectPreset($("molSelect").value || "H2");
      // Extra startup watchdogs: if any optional init blocked first render,
      // force the same path as user interaction (mol selector change).
        [150, 1200].forEach(function (ms) {
          setTimeout(function () {
            if (state.result || state.busy) return;
            var m = $("molSelect");
            if (!m) { selectPreset("H2"); return; }
            if (!m.value) m.value = "H2";
            m.dispatchEvent(new Event("change", { bubbles: true }));
          }, ms);
        });
      } catch (e) {
        recoverFromFatalInit(e);
      }
    }

    return { init: init };
  }

  App.appInit = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
