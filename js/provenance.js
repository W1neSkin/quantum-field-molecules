// Scientific provenance manifest for each computed result.
// Keeps method/inputs/source metadata together for reproducibility.
(function (App) {
  "use strict";

  function pickSource(result) {
    if (result && result.fromCache) return "cache";
    if (result && result.__transport === "main") return "main";
    return "worker";
  }

  function build(opts) {
    var result = opts.result || {};
    var scf = result.scf || {};
    var charge = opts.charge || 0;
    var mult = opts.mult || 0;
    var basis = opts.basis || result.basisName || "STO-3G";
    return {
      schema: "qfm-provenance-v1",
      generatedAt: new Date().toISOString(),
      requestKey: App.compute.cacheKey(opts.xyz || "", charge, mult, basis),
      kernel: "hf-js",
      kernelVersion: "2026.06",
      source: pickSource(result),
      method: scf.uhf ? "UHF" : "RHF",
      basis: result.basisName || basis,
      charge: charge,
      multiplicity: result.mult != null ? result.mult : mult,
      parameters: { basis: basis, charge: charge, multiplicity: mult },
      validityRange: {
        scope: "educational Hartree-Fock in browser",
        note: "best for qualitative trends and small-to-medium molecules"
      },
      testReference: "test/selfcheck.js",
      iterations: scf.iterations != null ? scf.iterations : null,
      elapsedMs: result.elapsedMs != null ? result.elapsedMs : null,
      fromCache: !!result.fromCache
    };
  }

  function formatForUi(p, t) {
    if (!p) return [];
    var srcKey = p.source === "cache"
      ? "prov.src.cache"
      : p.source === "main"
        ? "prov.src.main"
        : "prov.src.worker";
    return [
      { key: t("prov.method"), value: p.method + "/" + p.basis },
      { key: t("prov.src"), value: t(srcKey) },
      { key: t("prov.state"), value: "q=" + p.charge + ", m=" + p.multiplicity },
      { key: t("prov.iters"), value: p.iterations != null ? String(p.iterations) : "-" },
      { key: t("prov.hash"), value: p.requestKey, mono: true }
    ];
  }

  App.provenance = { build: build, formatForUi: formatForUi };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
