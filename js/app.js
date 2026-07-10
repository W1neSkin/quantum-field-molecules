// UI wiring: molecule selection, compute requests, panel rendering.
(function (App) {
  "use strict";

  var HA_TO_EV = 27.211386;
  var $ = function (id) { return document.getElementById(id); };
  var t = function (key, params) { return App.i18n.t(key, params); };

  var state = {
    preset: null, result: null, provenance: null, prep: null, mode: { kind: "total" }, busy: false,
    view: "2d", prep3d: null, prep3dBuilding: false, volCache: {}, okStatus: "",
    okInfo: null, basis: "STO-3G", efield: true, osc3d: true, frame3d: false,
    resultGen: 0, volLru: [], prep3dWaiters: [], scanTarget: null
  };
  var MAX_VOL_CACHE = 8;
  var mapCtl = null;
  var viewCtl = null;
  var panelsCtl = null;
  var runtimeCtl = null;
  var computeCtl = null;
  var shellCtl = null;
  var builderCtl = null;
  var initCtl = null;

  // these fields are computed on the slice plane only, never as a 3D volume
  var SLICE_ONLY = { esp: 1, elf: 1, lap: 1 };

  function setStatus(text, cls) {
    var s = $("status");
    s.textContent = text;
    s.className = "status " + (cls || "");
    if (cls === "ok") state.okStatus = text;
  }

  function syncBusyUi() {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-busy", state.busy ? "1" : "0");
    var m = $("molSelect"), b = $("basisSelect"), c = $("computeBtn"),
      o = $("btnOpt"), v = $("vibBtn"), open = $("openBuilderBtn");
    if (m) m.disabled = state.busy;
    if (b) b.disabled = state.busy;
    if (c) c.disabled = state.busy;
    if (o) o.disabled = state.busy;
    if (v) v.disabled = state.busy;
    if (open) open.disabled = state.busy;
  }

  function setBusy(on) {
    state.busy = !!on;
    syncBusyUi();
  }

  function fmtEv(ha) { return (ha * HA_TO_EV).toFixed(1) + t("u.ev"); }

  // localized orbital labels arrive structured: {type: bond|core|lp, a, b}
  function fmtLmo(l) { return t("lmo." + l.type, { a: l.a, b: l.b }); }

  // ---------- mode pills ----------
  function renderModePills() { if (viewCtl) viewCtl.renderModePills(); }

  function drawMap() { if (mapCtl) mapCtl.drawMap(); }

  function setMode(mode) { if (viewCtl) viewCtl.setMode(mode); }

  function updateNote() { if (viewCtl) viewCtl.updateNote(); }

  // ---------- 3D view ----------
  function setView(view) { if (viewCtl) viewCtl.setView(view); }

  // builds (or reuses) the 3D basis grid, then calls cb(prep3d)
  function ensurePrep3d(cb) { if (viewCtl) viewCtl.ensurePrep3d(cb); }

  function view3dOpts() {
    return viewCtl ? viewCtl.view3dOpts() : { osc: false, frame: false };
  }

  function ensureVolume() { if (viewCtl) viewCtl.ensureVolume(); }

  // ---------- panels ----------
  function renderLevels() { if (panelsCtl) panelsCtl.renderLevels(); }

  // ---------- Boys localization toggle ----------
  function setLocalized(on) { if (panelsCtl) panelsCtl.setLocalized(on); }

  function renderBudget() { if (panelsCtl) panelsCtl.renderBudget(); }

  function renderFacts() { if (panelsCtl) panelsCtl.renderFacts(); }

  function renderEnergyCard() { if (panelsCtl) panelsCtl.renderEnergyCard(); }

  // scan slider moved: show the density map for that geometry (null = back to Re)
  function applyScanGeometry(scanResult) { if (runtimeCtl) runtimeCtl.applyScanGeometry(scanResult); }

  function renderAll() { if (runtimeCtl) runtimeCtl.renderAll(); }

  // ---------- compute flow ----------
  function loadMolecule(xyz, charge, preset) { if (computeCtl) computeCtl.loadMolecule(xyz, charge, preset); }

  function renderOkStatus() { if (computeCtl) computeCtl.renderOkStatus(); }

  function selectPreset(id) { if (shellCtl) shellCtl.selectPreset(id); }

  // ---------- vibrations ----------
  function renderVib() { if (runtimeCtl) runtimeCtl.renderVib(); }

  function pickVib(i) { if (runtimeCtl) runtimeCtl.pickVib(i); }

  function runVib() { if (computeCtl) computeCtl.runVib(); }

  function optimizeGeometry() { if (computeCtl) computeCtl.optimizeGeometry(); }

  // ---------- custom molecule editor (modal) ----------
  function initBuilder() {
    builderCtl = App.appBuilder.create({ state: state, t: t, $: $, loadMolecule: loadMolecule });
    builderCtl.init();
  }

  // reload whatever is currently selected (after a basis change)
  function reloadCurrent() { if (shellCtl) shellCtl.reloadCurrent(); }

  // (re)fill the molecule selector with localized titles, keeping the selection
  function fillMolSelect() { if (shellCtl) shellCtl.fillMolSelect(); }

  // everything text-bearing, re-rendered on a language switch
  function rerenderText() { if (shellCtl) shellCtl.rerenderText(); }

  // charts and canvases re-painted with the new palette on a theme switch
  function rerenderTheme() { if (shellCtl) shellCtl.rerenderTheme(); }

  function initOnboarding() { if (shellCtl) shellCtl.initOnboarding(); }

  function createControllers() {
    mapCtl = App.appMap.create({ state: state, t: t, $: $, setStatus: setStatus });
    viewCtl = App.appView.create({
      state: state, t: t, $: $, setStatus: setStatus,
      renderLevels: renderLevels, drawMap: drawMap,
      fmtLmo: fmtLmo, fmtEv: fmtEv, sliceOnly: SLICE_ONLY, maxVolCache: MAX_VOL_CACHE
    });
    panelsCtl = App.appPanels.create({
      state: state, t: t, $: $, setStatus: setStatus, setMode: setMode,
      renderModePills: renderModePills, fmtEv: fmtEv, haToEv: HA_TO_EV
    });
    runtimeCtl = App.appRuntime.create({
      state: state, t: t, $: $, setStatus: setStatus, drawMap: drawMap, updateNote: updateNote,
      renderModePills: renderModePills, renderLevels: renderLevels,
      renderBudget: renderBudget, renderFacts: renderFacts, renderEnergyCard: renderEnergyCard,
      ensureVolume: ensureVolume, setView: setView
    });
    computeCtl = App.appCompute.create({
      state: state, t: t, $: $, setBusy: setBusy, setStatus: setStatus,
      renderAll: renderAll, renderVib: renderVib, setMode: setMode, haToEv: HA_TO_EV
    });
    shellCtl = App.appShell.create({
      state: state, t: t, $: $, loadMolecule: loadMolecule,
      renderModePills: renderModePills, renderLevels: renderLevels,
      renderBudget: renderBudget, renderFacts: renderFacts, renderVib: renderVib,
      updateNote: updateNote, drawMap: drawMap, renderOkStatus: renderOkStatus,
      getBuilderCtl: function () { return builderCtl; }
    });
  }

  // ---------- init ----------
  function init() {
    if (!initCtl) {
      initCtl = App.appInit.create({
        state: state, $: $, createControllers: createControllers,
        rerenderText: rerenderText, rerenderTheme: rerenderTheme, initOnboarding: initOnboarding,
        fillMolSelect: fillMolSelect, selectPreset: selectPreset, initBuilder: initBuilder,
        reloadCurrent: reloadCurrent, setView: setView, applyScanGeometry: applyScanGeometry,
        ensurePrep3d: ensurePrep3d, setLocalized: setLocalized, drawMap: drawMap,
        view3dOpts: view3dOpts, updateNote: updateNote, optimizeGeometry: optimizeGeometry,
        runVib: runVib, syncBusyUi: syncBusyUi
      });
    }
    initCtl.init();
  }

  document.addEventListener("DOMContentLoaded", init);
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
