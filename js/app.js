// UI wiring: molecule selection, compute requests, panel rendering.
(function (App) {
  "use strict";

  var HA_TO_EV = 27.211386;
  var $ = function (id) { return document.getElementById(id); };
  var t = function (key, params) { return App.i18n.t(key, params); };

  var state = {
    preset: null, result: null, prep: null, mode: { kind: "total" }, busy: false,
    view: "2d", prep3d: null, prep3dBuilding: false, volCache: {}, okStatus: "",
    okInfo: null, basis: "STO-3G", efield: true, osc3d: true, frame3d: false
  };

  // these fields are computed on the slice plane only, never as a 3D volume
  var SLICE_ONLY = { esp: 1, elf: 1, lap: 1 };

  function setStatus(text, cls) {
    var s = $("status");
    s.textContent = text;
    s.className = "status " + (cls || "");
    if (cls === "ok") state.okStatus = text;
  }

  function fmtEv(ha) { return (ha * HA_TO_EV).toFixed(1) + t("u.ev"); }

  // localized orbital labels arrive structured: {type: bond|core|lp, a, b}
  function fmtLmo(l) { return t("lmo." + l.type, { a: l.a, b: l.b }); }

  // ---------- mode pills ----------
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

  // displacement arrows of the picked vibrational mode, on top of the 2D map
  function drawVibArrows(canvas, prep) {
    if (state.vibPick < 0 || !state.vib || prep !== state.prepMain) return;
    var vec = state.vib.modes[state.vibPick].vec;
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height, S = W / App.heatmap.W;
    var ppbU = W / (2 * prep.halfU), ppbV = H / (2 * prep.halfV);
    var plane = prep.plane;
    // project displacements onto the slice plane, common scale to ~26 px
    var arrows = prep.result.atoms.map(function (a, ai) {
      var d = [vec[ai * 3], vec[ai * 3 + 1], vec[ai * 3 + 2]];
      var du = d[0] * plane.u[0] + d[1] * plane.u[1] + d[2] * plane.u[2];
      var dv = d[0] * plane.v[0] + d[1] * plane.v[1] + d[2] * plane.v[2];
      return { x: W / 2 + prep.proj[ai][0] * ppbU, y: H / 2 - prep.proj[ai][1] * ppbV,
               dx: du * ppbU, dy: -dv * ppbV };
    });
    var mx = arrows.reduce(function (s, a) { return Math.max(s, Math.hypot(a.dx, a.dy)); }, 1e-9);
    var k = 26 * S / mx;
    var arrowColor = App.theme.color("vib-arrow");
    ctx.strokeStyle = arrowColor;
    ctx.fillStyle = arrowColor;
    ctx.lineWidth = 1.6 * S;
    arrows.forEach(function (a) {
      var dx = a.dx * k, dy = a.dy * k, len = Math.hypot(dx, dy);
      if (len < 3 * S) return; // atom barely moves in this plane
      var x2 = a.x + dx, y2 = a.y + dy;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(x2, y2);
      ctx.stroke();
      var ang = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 6 * S * Math.cos(ang - 0.45), y2 - 6 * S * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - 6 * S * Math.cos(ang + 0.45), y2 - 6 * S * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    });
  }

  // arrows of the static electric field E = -grad(phi) over the ESP map
  function drawEfield(canvas, prep) {
    if (!state.efield || state.mode.kind !== "esp" || !prep.espValues) return;
    var phi = prep.espValues;
    var FW = App.heatmap.W, FH = App.heatmap.H;
    var S = canvas.width / FW;
    var du = 2 * prep.halfU / FW, dv = 2 * prep.halfV / FH; // bohr per field px
    var pxPerBohrU = FW / (2 * prep.halfU), pxPerBohrV = FH / (2 * prep.halfV);
    var step = 32, h = 4;
    var arrows = [], emax = 1e-12;
    for (var py = step / 2; py < FH - h; py += step) {
      for (var px = step / 2; px < FW - h; px += step) {
        if (px < h || py < h) continue;
        // the singular 1/r region around each nucleus dwarfs the far field
        var near = false;
        for (var a = 0; a < prep.proj.length; a++) {
          var nx = FW / 2 + prep.proj[a][0] * pxPerBohrU, ny = FH / 2 - prep.proj[a][1] * pxPerBohrV;
          var ddx = (px - nx) / pxPerBohrU, ddy = (py - ny) / pxPerBohrV;
          if (ddx * ddx + ddy * ddy < 1) { near = true; break; }
        }
        if (near) continue;
        var Eu = -(phi[py * FW + px + h] - phi[py * FW + px - h]) / (2 * h * du);
        var Ev = (phi[(py + h) * FW + px] - phi[(py - h) * FW + px]) / (2 * h * dv);
        var m = Math.hypot(Eu, Ev);
        if (m > emax) emax = m;
        // screen y grows downward while the v axis points up
        arrows.push({ x: px, y: py, ux: Eu / (m || 1), uy: -Ev / (m || 1), m: m });
      }
    }
    var ctx = canvas.getContext("2d");
    var fg = App.theme.color("chart-fg");
    ctx.strokeStyle = fg; ctx.fillStyle = fg;
    ctx.lineWidth = 1.1 * S;
    ctx.globalAlpha = 0.65;
    arrows.forEach(function (ar) {
      var len = Math.sqrt(Math.min(ar.m / emax, 1)) * 13; // sqrt compresses the range
      if (len < 3) return;
      var x1 = (ar.x - ar.ux * len / 2) * S, y1 = (ar.y - ar.uy * len / 2) * S;
      var x2 = (ar.x + ar.ux * len / 2) * S, y2 = (ar.y + ar.uy * len / 2) * S;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      var hp = 3.4 * S, ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hp * Math.cos(ang - 0.5), y2 - hp * Math.sin(ang - 0.5));
      ctx.lineTo(x2 - hp * Math.cos(ang + 0.5), y2 - hp * Math.sin(ang + 0.5));
      ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // slice-only fields (ESP, ELF, lap) are built lazily per geometry
  function ensureLazy(prep, ensureFn, statusKey) {
    ensureFn(prep, function (f) {
      setStatus(t(statusKey, { p: Math.round(f * 100) }), "busy");
    }, function () {
      setStatus(state.okStatus, "ok");
      if (state.prep === prep) drawMap();
    });
  }

  function drawMap() {
    var prep = state.prep, mode = state.mode;
    if (mode.kind === "esp" && !prep.espValues) {
      ensureLazy(prep, App.esp.ensure, "status.esp");
      return;
    }
    if ((mode.kind === "elf" || mode.kind === "lap") && !prep.elfValues) {
      ensureLazy(prep, App.fields2d.ensure, "status.fields");
      return;
    }
    App.heatmap.draw($("density"), prep, mode);
    drawVibArrows($("density"), prep);
    drawEfield($("density"), prep);
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

  function updateNote() {
    var is3d = state.view === "3d", isMo = state.mode.kind === "mo";
    $("modeNote").textContent = modeLabel(state.mode) +
      (is3d ? t("note.3d") : "") +
      (is3d && isMo && state.osc3d ? " " + t("note.osc") : "");
    $("efWrap").style.display = state.mode.kind === "esp" ? "inline-flex" : "none";
    $("oscWrap").style.display = is3d && isMo ? "inline-flex" : "none";
    $("frameWrap").style.display = is3d ? "inline-flex" : "none";
  }

  // ---------- 3D view ----------
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
    return state.mode.kind + (state.mode.kind === "mo"
      ? ":" + state.mode.mo + (state.mode.spin || "a") + (state.mode.localized ? "L" : "")
      : "");
  }

  // builds (or reuses) the 3D basis grid, then calls cb(prep3d)
  function ensurePrep3d(cb) {
    if (!state.result) return;
    if (state.prep3d) { cb(state.prep3d); return; }
    state.prep3dWaiters = (state.prep3dWaiters || []).concat(cb);
    if (state.prep3dBuilding) return;
    state.prep3dBuilding = true;
    App.grid3d.buildBasisGrid(state.result, function (f) {
      setStatus(t("status.grid", { p: Math.round(f * 100) }), "busy");
    }, function (prep) {
      state.prep3d = prep;
      state.prep3dBuilding = false;
      setStatus(state.okStatus, "ok");
      var ws = state.prep3dWaiters; state.prep3dWaiters = [];
      ws.forEach(function (w) { w(prep); });
    });
  }

  function view3dOpts() {
    return { osc: state.osc3d && state.mode.kind === "mo", frame: state.frame3d };
  }

  function ensureVolume() {
    if (!state.result) return;
    if (!state.prep3d) {
      ensurePrep3d(function () { ensureVolume(); });
      return;
    }
    var key = volKey();
    if (state.volCache[key]) {
      App.view3d.setVolume(state.prep3d, state.volCache[key], state.result.atoms);
      App.view3d.setOpts(view3dOpts());
      return;
    }
    App.grid3d.fieldVolume(state.prep3d, state.mode, function (f) {
      setStatus(t("status.volume", { p: Math.round(f * 100) }), "busy");
    }, function (volume) {
      state.volCache[key] = volume;
      setStatus(state.okStatus, "ok");
      if (state.view === "3d" && volKey() === key) {
        App.view3d.setVolume(state.prep3d, volume, state.result.atoms);
        App.view3d.setOpts(view3dOpts());
      }
    });
  }

  // ---------- panels ----------
  function renderLevels() {
    App.molevels.render($("levels"), state.result.scf, {
      selected: state.mode.kind === "mo" && !state.mode.localized ? state.mode.mo : -1,
      selectedSpin: state.mode.spin || "a",
      onSelect: function (mo, spin) {
        // level diagram is canonical: picking a level leaves Boys view
        if (state.localized) { state.localized = false; $("locToggle").checked = false; }
        setMode({ kind: "mo", mo: mo, spin: spin });
      }
    });
  }

  // ---------- Boys localization toggle ----------
  function setLocalized(on) {
    var scf = state.result.scf;
    if (on && !scf.Cloc) {
      try {
        var loc = App.localize.boys(state.result);
        scf.Cloc = loc.C;
        scf.locLabels = loc.labels;
      } catch (e) {
        setStatus(t("status.locfail", { msg: e.message }), "error");
        $("locToggle").checked = false;
        return;
      }
    }
    state.localized = on;
    if (state.mode.kind === "mo") {
      if (on) {
        // prefer the first bond LMO as the landing view
        var k = scf.locLabels.findIndex(function (l) { return l.type === "bond"; });
        setMode({ kind: "mo", mo: k >= 0 ? k : scf.nocc - 1, spin: "a", localized: true });
      } else {
        setMode({ kind: "mo", mo: scf.nocc - 1, spin: "a" });
      }
    } else {
      renderModePills();
    }
  }

  function renderBudget() {
    var scf = state.result.scf;
    var props = state.result.props;
    var exp = (state.preset && state.preset.exp) || {};
    var rows = [
      [t("budget.E"), scf.E.toFixed(4) + t("u.ha")],
      [t("budget.T"), scf.ET.toFixed(3)],
      [t("budget.Vne"), scf.EVne.toFixed(3)],
      [t("budget.J"), scf.EJ.toFixed(3)],
      [t("budget.K"), scf.EK.toFixed(3)],
      [t("budget.Enuc"), scf.Enuc.toFixed(3)],
      [t("budget.virial"), (-(scf.EVne + scf.EJ + scf.EK + scf.Enuc) / scf.ET).toFixed(3)]
    ];
    if (scf.uhf) {
      rows.push([t("budget.S2", { x: scf.S2exact.toFixed(2) }), scf.S2.toFixed(4)]);
    }
    if (scf.fci) {
      rows.push([t("budget.fci"), scf.fci.E.toFixed(4) + t("u.ha")]);
      rows.push([t("budget.corr"), scf.fci.Ecorr.toFixed(4) + t("u.ha") + " (" +
        (scf.fci.Ecorr * HA_TO_EV).toFixed(2) + t("u.ev") + ")"]);
    }
    if (props) {
      rows.push([t("budget.dip") + (exp.dipole != null ? t("budget.exp", { v: exp.dipole.toFixed(2) + t("u.debye") }) : ""),
        props.dipole.debye.toFixed(2) + t("u.debye")]);
      rows.push([t("budget.ip", { orb: scf.uhf && scf.nocc > scf.noccB ? "SOMO" : "HOMO" }) +
        (exp.ip != null ? t("budget.exp", { v: exp.ip.toFixed(1) }) : ""),
        fmtEv(-scf.eps[scf.nocc - 1])]);
    }
    $("budget").innerHTML = rows.map(function (r) {
      return "<div class='brow'><span>" + r[0] + "</span><b>" + r[1] + "</b></div>";
    }).join("");

    var atoms = state.result.atoms;
    var sym = function (i) { return App.SYMBOLS[atoms[i].Z] + (atoms.length > 1 ? i + 1 : ""); };
    var html = t("mull.title") + atoms.map(function (a, i) {
      var q = scf.mulliken[i];
      return "<span class='chip'>" + sym(i) + ": " + (q >= 0 ? "+" : "") + q.toFixed(2) +
        (scf.uhf && Math.abs(scf.spinPop[i]) > 0.005 ? t("mull.spin", { s: scf.spinPop[i].toFixed(2) }) : "") + "</span>";
    }).join(" ");
    if (props && props.mayer.length) {
      html += "<br>" + t("mayer.title") + props.mayer.map(function (b) {
        return "<span class='chip'>" + sym(b.a) + "–" + sym(b.b) + ": " + b.order.toFixed(2) + "</span>";
      }).join(" ");
    }
    $("mulliken").innerHTML = html;
  }

  function renderFacts() {
    var facts = state.preset
      ? App.presetFacts(state.preset)
      : [t("facts.custom", { basis: state.result.basisName || "STO-3G" })];
    $("facts").innerHTML = facts.map(function (f) { return "<p class='small sec'>- " + f + "</p>"; }).join("");

    var c = App.diagrams.pairCounts(state.result.atoms, state.result.scf.nelec);
    $("pairs").textContent = t("pairs", { ee: c.ee, en: c.en, nn: c.nn });
  }

  function renderEnergyCard() {
    var card = $("energyCard");
    var show = state.preset && state.preset.morse;
    card.style.display = show ? "" : "none";
    // exchange card takes the full row when there is no E(R) curve
    $("bottomGrid").classList.toggle("solo", !show);
    App.scanCtl.presetLoaded(show ? state.preset : null, state.result);
  }

  // scan slider moved: show the density map for that geometry (null = back to Re)
  function applyScanGeometry(scanResult) {
    state.prep = scanResult ? App.heatmap.prepare(scanResult) : state.prepMain;
    drawMap();
    updateNote();
  }

  function renderAll() {
    state.mode = { kind: "total" };
    state.prep3d = null;
    state.volCache = {};
    state.localized = false;
    state.vib = null;
    state.vibPick = -1;
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
    if (state.view === "3d") ensureVolume();
    updateNote();
  }

  // ---------- compute flow ----------
  function loadMolecule(xyz, charge, preset) {
    if (state.busy) return;
    state.busy = true;
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
      state.result = result;
      setStatus(t("status.map"), "busy");
      setTimeout(function () {
        state.prep = App.heatmap.prepare(result);
        state.prepMain = state.prep;
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
        state.busy = false;
      }, 30);
    }).catch(function (err) {
      setStatus(t("status.error"), "error");
      var box = $("errorBox");
      box.textContent = err.message;
      box.style.display = "";
      state.busy = false;
    });
  }

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

  function selectPreset(id) {
    var p = App.getPreset(id);
    $("customPanel").style.display = id === "custom" ? "" : "none";
    if (p) loadMolecule(p.xyz, p.charge, p);
  }

  // ---------- vibrations ----------
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

  function runVib() {
    if (!state.result || state.busy) return;
    state.busy = true;
    $("errorBox").style.display = "none";
    var vs = $("vibStatus");
    App.compute.requestVib({
      xyz: state.lastXyz, charge: state.lastCharge,
      mult: state.preset && state.preset.mult, basis: state.basis,
      onProgress: function (p) {
        if (p.stage === "vib") vs.textContent = t("vib.progress", { p: Math.round(p.frac * 100) });
      }
    }).then(function (res) {
      state.busy = false;
      state.vib = res;
      state.vibPick = -1;
      vs.textContent = t("vib.summary", { n: res.modes.length,
        list: res.modes.filter(function (m) { return m.freq > 0; })
          .map(function (m) { return m.freq.toFixed(0); }).join(", ") });
      renderVib();
    }).catch(function (err) {
      state.busy = false;
      vs.textContent = t("vib.fail", { msg: err.message });
    });
  }

  function optimizeGeometry() {
    if (!state.result || state.busy) return;
    state.busy = true;
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
      state.busy = false;
      $("xyzInput").value = opt.xyz; // optimized coordinates, ready to copy
      state.optInfo = { dE: opt.E - opt.E0, iters: opt.iters, converged: opt.converged };
      loadMolecule(opt.xyz, charge, state.preset);
    }).catch(function (err) {
      state.busy = false;
      setStatus(t("status.optfail"), "error");
      var box = $("errorBox");
      box.textContent = err.message;
      box.style.display = "";
    });
  }

  // ---------- custom molecule panel: builder + xyz text, kept in sync ----------
  var BOHR_TO_A = 0.529177210903; // engine atoms are stored in bohr

  function renderBldInfo() {
    var atoms = App.builder.getAtoms();
    if (!atoms.length) { $("bldInfo").textContent = ""; return; }
    var s = t("custom.natoms", { n: atoms.length });
    var sel = App.builder.selected();
    if (sel >= 0) {
      s += t("custom.sel", { sym: App.SYMBOLS[atoms[sel].Z] + (sel + 1) });
      var bonds = App.builder.selectionBonds();
      if (bonds && bonds.length) {
        s += " (" + bonds.map(function (b) {
          return b.label + " " + b.len.toFixed(2) + " \u00c5";
        }).join(", ") + ")";
      }
    }
    $("bldInfo").textContent = s;
  }

  function syncFromBuilder() {
    $("xyzInput").value = App.builder.toXyz();
    $("xyzError").style.display = "none";
    renderBldInfo();
  }

  // textarea -> builder preview, with live localized validation
  function parseToBuilder() {
    try {
      var atoms = App.engine.parseXYZ($("xyzInput").value).map(function (a) {
        return { Z: a.Z, xyz: a.xyz.map(function (c) { return c * BOHR_TO_A; }) };
      });
      $("xyzError").style.display = "none";
      App.builder.setAtoms(atoms);
      renderBldInfo();
    } catch (e) {
      $("xyzError").textContent = e.message;
      $("xyzError").style.display = "";
    }
  }

  function setBldTab(build) {
    $("bldPane").style.display = build ? "" : "none";
    $("xyzPane").style.display = build ? "none" : "";
    $("tabBuild").classList.toggle("active", build);
    $("tabText").classList.toggle("active", !build);
  }

  function initBuilder() {
    App.builder.init($("bldCanvas"), syncFromBuilder);
    for (var z = 1; z <= 10; z++) {
      (function (z) {
        var b = document.createElement("button");
        b.className = "pill";
        b.textContent = App.SYMBOLS[z];
        b.addEventListener("click", function () {
          if (App.builder.add(z) < 0) $("bldInfo").textContent = t("err.parse.maxatoms");
        });
        $("bldElems").appendChild(b);
      })(z);
    }
    $("bldDel").addEventListener("click", function () { App.builder.remove(); });
    $("bldClear").addEventListener("click", function () { App.builder.clear(); });
    $("bldFromCur").addEventListener("click", function () {
      if (!state.result) return;
      App.builder.setAtoms(state.result.atoms.map(function (a) {
        return { Z: a.Z, xyz: a.xyz.map(function (c) { return c * BOHR_TO_A; }) };
      }));
      syncFromBuilder();
    });
    $("tabBuild").addEventListener("click", function () { setBldTab(true); });
    $("tabText").addEventListener("click", function () { setBldTab(false); });
    var timer = null;
    $("xyzInput").addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(parseToBuilder, 350);
    });
    parseToBuilder(); // seed the preview from the example geometry
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
    App.diagrams.renderExchange($("exchange"));
    App.builder.render();
    renderBldInfo();
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
    App.scanCtl.refresh();
  }

  // charts and canvases re-painted with the new palette on a theme switch
  function rerenderTheme() {
    App.heatmap.refreshTheme();
    App.diagrams.renderExchange($("exchange"));
    App.builder.render();
    if (!state.result) return;
    drawMap();
    renderLevels();
    renderVib();
    App.scanCtl.refresh();
  }

  // ---------- init ----------
  function init() {
    App.theme.init();
    App.i18n.init();
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
    App.help.init();

    var sel = $("molSelect");
    fillMolSelect();
    sel.addEventListener("change", function () { selectPreset(sel.value); });
    $("computeBtn").addEventListener("click", function () {
      loadMolecule($("xyzInput").value, parseInt($("chargeInput").value, 10) || 0, null);
    });
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

    if (App.view3d.supported() && App.view3d.init($("gl"), $("glLabels"))) {
      $("btn3d").style.display = "";
      $("btn3d").addEventListener("click", function () {
        setView(state.view === "2d" ? "3d" : "2d");
      });
    }
    App.scanCtl.init({ apply: applyScanGeometry });

    App.exporter.init({
      getResult: function () { return state.result; },
      getMode: function () { return state.mode; },
      getPreset: function () { return state.preset; },
      getView: function () { return state.view; },
      getCanvas2d: function () { return $("density"); },
      getCanvasGl: function () { return $("gl"); },
      ensurePrep3d: ensurePrep3d
    });
    ["btnPng", "btnCube", "btnJson"].forEach(function (id) {
      $(id).addEventListener("click", function () {
        if (!state.result || state.busy) return;
        if (id === "btnPng") App.exporter.png();
        else if (id === "btnCube") App.exporter.cube();
        else App.exporter.json();
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

    App.diagrams.renderExchange($("exchange"));
    selectPreset("H2");
  }

  document.addEventListener("DOMContentLoaded", init);
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
