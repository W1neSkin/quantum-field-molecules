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
require("../js/localize-async.js");
require("../js/engine.js");
require("../js/optimize.js");
require("../js/vib.js");
require("../js/fields2d.js");
require("../js/energy.js");

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

  // parser basics: XYZ header support and robust diagnostics
  var xyzWithHeader = "3\nwater\nO 0 0 0\nH 0.758130 0 0.635742\nH -0.758130 0 0.635742";
  var parsed = App.engine.parseXYZ(xyzWithHeader);
  check("parseXYZ header", parsed.length === 3 && parsed[0].Z === 8 && parsed[1].Z === 1,
    "3 atoms parsed with XYZ header");
  var badElem = false, badCoords = false;
  try { App.engine.parseXYZ("Xx 0 0 0"); } catch (e1) { badElem = !!e1; }
  try { App.engine.parseXYZ("H a 0 0"); } catch (e2) { badCoords = !!e2; }
  check("parseXYZ bad element", badElem, "unsupported element is rejected");
  check("parseXYZ bad coords", badCoords, "non-numeric coordinates are rejected");

  // Mulliken populations should conserve total charge.
  var qsum = w.scf.mulliken.reduce(function (s, q) { return s + q; }, 0);
  check("Mulliken charge sum", Math.abs(qsum - 0) < 1e-6,
    "sum q = " + qsum.toExponential(2) + " (neutral water)");

  // FCI is enabled for generic 2-electron closed-shell systems (e.g. HeH+).
  var hehp = App.engine.compute(cases[1].xyz, 1);
  check("FCI HeH+ available", !!(hehp.scf.fci && isFinite(hehp.scf.fci.Ecorr)),
    "Ecorr = " + (hehp.scf.fci ? hehp.scf.fci.Ecorr.toFixed(5) : "n/a"));

  // Open-shell smoke case besides O2.
  var oh = App.engine.compute("O 0 0 0\nH 0 0 0.970", 0, 2);
  check("UHF OH doublet", oh.scf.uhf && oh.scf.converged && Math.abs(oh.scf.S2 - 0.75) < 0.15,
    "E = " + oh.scf.E.toFixed(4) + ", <S2> = " + oh.scf.S2.toFixed(3));
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

// --- slice fields (ELF, Laplacian) and Morse vibrational levels ---
try {
  // H2 has a single electron pair: D(r) = 0 identically, so ELF = 1 wherever
  // the density is non-negligible; the covalent bond concentrates charge,
  // so lap(rho) < 0 at the midpoint
  var fh2 = App.engine.compute("H 0 0 0\nH 0 0 0.7414", 0);
  var mid = App.fields2d.probe(fh2, [0, 0, 0.7414 / 2 * 1.8897259886]);
  check("ELF H2 midpoint", mid.elf > 0.95 && mid.elf <= 1 + 1e-9,
    "ELF = " + mid.elf.toFixed(4) + " (one pair: exactly 1)");
  check("lap H2 midpoint", mid.lap < 0,
    "lap rho = " + mid.lap.toFixed(3) + " (covalent concentration: < 0)");
  var far = App.fields2d.probe(fh2, [8, 8, 8]);
  check("ELF far tail", far.elf >= 0 && far.elf < 0.05, "ELF(far) = " + far.elf.toExponential(1));

  // Morse levels of H2 vs spectroscopy: omega_e = 4401 cm^-1, ZPE ~ 0.27 eV
  var muH2 = 0.5 * App.vib.MASS[1] * App.vib.AMU;
  var lev = App.energyChart.morseLevels({ De: 4.747, Re: 0.7414, a: 1.9426 }, muH2, 5);
  check("Morse omega H2", Math.abs(lev.omega - 4401) < 60,
    "omega_e = " + lev.omega.toFixed(0) + " cm^-1 (exp 4401)");
  check("Morse ZPE H2", Math.abs(lev[0].E - 0.269) < 0.01,
    "E0 = " + lev[0].E.toFixed(3) + " eV (ref ~0.269)");
  // chi_v has exactly v sign changes
  var rs = [];
  for (var ri = 0; ri < 400; ri++) rs.push(0.3 + 1.7 * ri / 399);
  var nodes = function (ps) {
    var n = 0;
    for (var i = 1; i < ps.length; i++) {
      if (Math.abs(ps[i]) > 1e-6 && Math.abs(ps[i - 1]) > 1e-6 && ps[i] * ps[i - 1] < 0) n++;
    }
    return n;
  };
  check("Morse chi nodes", nodes(lev[0].sample(rs)) === 0 && nodes(lev[1].sample(rs)) === 1 &&
    nodes(lev[2].sample(rs)) === 2,
    "nodes(chi_0,1,2) = " + [0, 1, 2].map(function (v) { return nodes(lev[v].sample(rs)); }).join(", "));
} catch (e) {
  failed++;
  console.log("FAIL fields/morse error:", e.message, e.stack);
}

// --- molecule builder: click-placement must land in the right minimum's basin ---
try {
  require("../js/builder.js");
  var B = App.builder;
  var dist = function (a, b) {
    return Math.hypot(a.xyz[0] - b.xyz[0], a.xyz[1] - b.xyz[1], a.xyz[2] - b.xyz[2]);
  };
  var angle = function (a, c, b) { // a-c-b, degrees
    var u = a.xyz.map(function (v, i) { return v - c.xyz[i]; });
    var v2 = b.xyz.map(function (v, i) { return v - c.xyz[i]; });
    var dot = u[0] * v2[0] + u[1] * v2[1] + u[2] * v2[2];
    return Math.acos(dot / (Math.hypot.apply(0, u) * Math.hypot.apply(0, v2))) * 180 / Math.PI;
  };

  // water in three clicks: O, H, H (anchor stays on the O)
  B.clear(); B.add(8); B.add(1); B.add(1);
  var aw = B.getAtoms();
  var hoh = angle(aw[1], aw[0], aw[2]);
  check("builder H2O start", Math.abs(dist(aw[0], aw[1]) - 0.97) < 0.01 && hoh > 60 && hoh < 175,
    "r(OH) = " + dist(aw[0], aw[1]).toFixed(3) + " A, HOH = " + hoh.toFixed(0) + " deg (not linear)");

  var ow = App.optimize.run(B.toXyz(), 0, 1, "STO-3G");
  var awo = App.engine.parseXYZ(ow.xyz).map(function (a) {
    return { Z: a.Z, xyz: a.xyz.map(function (c) { return c * 0.529177210903; }) };
  });
  var hohOpt = angle(awo[1], awo[0], awo[2]);
  check("builder H2O optimized", Math.abs(ow.E - (-74.9659)) < 2e-3 && Math.abs(hohOpt - 100) < 4,
    "E = " + ow.E.toFixed(5) + " (ref -74.9659), HOH = " + hohOpt.toFixed(1) +
    " deg (ref 100.0), " + ow.iters + " iters");

  // methane in five clicks; no H-H clash from the placement heuristic
  B.clear(); B.add(6); B.add(1); B.add(1); B.add(1); B.add(1);
  var am = B.getAtoms(), minHH = 1e9, maxCH = 0;
  for (var bi = 1; bi < 5; bi++) {
    maxCH = Math.max(maxCH, Math.abs(dist(am[0], am[bi]) - 1.07));
    for (var bj = bi + 1; bj < 5; bj++) minHH = Math.min(minHH, dist(am[bi], am[bj]));
  }
  check("builder CH4 start", maxCH < 0.01 && minHH > 1.3,
    "r(CH) = 1.07 A, min r(HH) = " + minHH.toFixed(2) + " A (tetrahedral 1.75)");

  var rt = App.engine.parseXYZ(B.toXyz());
  check("builder xyz roundtrip", rt.length === 5 && rt[0].Z === 6,
    "5 atoms parse back, first is C");

  // explicit bond edit: connect a free atom to any selected target
  B.setAtoms([
    { Z: 6, xyz: [0, 0, 0] },
    { Z: 1, xyz: [4.5, 0, 0] }
  ], false, { resetHistory: true });
  B.connect(1, 0);
  var ac = B.getAtoms();
  check("builder connect free atom", Math.abs(dist(ac[0], ac[1]) - (B.COV_R[6] + B.COV_R[1])) < 1e-3,
    "r(CH) = " + dist(ac[0], ac[1]).toFixed(3) + " A after connect");

  // when connecting fragments, internal geometry of the moved fragment is preserved
  B.setAtoms([
    { Z: 6, xyz: [0, 0, 0] },
    { Z: 8, xyz: [5, 0, 0] },
    { Z: 1, xyz: [5.96, 0, 0] }
  ], false, { resetHistory: true });
  var beforeOH = dist(B.getAtoms()[1], B.getAtoms()[2]);
  B.connect(1, 0);
  var af = B.getAtoms();
  var afterOH = dist(af[1], af[2]);
  check("builder connect fragment shift", Math.abs(afterOH - beforeOH) < 1e-6,
    "r(OH) preserved: " + beforeOH.toFixed(3) + " -> " + afterOH.toFixed(3) + " A");
} catch (e) {
  failed++;
  console.log("FAIL builder error:", e.message, e.stack);
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

function runAsyncChecks() {
  require("../js/client.js");
  require("../js/provenance.js");
  require("../js/cavity-sandbox.js");
  require("../js/scaling-lab.js");
  require("../js/cross-bridge.js");
  require("../js/benchmark.js");
  require("../js/uncertainty.js");

  // cacheKey must be insensitive to harmless spacing changes.
  var k1 = App.compute.cacheKey("H 0 0 0\nH 0 0 0.7408", 0, 0, "STO-3G");
  var k2 = App.compute.cacheKey("H   0 0 0\n\nH 0  0   0.7408", 0, 0, "STO-3G");
  check("cacheKey normalization", k1 === k2, "k1 == k2");

  var pRes = App.engine.compute(cases[0].xyz, 0);
  var pMeta = App.provenance.build({
    result: pRes, xyz: cases[0].xyz, charge: 0, mult: 0, basis: "STO-3G"
  });
  check("provenance manifest", pMeta && pMeta.schema === "qfm-provenance-v1" &&
    pMeta.requestKey === k1 && pMeta.testReference === "test/selfcheck.js",
  "source = " + (pMeta ? pMeta.source : "n/a"));

  // Toy cavity model sanity: on resonance splitting is 2g; perpendicular is weaker.
  var cavPar = App.cavitySandbox.solve(8, 8, 0.20, "parallel");
  var cavPerp = App.cavitySandbox.solve(8, 8, 0.20, "perp");
  check("cavity split resonance", Math.abs(cavPar.split - 0.40) < 1e-9,
    "split = " + cavPar.split.toFixed(3) + " eV (expected 0.400)");
  check("cavity polarization", cavPerp.split < cavPar.split,
    "split_perp = " + cavPerp.split.toFixed(3) + " < split_parallel = " + cavPar.split.toFixed(3));

  var aScale = App.scalingLab.predictAlpha(6, 3, 10, 4);
  var rScale = App.scalingLab.predictRvdw(128, 1, 1, 1 / 7);
  var spanScale = App.scalingLab.sizeSpanAngstrom({
    atoms: [{ xyz: [0, 0, 0] }, { xyz: [App.engine.ANGSTROM_TO_BOHR, 0, 0] }]
  });
  check("scaling alpha power", Math.abs(aScale - 160) < 1e-9,
    "alpha(6A) = " + aScale.toFixed(1) + " (expected 160)");
  check("scaling rvdw power", Math.abs(rScale - 2) < 1e-9,
    "R(128) = " + rScale.toFixed(3) + " (expected 2.000)");
  check("scaling span size", Math.abs(spanScale - 1) < 1e-9,
    "span = " + spanScale.toFixed(3) + " A (expected 1.000)");

  var bPass = App.benchmark.evaluate(App.engine.compute(cases[0].xyz, 0), { id: "H2" });
  var bBasis = App.benchmark.evaluate(App.engine.compute(cases[0].xyz, 0, 0, "6-31G"), { id: "H2" });
  var bNone = App.benchmark.evaluate(App.engine.compute(cases[0].xyz, 0), { id: "C6H6" });
  check("benchmark pass", bPass && bPass.available && bPass.pass && Math.abs(bPass.dE) < 1e-3,
    "H2 delta = " + (bPass ? bPass.dE.toExponential(2) : "n/a"));
  check("benchmark basis gate", bBasis && !bBasis.available && bBasis.reason === "basis",
    "6-31G benchmark blocked as expected");
  check("benchmark missing ref", bNone && !bNone.available && bNone.reason === "noref",
    "unsupported preset returns noref");

  var uLow = App.uncertainty.evaluate({
    basisName: "6-31G*",
    scf: { converged: true, ET: 1, EVne: -2, EJ: 0, EK: 0, Enuc: 0, uhf: false },
    props: { dipole: { debye: 1.00 } }
  }, { exp: { dipole: 1.00 } }, { requestKey: "rk" });
  var uHigh = App.uncertainty.evaluate({
    basisName: "STO-3G",
    scf: { converged: false, ET: 1, EVne: -1, EJ: 0, EK: 0, Enuc: 0, uhf: true, S2: 2.0, S2exact: 0.75 },
    props: { dipole: { debye: 3.0 } }
  }, { exp: { dipole: 1.0 } }, null);
  check("uncertainty low", uLow && uLow.level === "low" && uLow.score <= 1,
    "low-risk mock gets low uncertainty");
  check("uncertainty high", uHigh && uHigh.level === "high" && uHigh.score >= 6,
    "high-risk mock gets high uncertainty");
  check("uncertainty bands", uLow && uHigh && uLow.bands && uHigh.bands &&
    uHigh.bands.energyHa > uLow.bands.energyHa && uHigh.bands.gapEv >= uLow.bands.gapEv,
  "high-risk mock gets wider uncertainty bands");

  var bridgeTpl = App.crossBridge.makeTemplate("pyscf", {
    atoms: [{ sym: "H", xyz: [0, 0, 0] }, { sym: "H", xyz: [0, 0, 0.7414] }],
    basis: "STO-3G", charge: 0, multiplicity: 1, method: "RHF"
  });
  var bridgeText = App.crossBridge.parseResult(
    "SCF_ENERGY_HA = -1.116717\nconverged = true\nHOMO-LUMO gap = 0.42\nRabi splitting = 0.31"
  );
  var bridgeJson = App.crossBridge.parseResult(
    "{\"total_energy\":-40.1234,\"converged\":false,\"homo_lumo_gap\":5.2}"
  );
  var bridgePy = App.crossBridge.parseResult(
    "converged SCF energy = -75.983948637\na1 HOMO = -0.278 Ha  b1 LUMO = 0.114 Ha"
  );
  var bridgeQchem = App.crossBridge.parseResult(
    "SCF converged\nTotal energy in the final basis set = -76.026760"
  );
  var bridgeOrca = App.crossBridge.parseResult(
    "FINAL SINGLE POINT ENERGY     -75.123456\nHOMO-LUMO GAP [eV] : 6.540\nRabi splitting (cm-1) = 806.554"
  );
  check("bridge template", /gto\.M/.test(bridgeTpl) && /SCF_ENERGY_HA/.test(bridgeTpl),
    "pyscf template contains core markers");
  check("bridge parser text", bridgeText && bridgeText.energyHa != null &&
    Math.abs(bridgeText.energyHa - (-1.116717)) < 1e-9 && bridgeText.converged === true &&
    Math.abs(bridgeText.gapEv - 0.42) < 1e-9 && Math.abs(bridgeText.splitEv - 0.31) < 1e-9,
  "text parser extracts energy/convergence/gap/splitting");
  check("bridge parser json", bridgeJson && bridgeJson.source === "json" &&
    Math.abs(bridgeJson.energyHa - (-40.1234)) < 1e-9 && bridgeJson.converged === false &&
    Math.abs(bridgeJson.gapEv - 5.2) < 1e-9,
  "json parser extracts metrics");
  check("bridge parser pyscf", bridgePy && Math.abs(bridgePy.energyHa - (-75.983948637)) < 1e-12 &&
    bridgePy.converged === true && bridgePy.gapEv > 10,
  "pyscf-style text is parsed");
  check("bridge parser qchem", bridgeQchem && Math.abs(bridgeQchem.energyHa - (-76.026760)) < 1e-9 &&
    bridgeQchem.converged === true,
  "qchem-style energy line is parsed");
  check("bridge parser orca", bridgeOrca && Math.abs(bridgeOrca.energyHa - (-75.123456)) < 1e-9 &&
    Math.abs(bridgeOrca.gapEv - 6.54) < 1e-9 && Math.abs(bridgeOrca.splitEv - 0.1) < 5e-4,
  "orca-style output and cm^-1 conversion are parsed");

  require("../js/exporter.js");
  var repRes = App.engine.compute(cases[0].xyz, 0);
  var repPack = App.exporter.buildJournalPack(
    repRes, { formula: "H2", charge: 0, name: { en: "Hydrogen" } }, { kind: "total" },
    { requestKey: "abc123", source: "worker" }, "h2"
  );
  check("report pack", /Journal-ready report/.test(repPack.reportMd) &&
    /Methods appendix/.test(repPack.methodsMd) && /Validity checklist/.test(repPack.reportMd) &&
    /Uncertainty hint/.test(repPack.reportMd) && /Bands:/.test(repPack.reportMd) &&
    repPack.figurePack.figures.length >= 3,
  "report/methods/figure-pack artifacts are generated");
  check("report manifest", repPack.manifest.requestKey === "abc123" &&
    repPack.manifest.source === "worker" && !!repPack.manifest.validityChecklist &&
    !!repPack.manifest.uncertainty && !!(repPack.manifest.uncertainty.bands),
  "manifest keeps provenance, validity checklist and uncertainty");

  // Async Boys localization should return the same output shape as the sync path.
  var wbAsync = App.engine.compute(cases[2].xyz, 0);
  var locAsyncCheck = new Promise(function (resolve) {
    if (typeof App.localize.boysAsync !== "function") {
      check("Boys async", false, "boysAsync missing");
      resolve();
      return;
    }
    App.localize.boysAsync(wbAsync, null, function (loc) {
      var ok = !!(loc && loc.C && loc.labels && loc.labels.length === wbAsync.scf.nocc);
      check("Boys async", ok, "labels = " + (loc && loc.labels ? loc.labels.length : 0));
      resolve();
    }, function (err) {
      check("Boys async", false, err.message);
      resolve();
    });
  });

  // In file:// fallback there is no worker cancellation primitive, so the client
  // cancels queued jobs before they start and rejects with a tagged error.
  var pSlow = null;
  var pFast = null;
  return locAsyncCheck.then(function () {
    pSlow = App.compute.request({ xyz: bz, charge: 0, mult: 0, basis: "STO-3G" });
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }).then(function () {
    pFast = App.compute.request({ xyz: cases[0].xyz, charge: 0, mult: 0, basis: "STO-3G" });
    return pSlow.then(function () {
      check("request cancellation", false, "slow request unexpectedly resolved");
    }).catch(function (err) {
      check("request cancellation", App.compute.isCancelledError(err),
        "cancelled flag = " + !!(err && err.cancelled));
    });
  }).then(function () {
    return pFast.then(function (res) {
      check("request after cancel", !!(res && res.scf && isFinite(res.scf.E)),
        "E = " + res.scf.E.toFixed(6));
    }).catch(function (err) {
      check("request after cancel", false, err.message);
    });
  });
}

runAsyncChecks().then(function () {
  process.exit(failed ? 1 : 0);
}).catch(function (err) {
  failed++;
  console.log("FAIL async checks error:", err.message, err.stack);
  process.exit(1);
});
