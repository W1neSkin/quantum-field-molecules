// Compute client: the only place the UI requests calculations from.
// Transport today: Web Worker (or main thread on file://). The same
// request/response contract could be served by an HTTP backend later.
// Results are cached in memory and IndexedDB, keyed by geometry+charge.
(function (App) {
  "use strict";

  var worker = null, workerBroken = false;
  var pending = {}, nextId = 1;
  var memCache = {};
  var memLru = [];
  var MEM_CACHE_MAX = 36;

  function cacheKey(xyz, charge, mult, basis) {
    var norm = xyz.split("\n").map(function (l) { return l.trim().replace(/\s+/g, " "); })
      .filter(Boolean).join("\n") + "|q=" + (charge || 0) + "|m=" + (mult || 0) +
      "|b=" + (basis || "STO-3G");
    var h = 5381;
    for (var i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
    return "v3:" + h.toString(16) + ":" + norm.length;
  }

  // --- IndexedDB (best effort; absence of cache is never an error) ---
  function withStore(mode, fn) {
    return new Promise(function (resolve) {
      if (typeof indexedDB === "undefined") return resolve(null);
      var req = indexedDB.open("quantum-field-molecules", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("results"); };
      req.onerror = function () { resolve(null); };
      req.onsuccess = function () {
        try {
          var tx = req.result.transaction("results", mode);
          fn(tx.objectStore("results"), resolve);
          tx.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      };
    });
  }
  function idbGet(key) {
    return withStore("readonly", function (store, resolve) {
      var g = store.get(key);
      g.onsuccess = function () { resolve(g.result || null); };
      g.onerror = function () { resolve(null); };
    });
  }
  function idbPut(key, value) {
    return withStore("readwrite", function (store, resolve) {
      store.put(value, key);
      resolve(true);
    });
  }

  function touchMem(key, value) {
    if (value !== undefined) memCache[key] = value;
    var i = memLru.indexOf(key);
    if (i >= 0) memLru.splice(i, 1);
    memLru.push(key);
    while (memLru.length > MEM_CACHE_MAX) {
      delete memCache[memLru.shift()];
    }
  }

  function rejectAllPending(message) {
    var all = pending;
    pending = {};
    Object.keys(all).forEach(function (id) {
      all[id].reject(new Error(message || "Worker error"));
    });
  }

  function getWorker() {
    if (workerBroken) return null;
    if (worker) return worker;
    try {
      worker = new Worker("js/worker.js");
      worker.onmessage = function (e) {
        var msg = e.data, p = pending[msg.id];
        if (!p) return;
        if (msg.type === "progress") { if (p.onProgress) p.onProgress(msg.progress); return; }
        delete pending[msg.id];
        if (msg.type === "result") p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      };
      worker.onerror = function () {
        workerBroken = true;
        rejectAllPending("Computation worker failed");
        worker = null;
      };
      return worker;
    } catch (e) {
      workerBroken = true; // file:// or CSP: fall back to main thread
      return null;
    }
  }

  // request({xyz, charge, mult, basis, onProgress}) -> Promise<result and {fromCache}>
  function request(opts) {
    var key = cacheKey(opts.xyz, opts.charge, opts.mult, opts.basis);
    if (memCache[key]) {
      touchMem(key);
      return Promise.resolve(Object.assign({ fromCache: true }, memCache[key]));
    }

    return idbGet(key).then(function (cached) {
      if (cached) {
        touchMem(key, cached);
        return Object.assign({ fromCache: true }, cached);
      }
      return new Promise(function (resolve, reject) {
        var w = getWorker();
        if (w) {
          var id = nextId++;
          pending[id] = { resolve: resolve, reject: reject, onProgress: opts.onProgress };
          w.postMessage({ id: id, lang: App.LANG, xyz: opts.xyz, charge: opts.charge, mult: opts.mult, basis: opts.basis });
        } else {
          // main-thread fallback: UI freezes during heavy jobs, documented for file://
          setTimeout(function () {
            try { resolve(App.engine.compute(opts.xyz, opts.charge, opts.mult, opts.basis, opts.onProgress)); }
            catch (e) { reject(e); }
          }, 30);
        }
      }).then(function (result) {
        touchMem(key, result);
        idbPut(key, result);
        return result;
      });
    });
  }

  // requestScan({key, sym:[s1,s2], charge, mult, rs, onProgress}) -> Promise<{points}>
  // Same worker/cache plumbing as request(); cached whole-scan under the key.
  function requestScan(opts) {
    if (memCache[opts.key]) {
      touchMem(opts.key);
      return Promise.resolve(memCache[opts.key]);
    }
    return idbGet(opts.key).then(function (cached) {
      if (cached) { touchMem(opts.key, cached); return cached; }
      return new Promise(function (resolve, reject) {
        var w = getWorker();
        if (w) {
          var id = nextId++;
          pending[id] = { resolve: resolve, reject: reject, onProgress: opts.onProgress };
          w.postMessage({ id: id, type: "scan", lang: App.LANG, sym: opts.sym, charge: opts.charge, mult: opts.mult,
            basis: opts.basis, rs: opts.rs });
        } else {
          // main-thread fallback: one point per tick
          var points = [], i = 0;
          (function step() {
            try {
              var xyz = opts.sym[0] + " 0 0 0\n" + opts.sym[1] + " 0 0 " + opts.rs[i].toFixed(4);
              points.push({ R: opts.rs[i], result: App.engine.compute(xyz, opts.charge, opts.mult, opts.basis) });
            } catch (e) { reject(e); return; }
            if (opts.onProgress) opts.onProgress({ stage: "scan", frac: (i + 1) / opts.rs.length });
            if (++i < opts.rs.length) setTimeout(step, 0);
            else resolve({ points: points });
          })();
        }
      }).then(function (result) {
        touchMem(opts.key, result);
        idbPut(opts.key, result);
        return result;
      });
    });
  }

  // requestOpt({xyz, charge, mult, basis, onProgress}) -> Promise<opt summary>
  function requestOpt(opts) {
    var key = "opt:" + cacheKey(opts.xyz, opts.charge, opts.mult, opts.basis);
    if (memCache[key]) { touchMem(key); return Promise.resolve(memCache[key]); }
    return idbGet(key).then(function (cached) {
      if (cached) { touchMem(key, cached); return cached; }
      return new Promise(function (resolve, reject) {
        var w = getWorker();
        if (w) {
          var id = nextId++;
          pending[id] = { resolve: resolve, reject: reject, onProgress: opts.onProgress };
          w.postMessage({ id: id, type: "opt", lang: App.LANG, xyz: opts.xyz, charge: opts.charge,
            mult: opts.mult, basis: opts.basis });
        } else {
          setTimeout(function () {
            try { resolve(App.optimize.run(opts.xyz, opts.charge, opts.mult, opts.basis, opts.onProgress)); }
            catch (e) { reject(e); }
          }, 30);
        }
      }).then(function (result) {
        touchMem(key, result);
        idbPut(key, result);
        return result;
      });
    });
  }

  // requestVib({xyz, charge, mult, basis, onProgress}) -> Promise<{modes, nimag}>
  function requestVib(opts) {
    var key = "vib:" + cacheKey(opts.xyz, opts.charge, opts.mult, opts.basis);
    if (memCache[key]) { touchMem(key); return Promise.resolve(memCache[key]); }
    return idbGet(key).then(function (cached) {
      if (cached) { touchMem(key, cached); return cached; }
      return new Promise(function (resolve, reject) {
        var w = getWorker();
        if (w) {
          var id = nextId++;
          pending[id] = { resolve: resolve, reject: reject, onProgress: opts.onProgress };
          w.postMessage({ id: id, type: "vib", lang: App.LANG, xyz: opts.xyz, charge: opts.charge,
            mult: opts.mult, basis: opts.basis });
        } else {
          setTimeout(function () {
            try { resolve(App.vib.run(opts.xyz, opts.charge, opts.mult, opts.basis, opts.onProgress)); }
            catch (e) { reject(e); }
          }, 30);
        }
      }).then(function (result) {
        touchMem(key, result);
        idbPut(key, result);
        return result;
      });
    });
  }

  App.compute = { request: request, requestScan: requestScan, requestOpt: requestOpt,
    requestVib: requestVib, cacheKey: cacheKey };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
