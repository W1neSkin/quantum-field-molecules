// Harmonic vibrational analysis: numerical Hessian (central differences of
// the energy), mass-weighting, projection of translations/rotations, normal
// modes, harmonic frequencies in cm^-1 and relative IR intensities |dmu/dQ|^2.
(function (App) {
  "use strict";

  var DELTA = 0.01;             // bohr, second-derivative step
  var HA_TO_CM = 219474.6313;   // cm^-1 per sqrt(Ha/(bohr^2 m_e)) in a.u.
  var AMU = 1822.888486;        // electron masses per unified amu
  // most abundant isotope masses, amu (H..Ne)
  var MASS = [0, 1.007825, 4.002602, 7.016004, 9.012182, 11.009305,
    12.0, 14.003074, 15.994915, 18.998403, 19.992440];

  // run(xyzText, charge, mult, basisName, onProgress) -> {modes, nimag, evals}
  function run(xyzText, charge, mult, basisName, onProgress) {
    var proto = App.engine.parseXYZ(xyzText);
    var N = proto.length;
    if (N < 2) throw new Error(App.tr("err.vib.one"));
    if (N > 6) throw new Error(App.tr("err.vib.max"));
    var n = 3 * N;

    var x0 = new Float64Array(n);
    proto.forEach(function (a, i) {
      x0[i * 3] = a.xyz[0]; x0[i * 3 + 1] = a.xyz[1]; x0[i * 3 + 2] = a.xyz[2];
    });
    var toAtoms = function (x) {
      return proto.map(function (a, i) {
        return { Z: a.Z, xyz: [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]] };
      });
    };
    var point = function (x) { return App.optimize.energyAt(toAtoms(x), charge, mult, basisName); };
    var fE = function (x) { return point(x).E; };

    var total = 2 * n + 4 * (n * (n - 1) / 2) + 1; // SCF evaluations for the Hessian
    var done = 0;
    var tick = function () { if (onProgress && (++done % 4 === 0)) onProgress(done / total); };

    var E0 = fE(x0); tick();
    var Hm = new Float64Array(n * n);
    var i, j, k;

    var disp = function (idx, h) {
      var x = Float64Array.from(x0);
      x[idx] += h;
      return x;
    };
    for (i = 0; i < n; i++) {
      var Ep = fE(disp(i, DELTA)); tick();
      var Em = fE(disp(i, -DELTA)); tick();
      Hm[i * n + i] = (Ep - 2 * E0 + Em) / (DELTA * DELTA);
    }
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var xpp = disp(i, DELTA); xpp[j] += DELTA;
        var xpm = disp(i, DELTA); xpm[j] -= DELTA;
        var xmp = disp(i, -DELTA); xmp[j] += DELTA;
        var xmm = disp(i, -DELTA); xmm[j] -= DELTA;
        var v = (fE(xpp) - fE(xpm) - fE(xmp) + fE(xmm)) / (4 * DELTA * DELTA);
        tick(); tick(); tick(); tick();
        Hm[i * n + j] = v; Hm[j * n + i] = v;
      }
    }

    // mass-weighting
    var sm = new Float64Array(n);
    for (i = 0; i < N; i++) {
      var m = Math.sqrt(MASS[proto[i].Z] * AMU);
      sm[i * 3] = m; sm[i * 3 + 1] = m; sm[i * 3 + 2] = m;
    }
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) Hm[i * n + j] /= sm[i] * sm[j];

    projectTransRot(Hm, proto, sm, n);

    var eig = App.linalg.eighSym(Hm, n);
    var modes = [];
    for (k = 0; k < n; k++) {
      var lam = eig.values[k];
      var freq = Math.sign(lam) * Math.sqrt(Math.abs(lam)) * HA_TO_CM;
      if (Math.abs(freq) < 30) continue; // projected-out translation/rotation remnants
      // cartesian displacement: u = v / sqrt(m), normalized
      var u = new Float64Array(n), norm = 0;
      for (i = 0; i < n; i++) { u[i] = eig.vectors[i * n + k] / sm[i]; norm += u[i] * u[i]; }
      norm = Math.sqrt(norm);
      for (i = 0; i < n; i++) u[i] /= norm;
      modes.push({ freq: freq, vec: Array.from(u), ir: 0 });
    }

    // IR intensity ~ |dmu/dx along mode|^2 (relative units)
    modes.forEach(function (md) {
      var xp = Float64Array.from(x0), xm = Float64Array.from(x0);
      for (i = 0; i < n; i++) { xp[i] += 0.01 * md.vec[i]; xm[i] -= 0.01 * md.vec[i]; }
      var mp = point(xp).mu, mm = point(xm).mu;
      var dd = 0;
      for (var d = 0; d < 3; d++) dd += (mp[d] - mm[d]) * (mp[d] - mm[d]);
      md.ir = dd / (4 * 0.01 * 0.01);
    });
    var irMax = modes.reduce(function (s, m2) { return Math.max(s, m2.ir); }, 1e-12);
    modes.forEach(function (md) { md.ir = md.ir / irMax * 100; });

    modes.sort(function (a, b) { return a.freq - b.freq; });
    return {
      modes: modes,
      nimag: modes.filter(function (m3) { return m3.freq < 0; }).length,
      E0: E0
    };
  }

  // P (I - sum v v^T) projection of 3 translations + up to 3 rotations
  function projectTransRot(Hm, proto, sm, n) {
    var N = proto.length;
    var com = [0, 0, 0], M = 0;
    proto.forEach(function (a, i) {
      var m = sm[i * 3] * sm[i * 3];
      M += m;
      for (var d = 0; d < 3; d++) com[d] += m * a.xyz[d];
    });
    for (var d = 0; d < 3; d++) com[d] /= M;

    var basis = [];
    for (d = 0; d < 3; d++) {
      var t = new Float64Array(n);
      for (var a = 0; a < N; a++) t[a * 3 + d] = sm[a * 3];
      basis.push(t);
    }
    // rotations: sqrt(m) * (r - com) x e_d
    for (d = 0; d < 3; d++) {
      var r = new Float64Array(n);
      for (a = 0; a < N; a++) {
        var dx = proto[a].xyz[0] - com[0], dy = proto[a].xyz[1] - com[1], dz = proto[a].xyz[2] - com[2];
        var cr = d === 0 ? [0, dz, -dy] : d === 1 ? [-dz, 0, dx] : [dy, -dx, 0];
        for (var c = 0; c < 3; c++) r[a * 3 + c] = sm[a * 3] * cr[c];
      }
      basis.push(r);
    }
    // Gram-Schmidt; vectors that vanish (linear molecules) are dropped
    var ortho = [];
    basis.forEach(function (v) {
      var w = Float64Array.from(v);
      ortho.forEach(function (o) {
        var dot = 0;
        for (var i = 0; i < n; i++) dot += w[i] * o[i];
        for (i = 0; i < n; i++) w[i] -= dot * o[i];
      });
      var nrm = 0;
      for (var i = 0; i < n; i++) nrm += w[i] * w[i];
      nrm = Math.sqrt(nrm);
      if (nrm < 1e-8) return;
      for (i = 0; i < n; i++) w[i] /= nrm;
      ortho.push(w);
    });
    // H <- P H P with P = I - sum o o^T
    var apply = function (Min) {
      var out = Float64Array.from(Min);
      ortho.forEach(function (o) {
        // out -= o (o^T out)  (rows), then columns by symmetry of construction
        var tmp = new Float64Array(n);
        for (var i = 0; i < n; i++) {
          var s = 0;
          for (var j = 0; j < n; j++) s += o[j] * out[j * n + i];
          tmp[i] = s;
        }
        for (i = 0; i < n; i++) for (var j2 = 0; j2 < n; j2++) out[i * n + j2] -= o[i] * tmp[j2];
      });
      return out;
    };
    var H1 = apply(Hm);
    // transpose, project rows again (completes P H P)
    var H2 = new Float64Array(n * n);
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) H2[i * n + j] = H1[j * n + i];
    var H3 = apply(H2);
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) Hm[i * n + j] = (H3[i * n + j] + H3[j * n + i]) / 2;
  }

  App.vib = { run: run };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
