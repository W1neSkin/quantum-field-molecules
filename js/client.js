// Compute client: the only place the UI requests calculations from.
// Public API remains App.compute; low-level worker/cache logic is in client-core.js.
(function (App) {
  "use strict";

  // Node self-check requires this file directly, so pull in client-core.js when needed.
  if (!App.computeCore && typeof require === "function") {
    try { require("./client-core.js"); } catch (e) { /* browser path: ignore */ }
  }
  var core = App.computeCore;
  if (!core) throw new Error("App.computeCore is not loaded");

  // request({xyz, charge, mult, basis, onProgress}) -> Promise<result and {fromCache}>
  function request(opts) {
    core.cancelPending(function (p) { return p.kind === "compute" || p.kind === "scan"; },
      "Superseded by a newer compute request", true);
    var key = core.cacheKey(opts.xyz, opts.charge, opts.mult, opts.basis);
    var memHit = core.memGet(key);
    if (memHit) return Promise.resolve(Object.assign({ fromCache: true }, memHit));

    return core.idbGet(key).then(function (cached) {
      if (cached) {
        core.memSet(key, cached);
        return Object.assign({ fromCache: true }, cached);
      }
      var transport = "worker";
      return new Promise(function (resolve, reject) {
        var id = core.addPending("compute", opts.onProgress, resolve, reject);
        var w = core.getWorker();
        if (w) {
          w.postMessage({ id: id, lang: App.LANG, xyz: opts.xyz, charge: opts.charge, mult: opts.mult, basis: opts.basis });
        } else {
          transport = "main";
          // main-thread fallback: UI freezes during heavy jobs, documented for file://
          setTimeout(function () {
            var p = core.getPending(id);
            if (!p) return; // cancelled before start
            try {
              var result = App.engine.compute(opts.xyz, opts.charge, opts.mult, opts.basis, function (prog) {
                var pp = core.getPending(id);
                if (pp && pp.onProgress) pp.onProgress(prog);
              });
              if (!core.getPending(id)) return;
              core.removePending(id);
              resolve(result);
            } catch (e) {
              if (!core.getPending(id)) return;
              core.removePending(id);
              reject(e);
            }
          }, 30);
        }
      }).then(function (result) {
        // remember where the fresh result came from; useful for provenance manifest
        if (result && !result.__transport) result.__transport = transport;
        core.memSet(key, result);
        core.idbPut(key, result);
        return result;
      });
    });
  }

  // requestScan({key, sym:[s1,s2], charge, mult, basis, rs, onProgress}) -> Promise<{points}>
  function requestScan(opts) {
    core.cancelPending(function (p) { return p.kind === "scan"; }, "Superseded by a newer scan request", true);
    var memHit = core.memGet(opts.key);
    if (memHit) return Promise.resolve(memHit);

    return core.idbGet(opts.key).then(function (cached) {
      if (cached) { core.memSet(opts.key, cached); return cached; }
      return new Promise(function (resolve, reject) {
        var id = core.addPending("scan", opts.onProgress, resolve, reject);
        var w = core.getWorker();
        if (w) {
          w.postMessage({ id: id, type: "scan", lang: App.LANG, sym: opts.sym, charge: opts.charge, mult: opts.mult,
            basis: opts.basis, rs: opts.rs });
        } else {
          // main-thread fallback: one point per tick
          var points = [], i = 0;
          (function step() {
            var p = core.getPending(id);
            if (!p) return; // cancelled
            try {
              var xyz = opts.sym[0] + " 0 0 0\n" + opts.sym[1] + " 0 0 " + opts.rs[i].toFixed(4);
              points.push({ R: opts.rs[i], result: App.engine.compute(xyz, opts.charge, opts.mult, opts.basis) });
            } catch (e) {
              if (!core.getPending(id)) return;
              core.removePending(id);
              reject(e);
              return;
            }
            if (p.onProgress) p.onProgress({ stage: "scan", frac: (i + 1) / opts.rs.length });
            if (++i < opts.rs.length) setTimeout(step, 0);
            else {
              if (!core.getPending(id)) return;
              core.removePending(id);
              resolve({ points: points });
            }
          })();
        }
      }).then(function (result) {
        core.memSet(opts.key, result);
        core.idbPut(opts.key, result);
        return result;
      });
    });
  }

  // requestOpt({xyz, charge, mult, basis, onProgress}) -> Promise<opt summary>
  function requestOpt(opts) {
    core.cancelPending(function (p) { return p.kind === "opt"; }, "Superseded by a newer optimization request", true);
    var key = "opt:" + core.cacheKey(opts.xyz, opts.charge, opts.mult, opts.basis);
    var memHit = core.memGet(key);
    if (memHit) return Promise.resolve(memHit);

    return core.idbGet(key).then(function (cached) {
      if (cached) { core.memSet(key, cached); return cached; }
      return new Promise(function (resolve, reject) {
        var id = core.addPending("opt", opts.onProgress, resolve, reject);
        var w = core.getWorker();
        if (w) {
          w.postMessage({ id: id, type: "opt", lang: App.LANG, xyz: opts.xyz, charge: opts.charge,
            mult: opts.mult, basis: opts.basis });
        } else {
          setTimeout(function () {
            var p = core.getPending(id);
            if (!p) return;
            try {
              var result = App.optimize.run(opts.xyz, opts.charge, opts.mult, opts.basis, function (prog) {
                var pp = core.getPending(id);
                if (pp && pp.onProgress) pp.onProgress(prog);
              });
              if (!core.getPending(id)) return;
              core.removePending(id);
              resolve(result);
            } catch (e) {
              if (!core.getPending(id)) return;
              core.removePending(id);
              reject(e);
            }
          }, 30);
        }
      }).then(function (result) {
        core.memSet(key, result);
        core.idbPut(key, result);
        return result;
      });
    });
  }

  // requestVib({xyz, charge, mult, basis, onProgress}) -> Promise<{modes, nimag}>
  function requestVib(opts) {
    core.cancelPending(function (p) { return p.kind === "vib"; }, "Superseded by a newer vibration request", true);
    var key = "vib:" + core.cacheKey(opts.xyz, opts.charge, opts.mult, opts.basis);
    var memHit = core.memGet(key);
    if (memHit) return Promise.resolve(memHit);

    return core.idbGet(key).then(function (cached) {
      if (cached) { core.memSet(key, cached); return cached; }
      return new Promise(function (resolve, reject) {
        var id = core.addPending("vib", opts.onProgress, resolve, reject);
        var w = core.getWorker();
        if (w) {
          w.postMessage({ id: id, type: "vib", lang: App.LANG, xyz: opts.xyz, charge: opts.charge,
            mult: opts.mult, basis: opts.basis });
        } else {
          setTimeout(function () {
            var p = core.getPending(id);
            if (!p) return;
            try {
              var result = App.vib.run(opts.xyz, opts.charge, opts.mult, opts.basis, function (prog) {
                var pp = core.getPending(id);
                if (pp && pp.onProgress) pp.onProgress(prog);
              });
              if (!core.getPending(id)) return;
              core.removePending(id);
              resolve(result);
            } catch (e) {
              if (!core.getPending(id)) return;
              core.removePending(id);
              reject(e);
            }
          }, 30);
        }
      }).then(function (result) {
        core.memSet(key, result);
        core.idbPut(key, result);
        return result;
      });
    });
  }

  // requestSearch({seed, charge, basis, targets, opts, onProgress}) -> Promise<{candidates}>
  // Inverse design: not cached (results depend on the live target spec).
  function requestSearch(opts) {
    core.cancelPending(function (p) { return p.kind === "search"; }, "Superseded by a newer search request", true);
    return new Promise(function (resolve, reject) {
      var id = core.addPending("search", opts.onProgress, resolve, reject);
      var w = core.getWorker();
      if (w) {
        w.postMessage({ id: id, type: "search", lang: App.LANG, seed: opts.seed,
          charge: opts.charge, basis: opts.basis, targets: opts.targets, opts: opts.opts });
        return;
      }
      // main-thread fallback: one candidate per tick (UI freezes during each SCF)
      setTimeout(function () {
        if (!core.getPending(id)) return;
        var cands;
        try { cands = App.finderCore.genCandidates(opts.seed, opts.opts); }
        catch (e) { if (core.getPending(id)) { core.removePending(id); reject(e); } return; }
        var out = [], i = 0;
        (function step() {
          var p = core.getPending(id);
          if (!p) return; // cancelled
          if (i >= cands.length) {
            core.removePending(id);
            resolve({ candidates: App.finderCore.rank(out, opts.targets), evaluated: out.length });
            return;
          }
          try {
            var xyz = App.finderCore.atomsToXyz(cands[i].atoms);
            var res = App.engine.compute(xyz, opts.charge || 0, 0, opts.basis || "STO-3G");
            out.push({ label: cands[i].label, formula: cands[i].formula, xyz: xyz,
              desc: App.finderCore.descriptors(res) });
          } catch (e) { /* skip bad candidate */ }
          if (p.onProgress) p.onProgress({ stage: "search", frac: (i + 1) / cands.length });
          i++;
          setTimeout(step, 0);
        })();
      }, 30);
    });
  }

  App.compute = {
    request: request,
    requestScan: requestScan,
    requestOpt: requestOpt,
    requestVib: requestVib,
    requestSearch: requestSearch,
    cacheKey: core.cacheKey,
    isCancelledError: core.isCancelledError
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
