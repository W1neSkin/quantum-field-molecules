// Web Worker entry: same engine files as the page, off the UI thread.
// Dictionaries are imported so engine errors are thrown already localized.
importScripts("i18n.js", "lang/en.js", "lang/ru.js", "lang/de.js", "lang/es.js",
  "lang/zh.js",
  "basis.js", "basis631.js", "linalg.js", "integrals.js", "eri.js", "scf.js",
  "uhf.js", "props.js", "fci2.js", "engine.js", "optimize.js", "vib.js");

var cancelled = Object.create(null);

function isCancelled(id) { return !!cancelled[id]; }
function clearCancelled(id) { delete cancelled[id]; }

function postProgress(id, progress) {
  if (isCancelled(id)) return false;
  self.postMessage({ type: "progress", id: id, progress: progress });
  return !isCancelled(id);
}

function postResult(id, result) {
  if (isCancelled(id)) { clearCancelled(id); return; }
  self.postMessage({ type: "result", id: id, result: result });
  clearCancelled(id);
}

function postError(id, err) {
  if (isCancelled(id)) { clearCancelled(id); return; }
  self.postMessage({ type: "error", id: id, error: err && err.message ? err.message : String(err) });
  clearCancelled(id);
}

function runScan(msg) {
  var id = msg.id;
  var points = [];
  var i = 0;
  (function step() {
    if (isCancelled(id)) { clearCancelled(id); return; }
    try {
      var R = msg.rs[i];
      var xyz = msg.sym[0] + " 0 0 0\n" + msg.sym[1] + " 0 0 " + R.toFixed(4);
      var res = globalThis.App.engine.compute(xyz, msg.charge, msg.mult, msg.basis);
      points.push({ R: R, result: res });
      postProgress(id, { stage: "scan", frac: (i + 1) / msg.rs.length });
      i++;
      if (i < msg.rs.length) setTimeout(step, 0);
      else postResult(id, { points: points });
    } catch (err) {
      postError(id, err);
    }
  })();
}

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type === "cancel") {
    cancelled[msg.id] = true;
    return;
  }
  if (msg.lang) globalThis.App.LANG = msg.lang;
  try {
    if (msg.type === "vib") {
      if (isCancelled(msg.id)) { clearCancelled(msg.id); return; }
      var vib = globalThis.App.vib.run(msg.xyz, msg.charge, msg.mult, msg.basis, function (f) {
        postProgress(msg.id, { stage: "vib", frac: f });
      });
      postResult(msg.id, vib);
      return;
    }
    if (msg.type === "opt") {
      if (isCancelled(msg.id)) { clearCancelled(msg.id); return; }
      var opt = globalThis.App.optimize.run(msg.xyz, msg.charge, msg.mult, msg.basis, function (s) {
        postProgress(msg.id, { stage: "opt", iter: s.iter, E: s.E, gmax: s.gmax });
      });
      postResult(msg.id, opt);
      return;
    }
    if (msg.type === "scan") {
      // diatomic R-scan along z, one SCF per point; stepped to keep the worker responsive.
      runScan(msg);
      return;
    }
    if (isCancelled(msg.id)) { clearCancelled(msg.id); return; }
    var result = globalThis.App.engine.compute(msg.xyz, msg.charge, msg.mult, msg.basis, function (p) {
      postProgress(msg.id, p);
    });
    postResult(msg.id, result);
  } catch (err) {
    postError(msg.id, err);
  }
};
