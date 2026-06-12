// Geometry optimization: numerical central-difference gradients + BFGS
// (inverse-Hessian form) in cartesians, translation-projected. Worker-safe.
// energyAt() is the lean single-point used by gradients and vibrations.
(function (App) {
  "use strict";

  var BOHR_TO_A = 0.529177210903;
  var DELTA = 0.005;      // finite-difference step, bohr
  var MAXSTEP = 0.25;     // largest allowed displacement component, bohr
  var GMAX_CONV = 5e-4;   // Ha/bohr

  // single point without props/FCI; returns {E, mu} (mu for IR intensities)
  function energyAt(atoms, charge, mult, basisName) {
    var basis = App.buildBasis(atoms, basisName || "STO-3G");
    var ints = App.integrals.oneElectron(basis, atoms);
    var eri = App.eri.computeERI(basis);
    var nelec = atoms.reduce(function (s, a) { return s + a.Z; }, 0) - (charge || 0);
    var m = mult || (nelec % 2 ? 2 : 1);
    var scf = m > 1
      ? App.uhf.runUHF(atoms, basis, ints, eri, charge || 0, m)
      : App.scf.runRHF(atoms, basis, ints, eri, charge || 0);
    var M = App.props.dipoleMatrices(basis);
    var mu = [0, 0, 0];
    atoms.forEach(function (at) {
      for (var d = 0; d < 3; d++) mu[d] += at.Z * at.xyz[d];
    });
    for (var d = 0; d < 3; d++) {
      var el = 0;
      for (var i = 0; i < basis.length * basis.length; i++) el += scf.D[i] * M[d][i];
      mu[d] -= el;
    }
    return { E: scf.E, mu: mu };
  }

  function toAtoms(proto, x) {
    return proto.map(function (a, i) {
      return { Z: a.Z, xyz: [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]] };
    });
  }

  function xyzString(atoms) {
    return atoms.map(function (a) {
      return App.SYMBOLS[a.Z] + " " + a.xyz.map(function (c) {
        return (c * BOHR_TO_A).toFixed(6);
      }).join(" ");
    }).join("\n");
  }

  // run(xyzText, charge, mult, basisName, onIter) -> summary + optimized xyz
  function run(xyzText, charge, mult, basisName, onIter) {
    var proto = App.engine.parseXYZ(xyzText);
    if (proto.length < 2) throw new Error(App.tr("err.opt.one"));
    if (proto.length > 10) throw new Error(App.tr("err.opt.max"));

    var n = proto.length * 3;
    var x = new Float64Array(n);
    proto.forEach(function (a, i) {
      x[i * 3] = a.xyz[0]; x[i * 3 + 1] = a.xyz[1]; x[i * 3 + 2] = a.xyz[2];
    });
    var f = function (xv) { return energyAt(toAtoms(proto, xv), charge, mult, basisName).E; };

    function grad(xv) {
      var g = new Float64Array(n);
      for (var i = 0; i < n; i++) {
        var xp = Float64Array.from(xv); xp[i] += DELTA;
        var xm = Float64Array.from(xv); xm[i] -= DELTA;
        g[i] = (f(xp) - f(xm)) / (2 * DELTA);
      }
      // exact net force on the molecule is zero: remove finite-diff drift
      for (var d = 0; d < 3; d++) {
        var mean = 0;
        for (var a = d; a < n; a += 3) mean += g[a];
        mean /= proto.length;
        for (a = d; a < n; a += 3) g[a] -= mean;
      }
      return g;
    }
    var gmaxOf = function (g) {
      var m = 0;
      for (var i = 0; i < n; i++) m = Math.max(m, Math.abs(g[i]));
      return m;
    };

    // inverse Hessian estimate, starts as I (bond stiffness ~ 1 Ha/bohr^2)
    var H = new Float64Array(n * n);
    for (var i = 0; i < n; i++) H[i * n + i] = 1;

    var E = f(x), E0 = E;
    var g = grad(x);
    var path = [E];
    var converged = false, iter = 0;

    for (iter = 0; iter < 50; iter++) {
      var gmax = gmaxOf(g);
      if (onIter) onIter({ iter: iter, E: E, gmax: gmax });
      if (gmax < GMAX_CONV) { converged = true; break; }

      // p = -H g, clamped
      var p = new Float64Array(n), pmax = 0;
      for (i = 0; i < n; i++) {
        var s = 0;
        for (var j = 0; j < n; j++) s -= H[i * n + j] * g[j];
        p[i] = s;
        pmax = Math.max(pmax, Math.abs(s));
      }
      if (pmax > MAXSTEP) for (i = 0; i < n; i++) p[i] *= MAXSTEP / pmax;

      // backtracking on energy increase
      var t = 1, xn = null, En = Infinity;
      for (var bt = 0; bt < 4; bt++) {
        xn = Float64Array.from(x);
        for (i = 0; i < n; i++) xn[i] += t * p[i];
        En = f(xn);
        if (En < E + 1e-10) break;
        t /= 2;
      }
      if (En >= E + 1e-10) {
        // BFGS direction failed: reset curvature, take a small steepest descent
        for (i = 0; i < n * n; i++) H[i] = 0;
        for (i = 0; i < n; i++) H[i * n + i] = 1;
        xn = Float64Array.from(x);
        var sd = Math.min(0.05 / Math.max(gmax, 1e-8), 1);
        for (i = 0; i < n; i++) xn[i] -= sd * g[i];
        En = f(xn);
        if (En >= E) { converged = gmax < 5 * GMAX_CONV; break; }
      }

      var gn = grad(xn);
      // BFGS inverse update
      var sV = new Float64Array(n), yV = new Float64Array(n), sy = 0;
      for (i = 0; i < n; i++) { sV[i] = xn[i] - x[i]; yV[i] = gn[i] - g[i]; sy += sV[i] * yV[i]; }
      if (sy > 1e-10) {
        var Hy = new Float64Array(n), yHy = 0;
        for (i = 0; i < n; i++) {
          var hs = 0;
          for (j = 0; j < n; j++) hs += H[i * n + j] * yV[j];
          Hy[i] = hs;
        }
        for (i = 0; i < n; i++) yHy += yV[i] * Hy[i];
        var r = 1 / sy;
        for (i = 0; i < n; i++) {
          for (j = 0; j < n; j++) {
            H[i * n + j] += ((1 + r * yHy) * sV[i] * sV[j]) * r -
              (Hy[i] * sV[j] + sV[i] * Hy[j]) * r;
          }
        }
      }
      x = xn; E = En; g = gn;
      path.push(E);
    }

    return {
      xyz: xyzString(toAtoms(proto, x)),
      E0: E0, E: E, path: path,
      iters: iter, converged: converged, gmax: gmaxOf(g)
    };
  }

  App.optimize = { run: run, energyAt: energyAt };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
