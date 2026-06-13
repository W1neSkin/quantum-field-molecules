// View controller extracted from app.js: mode pills, mode selection, 2D/3D switching and volume cache lifecycle.
(function (App) {
  "use strict";
  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var setStatus = ctx.setStatus;
    var renderLevels = ctx.renderLevels;
    var drawMap = ctx.drawMap;
    var fmtLmo = ctx.fmtLmo;
    var fmtEv = ctx.fmtEv;
    var SLICE_ONLY = ctx.sliceOnly;
    var MAX_VOL_CACHE = ctx.maxVolCache;

    function modeLabel(mode) {
      var scf = state.result.scf;
      if (mode.kind === "mo" && mode.localized && scf.locLabels) {
        return t("mode.lmo", { label: fmtLmo(scf.locLabels[mode.mo]) });
      }
      if (mode.kind === "total") return t("mode.total");
      if (mode.kind === "diff") return t("mode.diff");
      if (mode.kind === "spin") return t("mode.spin");
      if (mode.kind === "esp") return t("mode.esp");
      if (mode.kind === "elf") return t("mode.elf");
      if (mode.kind === "lap") return t("mode.lap");
      var spinB = mode.spin === "b" && scf.uhf;
      var eps = spinB ? scf.epsB : scf.eps;
      var nocc = spinB ? scf.noccB : scf.nocc;
      var occ = mode.mo < nocc;
      var name = mode.mo === nocc - 1
        ? (scf.uhf && !spinB && scf.nocc > scf.noccB ? "SOMO" : "HOMO")
        : mode.mo === nocc ? "LUMO" : t("mode.monum", { n: mode.mo + 1 });
      if (scf.uhf) name += spinB ? " (β)" : " (α)";
      var occText = occ
        ? (scf.uhf ? t(spinB ? "mode.occ.dn" : "mode.occ.up") : t("mode.occ.closed"))
        : t("mode.virtual");
      return t("mode.mo", { name: name, eps: fmtEv(eps[mode.mo]), occ: occText }) +
        (mode.usedOffset && state.view === "2d" ? t("mode.offset") : "");
    }

    function renderModePills() {
      var scf = state.result.scf;
      var pills = [{ kind: "total", label: t("pills.total") }];
      // promolecule reference (Δρ) is tabulated for the minimal basis only
      if ((state.result.basisName || "STO-3G") === "STO-3G") {
        pills.push({ kind: "diff", label: t("pills.diff") });
      }
      pills.push({ kind: "esp", label: t("pills.esp") });
      pills.push({ kind: "elf", label: t("pills.elf") });
      pills.push({ kind: "lap", label: t("pills.lap") });
      if (scf.uhf) pills.push({ kind: "spin", label: t("pills.spin") });
      if (state.localized && scf.locLabels) {
        scf.locLabels.forEach(function (lbl, k) {
          pills.push({ kind: "mo", mo: k, spin: "a", localized: true, label: fmtLmo(lbl) });
        });
      } else {
        pills.push(
          { kind: "mo", mo: scf.nocc - 1, spin: "a", label: scf.uhf && scf.nocc > scf.noccB ? "SOMO" : "HOMO" },
          { kind: "mo", mo: scf.nocc, spin: "a", label: "LUMO" }
        );
      }
      var tips = { total: "pills.total.tip", diff: "pills.diff.tip", esp: "pills.esp.tip",
                   elf: "pills.elf.tip", lap: "pills.lap.tip", spin: "pills.spin.tip" };
      var box = $("modePills");
      box.innerHTML = "";
      pills.forEach(function (p) {
        if (p.kind === "mo" && (p.mo < 0 || p.mo >= scf.eps.length)) return;
        var b = document.createElement("button");
        b.className = "pill";
        b.textContent = p.label;
        b.dataset.tip = p.kind === "mo"
          ? t(p.localized ? "pills.lmo.tip" : "pills.mo.tip")
          : t(tips[p.kind]);
        var active = p.kind === state.mode.kind &&
          (p.kind !== "mo" || (p.mo === state.mode.mo && (state.mode.spin || "a") === p.spin &&
            !p.localized === !state.mode.localized));
        if (active) b.classList.add("active");
        b.addEventListener("click", function () { setMode(p); });
        box.appendChild(b);
      });
    }

    function updateNote() {
      var is3d = state.view === "3d", isMo = state.mode.kind === "mo";
      $("modeNote").textContent = modeLabel(state.mode) +
        (is3d ? t("note.3d") : "") +
        (is3d && isMo && state.osc3d ? " " + t("note.osc") : "");
      $("efWrap").style.display = state.mode.kind === "esp" ? "inline-flex" : "none";
      $("oscWrap").style.display = is3d && isMo ? "inline-flex" : "none";
      $("frameWrap").style.display = is3d ? "inline-flex" : "none";
    }

    function setMode(mode) {
      state.mode = { kind: mode.kind, mo: mode.mo, spin: mode.spin, localized: mode.localized };
      if (SLICE_ONLY[mode.kind] && state.view === "3d") { setView("2d"); }
      renderModePills();
      renderLevels();
      drawMap();
      if (state.view === "3d") ensureVolume();
      updateNote();
    }

    function setView(view) {
      if (view === "3d" && SLICE_ONLY[state.mode.kind]) {
        state.mode = { kind: "total" };
        renderModePills();
      }
      state.view = view;
      $("density").style.display = view === "2d" ? "" : "none";
      $("glWrap").style.display = view === "3d" ? "" : "none";
      $("btn3d").classList.toggle("active", view === "3d");
      $("sliceHint").textContent = t(view === "3d" ? "sliceHint.3d" : "sliceHint.2d");
      App.scanCtl.set3d(view === "3d");
      if (view === "3d") ensureVolume();
      updateNote();
    }

    function volKey() {
      return state.resultGen + ":" + state.mode.kind + (state.mode.kind === "mo"
        ? ":" + state.mode.mo + (state.mode.spin || "a") + (state.mode.localized ? "L" : "")
        : "");
    }

    // builds (or reuses) the 3D basis grid, then calls cb(prep3d)
    function ensurePrep3d(cb) {
      if (!state.result) return;
      var gen = state.resultGen;
      if (state.prep3d && state.prep3d.gen === gen) { cb(state.prep3d); return; }
      state.prep3dWaiters.push({ gen: gen, fn: cb });
      if (state.prep3dBuilding) return;
      state.prep3dBuilding = true;
      App.grid3d.buildBasisGrid(state.result, function (f) {
        setStatus(t("status.grid", { p: Math.round(f * 100) }), "busy");
      }, function (prep) {
        if (gen !== state.resultGen) { state.prep3dBuilding = false; return; }
        prep.gen = gen;
        state.prep3d = prep;
        state.prep3dBuilding = false;
        setStatus(state.okStatus, "ok");
        var ws = state.prep3dWaiters;
        state.prep3dWaiters = [];
        ws.forEach(function (w) {
          if (w.gen === gen) w.fn(prep);
        });
      });
    }

    function view3dOpts() {
      return { osc: state.osc3d && state.mode.kind === "mo", frame: state.frame3d };
    }

    function ensureVolume() {
      if (!state.result) return;
      var gen = state.resultGen;
      if (!state.prep3d) {
        ensurePrep3d(function () { ensureVolume(); });
        return;
      }
      var key = volKey();
      if (state.volCache[key]) {
        var k = state.volLru.indexOf(key);
        if (k >= 0) state.volLru.splice(k, 1);
        state.volLru.push(key);
        App.view3d.setVolume(state.prep3d, state.volCache[key], state.result.atoms);
        App.view3d.setOpts(view3dOpts());
        return;
      }
      App.grid3d.fieldVolume(state.prep3d, state.mode, function (f) {
        setStatus(t("status.volume", { p: Math.round(f * 100) }), "busy");
      }, function (volume) {
        if (gen !== state.resultGen) return;
        state.volCache[key] = volume;
        state.volLru.push(key);
        while (state.volLru.length > MAX_VOL_CACHE) {
          var old = state.volLru.shift();
          delete state.volCache[old];
        }
        setStatus(state.okStatus, "ok");
        if (state.view === "3d" && volKey() === key) {
          App.view3d.setVolume(state.prep3d, volume, state.result.atoms);
          App.view3d.setOpts(view3dOpts());
        }
      });
    }

    return {
      renderModePills: renderModePills,
      setMode: setMode,
      updateNote: updateNote,
      setView: setView,
      ensurePrep3d: ensurePrep3d,
      view3dOpts: view3dOpts,
      ensureVolume: ensureVolume
    };
  }

  App.appView = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
