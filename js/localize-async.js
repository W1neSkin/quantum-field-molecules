// Async Foster-Boys localization for UI responsiveness.
// Uses the same math and labeling rules as localize.js, but yields across sweeps.
(function (App) {
  "use strict";

  // symmetric 2x2 Jacobi update of rows/columns i, j of M
  function rot2(M, n, i, j, c, s) {
    for (var k = 0; k < n; k++) {
      var mi = M[i * n + k], mj = M[j * n + k];
      M[i * n + k] = c * mi + s * mj;
      M[j * n + k] = -s * mi + c * mj;
    }
    for (k = 0; k < n; k++) {
      var ki = M[k * n + i], kj = M[k * n + j];
      M[k * n + i] = c * ki + s * kj;
      M[k * n + j] = -s * ki + c * kj;
    }
  }

  function sweepsAsync(m, no, U, onProgress, done) {
    var maxIter = 200;
    if (no < 2) { if (onProgress) onProgress(1); done(); return; }
    var iter = 0, gain = 1;
    function runIter() {
      if (iter >= maxIter || gain <= 1e-10) { if (onProgress) onProgress(1); done(); return; }
      var i = 0, j = 1, iterGain = 0;
      var PAIRS_PER_TICK = 80;
      function chunk() {
        var donePairs = 0;
        while (i < no - 1 && donePairs < PAIRS_PER_TICK) {
          while (j < no && donePairs < PAIRS_PER_TICK) {
            var A = 0, B = 0;
            for (var d = 0; d < 3; d++) {
              var ij = m[d][i * no + j], ii = m[d][i * no + i], jj = m[d][j * no + j];
              A += ij * ij - 0.25 * (ii - jj) * (ii - jj);
              B += ij * (ii - jj);
            }
            var h = Math.hypot(A, B);
            if (A + h >= 1e-12) {
              iterGain += A + h;
              var alpha = 0.25 * Math.atan2(B, -A);
              var c = Math.cos(alpha), s = Math.sin(alpha);
              for (d = 0; d < 3; d++) rot2(m[d], no, i, j, c, s);
              for (var k = 0; k < no; k++) {
                var ui = U[k * no + i], uj = U[k * no + j];
                U[k * no + i] = c * ui + s * uj;
                U[k * no + j] = -s * ui + c * uj;
              }
            }
            j++;
            donePairs++;
          }
          if (j >= no) { i++; j = i + 1; }
        }
        if (i < no - 1) { setTimeout(chunk, 0); return; }
        gain = iterGain;
        iter++;
        if (onProgress) onProgress(Math.min(1, iter / maxIter));
        if (iter >= maxIter || gain <= 1e-10) { done(); return; }
        setTimeout(runIter, 0);
      }
      chunk();
    }
    runIter();
  }

  function moDipoleBlock(Md, Co, nb, no) {
    var t = new Float64Array(nb * no); // M_d * Co
    for (var r = 0; r < nb; r++) {
      for (var c2 = 0; c2 < no; c2++) {
        var s = 0;
        for (var q = 0; q < nb; q++) s += Md[r * nb + q] * Co[q * no + c2];
        t[r * no + c2] = s;
      }
    }
    var out = new Float64Array(no * no); // Co^T * t
    for (var a = 0; a < no; a++) {
      for (var b = 0; b < no; b++) {
        var s2 = 0;
        for (var q2 = 0; q2 < nb; q2++) s2 += Co[q2 * no + a] * t[q2 * no + b];
        out[a * no + b] = s2;
      }
    }
    return out;
  }

  // Same ordering/labeling logic as in localize.js.
  function finish(result, ints, Cl, no, nb) {
    var scf = result.scf, basis = result.basis, atoms = result.atoms;
    var hAO = new Float64Array(nb * nb);
    for (var i = 0; i < nb * nb; i++) hAO[i] = ints.T[i] + ints.V[i];
    function quad(Mat, col) {
      var s = 0;
      for (var r = 0; r < nb; r++) {
        var cr = Cl[r * no + col];
        if (!cr) continue;
        for (var q = 0; q < nb; q++) s += cr * Mat[r * nb + q] * Cl[q * no + col];
      }
      return s;
    }
    var order = [];
    for (i = 0; i < no; i++) order.push({ idx: i, h: quad(hAO, i) });
    order.sort(function (a, b) { return a.h - b.h; });

    var SC = new Float64Array(nb * no);
    for (var r = 0; r < nb; r++) {
      for (var c = 0; c < no; c++) {
        var s = 0;
        for (var q2 = 0; q2 < nb; q2++) s += ints.S[r * nb + q2] * Cl[q2 * no + c];
        SC[r * no + c] = s;
      }
    }
    var sym = function (a) { return App.SYMBOLS[atoms[a].Z] + (atoms.length > 1 ? a + 1 : ""); };
    var coreSeen = {};
    var labels = new Array(no);
    var Cfull = Array.from(scf.C);
    order.forEach(function (o, pos) {
      var pop = new Float64Array(atoms.length);
      for (var rr = 0; rr < nb; rr++) pop[basis[rr].atom] += Cl[rr * no + o.idx] * SC[rr * no + o.idx];
      var idxs = atoms.map(function (_, a) { return a; })
        .sort(function (a, b) { return pop[b] - pop[a]; });
      var a0 = idxs[0], a1 = idxs[1];
      if (a1 !== undefined && pop[a1] >= 0.2) labels[pos] = { type: "bond", a: sym(a0), b: sym(a1) };
      else if (atoms[a0].Z > 2 && !coreSeen[a0]) { coreSeen[a0] = true; labels[pos] = { type: "core", a: sym(a0) }; }
      else labels[pos] = { type: "lp", a: sym(a0) };
      for (var rr2 = 0; rr2 < nb; rr2++) Cfull[rr2 * nb + pos] = Cl[rr2 * no + o.idx];
    });
    return { C: Cfull, labels: labels };
  }

  function boysAsync(result, onProgress, done, fail) {
    try {
      var scf = result.scf, basis = result.basis, atoms = result.atoms;
      var nb = scf.nb, no = scf.nocc;
      var ints = App.integrals.oneElectron(basis, atoms);
      var M = App.props.dipoleMatrices(basis);
      var Co = new Float64Array(nb * no);
      for (var i = 0; i < nb; i++) {
        for (var k = 0; k < no; k++) Co[i * no + k] = scf.C[i * nb + k];
      }
      var m = [];
      var d = 0;
      function buildNext() {
        if (d >= 3) {
          var U = new Float64Array(no * no);
          for (var u = 0; u < no; u++) U[u * no + u] = 1;
          sweepsAsync(m, no, U, function (frac) {
            if (onProgress) onProgress({ stage: "sweeps", frac: frac });
          }, function () {
            try {
              var Cl = new Float64Array(nb * no);
              for (var ii = 0; ii < nb; ii++) {
                for (var j = 0; j < no; j++) {
                  var s3 = 0;
                  for (k = 0; k < no; k++) s3 += Co[ii * no + k] * U[k * no + j];
                  Cl[ii * no + j] = s3;
                }
              }
              done(finish(result, ints, Cl, no, nb));
            } catch (e2) { if (fail) fail(e2); }
          });
          return;
        }
        m.push(moDipoleBlock(M[d], Co, nb, no));
        d++;
        if (onProgress) onProgress({ stage: "prep", frac: d / 3 });
        setTimeout(buildNext, 0);
      }
      setTimeout(buildNext, 0);
    } catch (e) { if (fail) fail(e); }
  }

  if (!App.localize) App.localize = {};
  App.localize.boysAsync = boysAsync;
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
