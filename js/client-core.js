// Compute client core extracted from client.js:
// worker transport, cancellation, and shared caches.
(function (App) {
  "use strict";

  var worker = null, workerBroken = false;
  var pending = {}, nextId = 1;
  var memCache = {};
  var memLru = [];
  var MEM_CACHE_MAX = 36;
  var CANCEL_ERR = "Request cancelled";

  function makeCancelledError(message) {
    var err = new Error(message || CANCEL_ERR);
    err.cancelled = true;
    return err;
  }

  function isCancelledError(err) {
    return !!(err && err.cancelled);
  }

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

  function memGet(key) {
    if (!memCache[key]) return null;
    touchMem(key);
    return memCache[key];
  }

  function memSet(key, value) {
    touchMem(key, value);
  }

  function addPending(kind, onProgress, resolve, reject) {
    var id = nextId++;
    pending[id] = { kind: kind, onProgress: onProgress, resolve: resolve, reject: reject };
    return id;
  }

  function getPending(id) { return pending[id] || null; }

  function removePending(id) { delete pending[id]; }

  function rejectAllPending(message) {
    var all = pending;
    pending = {};
    Object.keys(all).forEach(function (id) {
      all[id].reject(new Error(message || "Worker error"));
    });
  }

  function terminateWorker() {
    if (!worker) return;
    try { worker.terminate(); } catch (e) { /* noop */ }
    worker = null;
  }

  // Cancel selected in-flight requests and optionally restart the worker.
  // Restarting is important because the worker runs one task at a time:
  // terminating it is the only way to stop a long synchronous compute.
  function cancelPending(filter, message, restartWorker) {
    var ids = Object.keys(pending).filter(function (id) {
      return filter ? filter(pending[id]) : true;
    });
    if (!ids.length) return;
    ids.forEach(function (id) {
      var p = pending[id];
      delete pending[id];
      try {
        if (worker && !workerBroken) worker.postMessage({ type: "cancel", id: +id });
      } catch (e) { /* noop */ }
      p.reject(makeCancelledError(message || CANCEL_ERR));
    });
    if (restartWorker) {
      terminateWorker();
      workerBroken = false;
      // The terminated worker can no longer answer any job it was still running.
      // Reject every remaining (other-kind) request so its caller never hangs.
      var stranded = pending;
      pending = {};
      Object.keys(stranded).forEach(function (id) {
        stranded[id].reject(makeCancelledError(message || CANCEL_ERR));
      });
    }
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
        else if (msg.type === "cancelled") p.reject(makeCancelledError(msg.error || CANCEL_ERR));
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

  App.computeCore = {
    CANCEL_ERR: CANCEL_ERR,
    makeCancelledError: makeCancelledError,
    isCancelledError: isCancelledError,
    cacheKey: cacheKey,
    idbGet: idbGet,
    idbPut: idbPut,
    memGet: memGet,
    memSet: memSet,
    addPending: addPending,
    getPending: getPending,
    removePending: removePending,
    cancelPending: cancelPending,
    getWorker: getWorker
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
