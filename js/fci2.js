// Exact (full CI) singlet ground state for two-electron systems in the
// current basis: all singlet CSFs |ij> over MOs, Hamiltonian diagonalized
// exactly. The difference from RHF is pure electron correlation.
(function (App) {
  "use strict";

  // One quarter transform: contracts the first index with C and appends the
  // MO index last, so four passes turn (pq|rs) into (ij|kl) in order.
  function pass(src, C, nb) {
    var dst = new Float64Array(src.length);
    var n3 = nb * nb * nb;
    for (var rest = 0; rest < n3; rest++) {
      for (var i = 0; i < nb; i++) {
        var s = 0;
        for (var p = 0; p < nb; p++) s += C[p * nb + i] * src[p * n3 + rest];
        dst[rest * nb + i] = s;
      }
    }
    return dst;
  }

  // atoms/basis/ints/eri as in the engine; scf: converged RHF (nelec must be 2).
  function compute(atoms, basis, ints, eri, scf) {
    var nb = scf.nb, C = scf.C;

    var h = new Float64Array(nb * nb);
    for (var i = 0; i < nb * nb; i++) h[i] = ints.T[i] + ints.V[i];
    var hmo = App.linalg.matmul(App.linalg.matmul(App.linalg.transpose(C, nb), h, nb), C, nb);

    var g = new Float64Array(nb * nb * nb * nb);
    for (var p = 0; p < nb; p++)
      for (var q = 0; q < nb; q++)
        for (var r = 0; r < nb; r++)
          for (var s = 0; s < nb; s++)
            g[((p * nb + q) * nb + r) * nb + s] = App.eri.get(eri, p, q, r, s);
    for (var k = 0; k < 4; k++) g = pass(g, C, nb);
    var gmo = function (a, b, c, d) { return g[((a * nb + b) * nb + c) * nb + d]; };

    // singlet CSFs: (i,j) with i <= j; norm 1/sqrt(1+delta_ij)
    var pairs = [];
    for (i = 0; i < nb; i++) for (var j = i; j < nb; j++) pairs.push([i, j]);
    var np = pairs.length;
    var H = new Float64Array(np * np);
    for (var a = 0; a < np; a++) {
      var pi = pairs[a][0], pj = pairs[a][1];
      var Na = pi === pj ? Math.SQRT2 : 1;
      for (var b = a; b < np; b++) {
        var pk = pairs[b][0], pl = pairs[b][1];
        var Nb = pk === pl ? Math.SQRT2 : 1;
        var one =
          (pi === pk ? hmo[pj * nb + pl] : 0) + (pj === pl ? hmo[pi * nb + pk] : 0) +
          (pi === pl ? hmo[pj * nb + pk] : 0) + (pj === pk ? hmo[pi * nb + pl] : 0);
        var two = gmo(pi, pk, pj, pl) + gmo(pi, pl, pj, pk);
        H[a * np + b] = H[b * np + a] = (one + two) / (Na * Nb);
      }
    }

    var eig = App.linalg.eighSym(H, np);
    var Enuc = App.scf.nuclearRepulsion(atoms);
    var E = eig.values[0] + Enuc;
    // weight of the HF configuration |phi_0^2> in the exact state
    var c0 = eig.vectors[0 * np + 0];
    return { E: E, Ecorr: E - scf.E, c0sq: c0 * c0, ncsf: np };
  }

  App.fci2 = { compute: compute };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
