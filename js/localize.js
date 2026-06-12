// Foster-Boys localization of occupied orbitals: Jacobi 2x2 rotations
// maximizing sum_i |<i|r|i>|^2. RHF only. Returns a full C copy whose
// occupied columns are localized, plus a chemical label per LMO.
(function (App) {
  "use strict";

  // m: 3 dipole matrices in the occupied-MO basis (no x no, row-major)
  function sweeps(m, no, U) {
    var maxIter = 200, gain = 1;
    for (var it = 0; it < maxIter && gain > 1e-10; it++) {
      gain = 0;
      for (var i = 0; i < no; i++) {
        for (var j = i + 1; j < no; j++) {
          var A = 0, B = 0;
          for (var d = 0; d < 3; d++) {
            var ij = m[d][i * no + j], ii = m[d][i * no + i], jj = m[d][j * no + j];
            A += ij * ij - 0.25 * (ii - jj) * (ii - jj);
            B += ij * (ii - jj);
          }
          var h = Math.hypot(A, B);
          if (A + h < 1e-12) continue; // already optimal for this pair
          gain += A + h;
          var alpha = 0.25 * Math.atan2(B, -A);
          var c = Math.cos(alpha), s = Math.sin(alpha);
          for (d = 0; d < 3; d++) rot2(m[d], no, i, j, c, s);
          // accumulate rotation into U columns i, j
          for (var k = 0; k < no; k++) {
            var ui = U[k * no + i], uj = U[k * no + j];
            U[k * no + i] = c * ui + s * uj;
            U[k * no + j] = -s * ui + c * uj;
          }
        }
      }
    }
  }

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

  function boys(result) {
    var scf = result.scf, basis = result.basis, atoms = result.atoms;
    var nb = scf.nb, no = scf.nocc;
    var ints = App.integrals.oneElectron(basis, atoms);
    var M = App.props.dipoleMatrices(basis);

    // occupied block Co (nb x no) and MO-basis dipole matrices
    var Co = new Float64Array(nb * no);
    for (var i = 0; i < nb; i++) {
      for (var k = 0; k < no; k++) Co[i * no + k] = scf.C[i * nb + k];
    }
    var m = [0, 1, 2].map(function (d) {
      var t = new Float64Array(nb * no); // M_d * Co
      for (var r = 0; r < nb; r++) {
        for (var c2 = 0; c2 < no; c2++) {
          var s = 0;
          for (var q = 0; q < nb; q++) s += M[d][r * nb + q] * Co[q * no + c2];
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
    });

    var U = new Float64Array(no * no);
    for (i = 0; i < no; i++) U[i * no + i] = 1;
    sweeps(m, no, U);

    // localized occupied columns: Cl = Co * U
    var Cl = new Float64Array(nb * no);
    for (i = 0; i < nb; i++) {
      for (var j = 0; j < no; j++) {
        var s3 = 0;
        for (k = 0; k < no; k++) s3 += Co[i * no + k] * U[k * no + j];
        Cl[i * no + j] = s3;
      }
    }

    return finish(result, ints, Cl, no, nb);
  }

  // ordering, labels and the full-C assembly
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

    // Mulliken population of each LMO per atom (for labels)
    var SC = new Float64Array(nb * no);
    for (var r = 0; r < nb; r++) {
      for (var c = 0; c < no; c++) {
        var s = 0;
        for (var q = 0; q < nb; q++) s += ints.S[r * nb + q] * Cl[q * no + c];
        SC[r * no + c] = s;
      }
    }
    var sym = function (a) { return App.SYMBOLS[atoms[a].Z] + (atoms.length > 1 ? a + 1 : ""); };
    var coreSeen = {};
    var labels = new Array(no);
    var Cfull = Array.from(scf.C);
    // labels are structured {type, a, b}; the UI renders them in the active language
    order.forEach(function (o, pos) {
      var pop = new Float64Array(atoms.length);
      for (var rr = 0; rr < nb; rr++) pop[basis[rr].atom] += Cl[rr * no + o.idx] * SC[rr * no + o.idx];
      var idxs = atoms.map(function (_, a) { return a; })
        .sort(function (a, b) { return pop[b] - pop[a]; });
      var a0 = idxs[0], a1 = idxs[1];
      if (a1 !== undefined && pop[a1] >= 0.2) {
        labels[pos] = { type: "bond", a: sym(a0), b: sym(a1) };
      } else if (atoms[a0].Z > 2 && !coreSeen[a0]) {
        coreSeen[a0] = true; // lowest-h LMO on a heavy atom = its 1s core
        labels[pos] = { type: "core", a: sym(a0) };
      } else {
        labels[pos] = { type: "lp", a: sym(a0) };
      }
      for (var rr2 = 0; rr2 < nb; rr2++) Cfull[rr2 * nb + pos] = Cl[rr2 * no + o.idx];
    });

    return { C: Cfull, labels: labels };
  }

  App.localize = { boys: boys };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
