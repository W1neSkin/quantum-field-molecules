// Orchestration: XYZ text -> basis -> integrals -> RHF -> result payload.
// Pure computation, no DOM; runs in a Web Worker, the main thread, or node.
(function (App) {
  "use strict";

  var ANGSTROM_TO_BOHR = 1 / 0.529177210903;
  var SYM_TO_Z = {};
  App.SYMBOLS.forEach(function (s, z) { if (s) SYM_TO_Z[s.toLowerCase()] = z; });

  // Parse XYZ text (with or without the count/comment header), coordinates in angstrom.
  function parseXYZ(text) {
    var lines = text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length && /^\d+$/.test(lines[0])) lines = lines.slice(2);
    var atoms = lines.map(function (line, idx) {
      var parts = line.split(/[\s,]+/);
      if (parts.length < 4) throw new Error(App.tr("err.parse.line", { n: idx + 1 }));
      var z = SYM_TO_Z[parts[0].toLowerCase()];
      if (!z) throw new Error(App.tr("err.parse.elem", { s: parts[0] }));
      var xyz = parts.slice(1, 4).map(Number);
      if (xyz.some(isNaN)) throw new Error(App.tr("err.parse.coords", { n: idx + 1 }));
      return { Z: z, xyz: xyz.map(function (c) { return c * ANGSTROM_TO_BOHR; }) };
    });
    if (!atoms.length) throw new Error(App.tr("err.parse.empty"));
    if (atoms.length > 30) throw new Error(App.tr("err.parse.maxatoms"));
    return atoms;
  }

  // Full pipeline. mult = 2S+1 (0/undefined: auto — singlet RHF for even
  // electron counts, doublet UHF for odd). Returns a structured-clone payload.
  function compute(xyzText, charge, mult, basisName, onProgress) {
    var t0 = Date.now();
    basisName = basisName || "STO-3G";
    var atoms = parseXYZ(xyzText);
    var basis = App.buildBasis(atoms, basisName);
    if (basis.length > 90) {
      throw new Error(App.tr("err.basis.toobig", { n: basis.length }));
    }
    var nelec = atoms.reduce(function (s, a) { return s + a.Z; }, 0) - (charge || 0);
    if (!mult) mult = nelec % 2 ? 2 : 1;

    if (onProgress) onProgress({ stage: "integrals", frac: 0 });
    var ints = App.integrals.oneElectron(basis, atoms);
    var eri = App.eri.computeERI(basis, function (f) {
      if (onProgress) onProgress({ stage: "eri", frac: f });
    });

    if (onProgress) onProgress({ stage: "scf", frac: 0 });
    var scf = mult > 1
      ? App.uhf.runUHF(atoms, basis, ints, eri, charge || 0, mult)
      : App.scf.runRHF(atoms, basis, ints, eri, charge || 0);

    var props = App.props.compute(atoms, basis, ints.S, scf);
    if (scf.nelec === 2 && !scf.uhf && basis.length <= 14) {
      scf.fci = App.fci2.compute(atoms, basis, ints, eri, scf);
    }

    return {
      atoms: atoms,
      basis: basis.map(function (f) {
        return { atom: f.atom, center: f.center, l: f.l, m: f.m, n: f.n,
                 exps: f.exps, coefs: f.coefs, label: f.label };
      }),
      scf: scf,
      props: props,
      mult: mult,
      basisName: basisName,
      elapsedMs: Date.now() - t0
    };
  }

  App.engine = { compute: compute, parseXYZ: parseXYZ, ANGSTROM_TO_BOHR: ANGSTROM_TO_BOHR };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
