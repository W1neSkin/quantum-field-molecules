// Numerical self-check of the RHF/STO-3G engine against literature values.
// Run: node test/selfcheck.js
"use strict";

require("../js/i18n.js");
require("../js/lang/en.js");
require("../js/basis.js");
require("../js/basis631.js");
require("../js/linalg.js");
require("../js/integrals.js");
require("../js/eri.js");
require("../js/scf.js");
require("../js/uhf.js");
require("../js/props.js");
require("../js/fci2.js");
require("../js/localize.js");
require("../js/engine.js");
require("../js/optimize.js");
require("../js/vib.js");

var App = globalThis.App;

// Reference RHF/STO-3G total energies (hartree):
// H2 @ 1.4 bohr: Szabo & Ostlund, "Modern Quantum Chemistry", table 3.10: -1.1167
// H2O, CH4, N2, CO: standard STO-3G values reproduced by Psi4/Gaussian
var cases = [
  { name: "H2",  charge: 0, ref: -1.1167, tol: 5e-4,
    xyz: "H 0 0 0\nH 0 0 0.7408" },
  { name: "HeH+", charge: 1, ref: -2.8418, tol: 2e-2,
    xyz: "He 0 0 0\nH 0 0 0.7743" },
  // STO-3G optimized geometry (r = 0.9894 A, angle = 100.03 deg) matches the canonical ref
  { name: "H2O", charge: 0, ref: -74.9659, tol: 2e-3,
    xyz: "O 0 0 0\nH 0.758130 0 0.635742\nH -0.758130 0 0.635742" },
  { name: "CH4", charge: 0, ref: -39.7269, tol: 2e-3,
    xyz: "C 0 0 0\nH 0.6276 0.6276 0.6276\nH 0.6276 -0.6276 -0.6276\nH -0.6276 0.6276 -0.6276\nH -0.6276 -0.6276 0.6276" },
  { name: "N2",  charge: 0, ref: -107.4960, tol: 5e-3,
    xyz: "N 0 0 0\nN 0 0 1.0977" }
];

var failed = 0;
cases.forEach(function (c) {
  var t0 = Date.now();
  try {
    var res = App.engine.compute(c.xyz, c.charge);
    var dE = res.scf.E - c.ref;
    var virial = -(res.scf.EVne + res.scf.EJ + res.scf.EK + res.scf.Enuc) / res.scf.ET;
    var ok = Math.abs(dE) < c.tol && res.scf.converged;
    if (!ok) failed++;
    console.log(
      (ok ? "PASS" : "FAIL"), c.name.padEnd(5),
      "E =", res.scf.E.toFixed(6),
      "ref =", c.ref.toFixed(4),
      "dE =", dE.toExponential(2),
      "virial =", virial.toFixed(4),
      "iters =", res.scf.iterations,
      (Date.now() - t0) + "ms"
    );
  } catch (e) {
    failed++;
    console.log("FAIL", c.name.padEnd(5), "error:", e.message);
  }
});

// --- properties, FCI and UHF invariants ---
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? "PASS" : "FAIL"), name.padEnd(22), detail);
}

try {
  // dipole: H2O at the STO-3G optimized geometry, CCCBDB HF/STO-3G ~ 1.71 D
  var w = App.engine.compute(cases[2].xyz, 0);
  check("dipole H2O", Math.abs(w.props.dipole.debye - 1.71) < 0.06,
    "mu = " + w.props.dipole.debye.toFixed(3) + " D (ref ~1.71)");

  // Mayer bond orders: H2 single, N2 triple
  var h2 = App.engine.compute("H 0 0 0\nH 0 0 0.7414", 0);
  var n2 = App.engine.compute(cases[4].xyz, 0);
  check("Mayer H2", Math.abs(h2.props.mayer[0].order - 1) < 1e-6,
    "B = " + h2.props.mayer[0].order.toFixed(4) + " (ref 1)");
  check("Mayer N2", Math.abs(n2.props.mayer[0].order - 3) < 0.02,
    "B = " + n2.props.mayer[0].order.toFixed(4) + " (ref 3)");

  // FCI for 2 electrons: corr energy at Re, exact dissociation to 2 H atoms
  check("FCI H2 corr", h2.scf.fci && Math.abs(h2.scf.fci.Ecorr - (-0.0206)) < 1e-3,
    "Ecorr = " + h2.scf.fci.Ecorr.toFixed(5) + " (ref -0.0206)");
  var far = App.engine.compute("H 0 0 0\nH 0 0 8.0", 0);
  check("FCI H2 dissoc", Math.abs(far.scf.fci.E - (-0.933164)) < 1e-3,
    "E(8A) = " + far.scf.fci.E.toFixed(5) + " (ref 2*E_H = -0.93316), RHF = " + far.scf.E.toFixed(4));

  // UHF: H atom exact within basis; mult=1 must reproduce RHF exactly
  var h = App.engine.compute("H 0 0 0", 0);
  check("UHF H atom", h.scf.uhf && Math.abs(h.scf.E - (-0.466582)) < 1e-5,
    "E = " + h.scf.E.toFixed(6) + " (ref -0.466582), <S2> = " + h.scf.S2.toFixed(3));

  var atomsW = App.engine.parseXYZ(cases[2].xyz);
  var basisW = App.buildBasis(atomsW);
  var intsW = App.integrals.oneElectron(basisW, atomsW);
  var eriW = App.eri.computeERI(basisW);
  var uW = App.uhf.runUHF(atomsW, basisW, intsW, eriW, 0, 1);
  check("UHF=RHF (H2O m=1)", Math.abs(uW.E - w.scf.E) < 1e-6,
    "dE = " + (uW.E - w.scf.E).toExponential(2));

  // O2 triplet: convergence, near-exact <S2>, virial ratio
  var t0o = Date.now();
  var o2 = App.engine.compute("O 0 0 0\nO 0 0 1.2075", 0, 3);
  var vir = -(o2.scf.EVne + o2.scf.EJ + o2.scf.EK + o2.scf.Enuc) / o2.scf.ET;
  check("UHF O2 triplet", o2.scf.converged && o2.scf.S2 > 2.0 && o2.scf.S2 < 2.15 && Math.abs(vir - 2) < 0.1,
    "E = " + o2.scf.E.toFixed(4) + ", <S2> = " + o2.scf.S2.toFixed(4) +
    " (exact 2), virial = " + vir.toFixed(3) + ", " + (Date.now() - t0o) + "ms");
  check("O2 spin on atoms", Math.abs(o2.scf.spinPop[0] - 1) < 0.1 && Math.abs(o2.scf.spinPop[1] - 1) < 0.1,
    "spin = [" + o2.scf.spinPop.map(function (s) { return s.toFixed(2); }).join(", ") + "] (ref ~[1,1])");
} catch (e) {
  failed++;
  console.log("FAIL extras error:", e.message, e.stack);
}

// --- 6-31G / 6-31G* ---
try {
  // H atom UHF/6-31G: literature -0.498233 Ha
  var h631 = App.engine.compute("H 0 0 0", 0, 0, "6-31G");
  check("H 6-31G", Math.abs(h631.scf.E - (-0.498233)) < 1e-4,
    "E = " + h631.scf.E.toFixed(6) + " (ref -0.498233)");

  // He RHF/6-31G: literature -2.855160 Ha
  var he631 = App.engine.compute("He 0 0 0", 0, 0, "6-31G");
  check("He 6-31G", Math.abs(he631.scf.E - (-2.855160)) < 5e-4,
    "E = " + he631.scf.E.toFixed(6) + " (ref -2.855160)");

  // H2O: variational ordering STO-3G > 6-31G > 6-31G* > HF limit (-76.07)
  var w631 = App.engine.compute(cases[2].xyz, 0, 0, "6-31G");
  var w631s = App.engine.compute(cases[2].xyz, 0, 0, "6-31G*");
  var vir631 = -(w631s.scf.EVne + w631s.scf.EJ + w631s.scf.EK + w631s.scf.Enuc) / w631s.scf.ET;
  check("H2O 6-31G < STO-3G", w631.scf.E < w.scf.E - 0.5,
    "E = " + w631.scf.E.toFixed(5) + " vs " + w.scf.E.toFixed(5));
  check("H2O 6-31G* < 6-31G", w631s.scf.E < w631.scf.E - 0.005 && w631s.scf.E > -76.5,
    "E = " + w631s.scf.E.toFixed(5) + " (d functions at work), virial = " + vir631.toFixed(3));
  check("H2O 6-31G* nb=19", w631s.basis.length === 19, "nb = " + w631s.basis.length);
  check("dipole H2O 6-31G", w631.props.dipole.debye > 2.0 && w631.props.dipole.debye < 3.0,
    "mu = " + w631.props.dipole.debye.toFixed(3) + " D (HF/6-31G ~2.5)");
} catch (e) {
  failed++;
  console.log("FAIL 6-31G error:", e.message, e.stack);
}

// --- Boys localization ---
try {
  var wb = App.engine.compute(cases[2].xyz, 0);
  var loc = App.localize.boys(wb);
  var nbL = wb.scf.nb, noL = wb.scf.nocc;

  // labels: H2O must give 1 core + 2 bonds + 2 lone pairs
  var counts = { core: 0, bond: 0, lp: 0 };
  loc.labels.forEach(function (l) { counts[l.type]++; });
  check("Boys H2O labels", counts.core === 1 && counts.bond === 2 && counts.lp === 2,
    JSON.stringify(loc.labels));

  // localized orbitals must rebuild exactly the same density: D = 2 C_occ C_occ^T
  var atomsB = App.engine.parseXYZ(cases[2].xyz);
  var basisB = App.buildBasis(atomsB);
  var SB = App.integrals.oneElectron(basisB, atomsB).S;
  var maxD = 0, maxOrtho = 0;
  for (var ii = 0; ii < nbL; ii++) {
    for (var jj = 0; jj < nbL; jj++) {
      var dij = 0;
      for (var kk = 0; kk < noL; kk++) dij += 2 * loc.C[ii * nbL + kk] * loc.C[jj * nbL + kk];
      maxD = Math.max(maxD, Math.abs(dij - wb.scf.D[ii * nbL + jj]));
    }
  }
  // orthonormality C^T S C = I on the occupied block
  for (var aa = 0; aa < noL; aa++) {
    for (var bb = 0; bb < noL; bb++) {
      var s = 0;
      for (ii = 0; ii < nbL; ii++) {
        for (jj = 0; jj < nbL; jj++) s += loc.C[ii * nbL + aa] * SB[ii * nbL + jj] * loc.C[jj * nbL + bb];
      }
      maxOrtho = Math.max(maxOrtho, Math.abs(s - (aa === bb ? 1 : 0)));
    }
  }
  check("Boys density invar", maxD < 1e-8, "max|dD| = " + maxD.toExponential(2));
  check("Boys orthonormal", maxOrtho < 1e-8, "max|CSC-I| = " + maxOrtho.toExponential(2));
} catch (e) {
  failed++;
  console.log("FAIL Boys error:", e.message, e.stack);
}

// --- geometry optimization and vibrations ---
try {
  // H2 from a stretched start: STO-3G optimum R = 0.7122 A, E = -1.117506
  var oh2 = App.optimize.run("H 0 0 0\nH 0 0 0.9", 0, 0, null, null);
  var lns = oh2.xyz.split("\n").map(function (l) { return l.split(/\s+/).slice(1).map(Number); });
  var Ropt = Math.hypot(lns[0][0] - lns[1][0], lns[0][1] - lns[1][1], lns[0][2] - lns[1][2]);
  check("opt H2", oh2.converged && Math.abs(Ropt - 0.7122) < 0.002 && Math.abs(oh2.E - (-1.117506)) < 1e-5,
    "R = " + Ropt.toFixed(4) + " A (ref 0.7122), E = " + oh2.E.toFixed(6) + ", " + oh2.iters + " steps");

  // H2O from a distorted start must land on the canonical STO-3G optimum
  var ow = App.optimize.run("O 0 0 0\nH 0.9 0 0.4\nH -0.85 0 0.55", 0, 0, null, null);
  check("opt H2O", ow.converged && Math.abs(ow.E - (-74.965901)) < 2e-5,
    "E = " + ow.E.toFixed(6) + " (ref -74.965901), " + ow.iters + " steps");

  // frequencies at the optimum vs CCCBDB HF/STO-3G: H2 5482; H2O 2170/4140/4391
  var vh2 = App.vib.run(oh2.xyz, 0, 0, null, null);
  check("vib H2", vh2.modes.length === 1 && Math.abs(vh2.modes[0].freq - 5482) < 60 && vh2.nimag === 0,
    "freq = " + vh2.modes[0].freq.toFixed(1) + " cm⁻¹ (ref 5482), IR = " + vh2.modes[0].ir.toFixed(2) + " (homonuclear: 0)");
  check("vib H2 IR-silent", vh2.modes[0].ir < 1, "IR = " + vh2.modes[0].ir.toExponential(1));

  var vw2 = App.vib.run(ow.xyz, 0, 0, null, null);
  var fr = vw2.modes.map(function (m) { return m.freq; });
  check("vib H2O", vw2.modes.length === 3 && vw2.nimag === 0 &&
    Math.abs(fr[0] - 2170) < 60 && Math.abs(fr[1] - 4140) < 80 && Math.abs(fr[2] - 4391) < 80,
    "freqs = " + fr.map(function (f) { return f.toFixed(0); }).join(", ") + " (ref 2170, 4140, 4391)");
} catch (e) {
  failed++;
  console.log("FAIL opt/vib error:", e.message, e.stack);
}

// Benzene: performance smoke test (36 basis functions)
var bz = (function () {
  var rcc = 1.397, rch = 1.084, lines = [];
  for (var k = 0; k < 6; k++) {
    var a = Math.PI / 3 * k;
    lines.push("C " + (rcc * Math.cos(a)).toFixed(6) + " " + (rcc * Math.sin(a)).toFixed(6) + " 0");
    lines.push("H " + ((rcc + rch) * Math.cos(a)).toFixed(6) + " " + ((rcc + rch) * Math.sin(a)).toFixed(6) + " 0");
  }
  return lines.join("\n");
})();
var t0 = Date.now();
try {
  var res = App.engine.compute(bz, 0);
  var ok = Math.abs(res.scf.E - (-227.89)) < 0.05;
  if (!ok) failed++;
  console.log((ok ? "PASS" : "FAIL"), "C6H6 ", "E =", res.scf.E.toFixed(4), "ref = -227.89",
    "iters =", res.scf.iterations, (Date.now() - t0) + "ms");
} catch (e) {
  failed++;
  console.log("FAIL C6H6 error:", e.message);
}

process.exit(failed ? 1 : 0);
