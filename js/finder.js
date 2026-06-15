// Inverse-design lab (UI): the user names target properties, we substitute one
// atom at a time in the current molecule, relax and rank the candidates.
// All heavy lifting (generation, SCF, scoring) lives in finder-core.js and runs
// in the Web Worker; this file is only the panel and result list.
//
// Honesty note: candidates are HF/STO-3G guesses from a tiny search space, not
// validated designs - the inline note says so and existing guardrails apply.
(function (App) {
  "use strict";

  var deps = null;
  var S = { running: false, results: [] };
  var $ = function (id) { return document.getElementById(id); };

  // result.atoms carry bohr; the core and editor both work in angstrom.
  function seedAngstrom(result) {
    if (!result || !result.atoms || !result.atoms.length) return null;
    var BOHR = 1 / App.engine.ANGSTROM_TO_BOHR;
    return result.atoms.map(function (a) {
      return { Z: a.Z, xyz: [a.xyz[0] * BOHR, a.xyz[1] * BOHR, a.xyz[2] * BOHR] };
    });
  }

  function readTargets() {
    function num(id, def) { var v = parseFloat($(id).value); return isNaN(v) ? def : v; }
    var tg = {
      dipole: { on: $("finderDipoleOn").checked, val: num("finderDipole", 0) },
      gap: { on: $("finderGapOn").checked, val: num("finderGap", 10) },
      ip: { on: $("finderIpOn").checked, val: num("finderIp", 12) },
      shell: { on: $("finderShellOn").checked, val: $("finderShell").value }
    };
    tg._any = tg.dipole.on || tg.gap.on || tg.ip.on || tg.shell.on;
    return tg;
  }

  function setMsg(s) { if ($("finderMsg")) $("finderMsg").textContent = s; }

  function runningUi(on) {
    var b = $("finderRunBtn");
    if (b) b.disabled = on;
  }

  function fmt(v, unit, digits) {
    if (v == null || !isFinite(v)) return "-";
    return v.toFixed(digits == null ? 2 : digits) + (unit ? " " + unit : "");
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function chip(text, extra) { return el("span", "chip" + (extra ? " " + extra : ""), text); }

  // The targets that are ticked get a highlighted cell; the rest dim out so it
  // is obvious which properties drive the ranking.
  var TARGETS = [
    ["finderDipoleOn", "finderTgtDipole", "finderDipole"],
    ["finderGapOn", "finderTgtGap", "finderGap"],
    ["finderIpOn", "finderTgtIp", "finderIp"],
    ["finderShellOn", "finderTgtShell", "finderShell"]
  ];
  function syncTargets() {
    TARGETS.forEach(function (t) {
      var cb = $(t[0]), cell = $(t[1]), inp = $(t[2]);
      if (!cb || !cell || !inp) return;
      cell.classList.toggle("on", cb.checked);
      inp.disabled = !cb.checked;
    });
  }

  function renderResults() {
    var box = $("finderRows");
    if (!box) return;
    box.innerHTML = "";
    var t = App.i18n.t;
    if (!S.results.length) {
      if (!S.running) box.appendChild(el("p", "small muted", t("finder.empty")));
      return;
    }
    S.results.slice(0, 8).forEach(function (c, idx) {
      var d = c.desc || {};
      var row = el("div", "finder-row" + (idx === 0 ? " best" : ""));

      var head = el("div", "finder-row__head");
      var name = el("div", "finder-row__name");
      name.appendChild(el("span", "finder-rank", "#" + (idx + 1)));
      name.appendChild(el("b", null, c.formula));
      name.appendChild(el("span", "small muted", c.label));
      var btn = el("button", "btn", t("finder.load"));
      btn.addEventListener("click", function () { loadCandidate(c); });
      head.appendChild(name);
      head.appendChild(btn);

      var meta = el("div", "finder-meta");
      meta.appendChild(chip("\u03bc " + fmt(d.dipoleD, "D")));
      meta.appendChild(chip("gap " + fmt(d.gapEv, "eV")));
      meta.appendChild(chip("IP " + fmt(d.ipEv, "eV")));
      meta.appendChild(chip(t(d.openShell ? "finder.shell.open" : "finder.shell.closed")));
      meta.appendChild(chip(t("finder.scoreShort") + " " + fmt(c.score, "", 2), "score"));

      row.appendChild(head);
      row.appendChild(meta);
      box.appendChild(row);
    });
  }

  function loadCandidate(c) {
    if (!c || !c.xyz) return;
    if (deps && deps.isBusy && deps.isBusy()) return;
    if (deps && deps.loadXyz) deps.loadXyz(c.xyz);
  }

  function run() {
    if (S.running) return;
    var t = App.i18n.t;
    var result = deps && deps.getResult ? deps.getResult() : null;
    var seed = seedAngstrom(result);
    if (!seed) { setMsg(t("finder.noseed")); return; }
    var targets = readTargets();
    if (!targets._any) { setMsg(t("finder.notarget")); return; }

    S.running = true;
    runningUi(true);
    S.results = [];
    renderResults();
    setMsg(t("finder.running", { n: 0 }));

    App.compute.requestSearch({
      seed: seed,
      charge: deps && deps.getCharge ? deps.getCharge() : 0,
      basis: "STO-3G", // forced: fast and benchmark-validated for the search loop
      targets: targets,
      opts: { cap: 20, relaxIters: 40, relax: true },
      onProgress: function (p) {
        if (p && p.frac != null) setMsg(t("finder.running", { n: Math.round(p.frac * 100) }));
      }
    }).then(function (res) {
      S.running = false;
      runningUi(false);
      S.results = (res && res.candidates) || [];
      renderResults();
      setMsg(t("finder.done", { n: S.results.length, total: (res && res.evaluated) || 0 }));
    }).catch(function (e) {
      S.running = false;
      runningUi(false);
      if (App.compute.isCancelledError && App.compute.isCancelledError(e)) { setMsg(t("finder.cancelled")); return; }
      setMsg(t("finder.error", { msg: (e && e.message) || e }));
    });
  }

  function refreshImpl() {
    if (typeof document === "undefined") return;
    if (!$("finderSeed")) return;
    var t = App.i18n.t;
    var result = deps && deps.getResult ? deps.getResult() : null;
    var seed = seedAngstrom(result);
    $("finderSeed").textContent = seed
      ? t("finder.seed", { f: App.finderCore.formula(seed), n: seed.length })
      : t("finder.noseed");
    if ($("finderNote")) $("finderNote").textContent = t("finder.note");
    syncTargets();
    if (!S.running) renderResults();
  }

  // Optional lab panel: never let it throw into the render pipeline.
  function refresh() {
    try { refreshImpl(); }
    catch (e) { if (typeof console !== "undefined" && console.error) console.error("finder refresh failed:", e); }
  }

  function init(opts) {
    deps = opts || {};
    if (typeof document === "undefined") return;
    var btn = $("finderRunBtn");
    if (!btn) return;
    btn.addEventListener("click", run);
    TARGETS.forEach(function (t) {
      var cb = $(t[0]);
      if (cb) cb.addEventListener("change", syncTargets);
    });
    refresh();
  }

  App.finder = {
    init: init,
    refresh: refresh,
    readTargets: readTargets
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
