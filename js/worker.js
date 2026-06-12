// Web Worker entry: same engine files as the page, off the UI thread.
// Dictionaries are imported so engine errors are thrown already localized.
importScripts("i18n.js", "lang/en.js", "lang/ru.js", "lang/de.js", "lang/es.js",
  "lang/zh.js",
  "basis.js", "basis631.js", "linalg.js", "integrals.js", "eri.js", "scf.js",
  "uhf.js", "props.js", "fci2.js", "engine.js", "optimize.js", "vib.js");

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.lang) globalThis.App.LANG = msg.lang;
  try {
    if (msg.type === "vib") {
      var vib = globalThis.App.vib.run(msg.xyz, msg.charge, msg.mult, msg.basis, function (f) {
        self.postMessage({ type: "progress", id: msg.id, progress: { stage: "vib", frac: f } });
      });
      self.postMessage({ type: "result", id: msg.id, result: vib });
      return;
    }
    if (msg.type === "opt") {
      var opt = globalThis.App.optimize.run(msg.xyz, msg.charge, msg.mult, msg.basis, function (s) {
        self.postMessage({ type: "progress", id: msg.id,
          progress: { stage: "opt", iter: s.iter, E: s.E, gmax: s.gmax } });
      });
      self.postMessage({ type: "result", id: msg.id, result: opt });
      return;
    }
    if (msg.type === "scan") {
      // diatomic R-scan along z, one SCF per point
      var points = msg.rs.map(function (R, i) {
        var xyz = msg.sym[0] + " 0 0 0\n" + msg.sym[1] + " 0 0 " + R.toFixed(4);
        var res = globalThis.App.engine.compute(xyz, msg.charge, msg.mult, msg.basis);
        self.postMessage({ type: "progress", id: msg.id, progress: { stage: "scan", frac: (i + 1) / msg.rs.length } });
        return { R: R, result: res };
      });
      self.postMessage({ type: "result", id: msg.id, result: { points: points } });
      return;
    }
    var result = globalThis.App.engine.compute(msg.xyz, msg.charge, msg.mult, msg.basis, function (p) {
      self.postMessage({ type: "progress", id: msg.id, progress: p });
    });
    self.postMessage({ type: "result", id: msg.id, result: result });
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, error: err.message });
  }
};
