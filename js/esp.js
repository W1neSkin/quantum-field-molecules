// Electrostatic potential on the heatmap slice: phi(r) = sum Z/|r-R| - <D|1/|r-r'|>.
// The electronic part reuses the precomputed MD pair data from eri.js; computed
// on a coarse grid (async, row by row), bilinearly upscaled, cached on prep.
(function (App) {
  "use strict";

  var ERF_A = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];

  // Boys F_0..F_m: closed-form F0 via erf + upward recursion (x >= 0.9),
  // accurate series for small x. Visualization-grade (~1e-6).
  function boysFast(mmax, x) {
    var F = new Float64Array(mmax + 1), m;
    if (x < 0.9) return App.integrals.boys(mmax, x);
    // erf via Abramowitz-Stegun 7.1.26 (|err| < 1.5e-7)
    var sq = Math.sqrt(x);
    var t = 1 / (1 + 0.3275911 * sq);
    var poly = ((((ERF_A[4] * t + ERF_A[3]) * t + ERF_A[2]) * t + ERF_A[1]) * t + ERF_A[0]) * t;
    var erf = 1 - poly * Math.exp(-x);
    F[0] = 0.5 * Math.sqrt(Math.PI / x) * erf;
    var ex = Math.exp(-x);
    for (m = 0; m < mmax; m++) F[m + 1] = ((2 * m + 1) * F[m] - ex) / (2 * x);
    return F;
  }

  // V_pair(C) = sum_prims c*(2pi/p) * sum_tuv ex ey ez R_tuv - potential integral
  function pairPotential(pair, C) {
    var L = pair.L, v = 0;
    var tmax = L[0] + L[1] + L[2];
    for (var k = 0; k < pair.prims.length; k++) {
      var pr = pair.prims[k];
      var X = pr.P[0] - C[0], Y = pr.P[1] - C[1], Z = pr.P[2] - C[2];
      var F = boysFast(tmax, pr.p * (X * X + Y * Y + Z * Z));
      var base = new Float64Array(tmax + 1);
      for (var n = 0; n <= tmax; n++) base[n] = Math.pow(-2 * pr.p, n) * F[n];
      var memo = {};
      var R = function (t, u, w, n) {
        if (t < 0 || u < 0 || w < 0) return 0;
        if (t === 0 && u === 0 && w === 0) return base[n];
        var key = ((t * 16 + u) * 16 + w) * 16 + n;
        if (key in memo) return memo[key];
        var val;
        if (t > 0) val = (t - 1) * R(t - 2, u, w, n + 1) + X * R(t - 1, u, w, n + 1);
        else if (u > 0) val = (u - 1) * R(t, u - 2, w, n + 1) + Y * R(t, u - 1, w, n + 1);
        else val = (w - 1) * R(t, u, w - 2, n + 1) + Z * R(t, u, w - 1, n + 1);
        memo[key] = val;
        return val;
      };
      var s = 0;
      for (var t = 0; t <= L[0]; t++) {
        if (pr.ex[t] === 0) continue;
        for (var u = 0; u <= L[1]; u++) {
          if (pr.ey[u] === 0) continue;
          for (var w = 0; w <= L[2]; w++) {
            if (pr.ez[w] === 0) continue;
            s += pr.ex[t] * pr.ey[u] * pr.ez[w] * R(t, u, w, 0);
          }
        }
      }
      v += pr.c * (2 * Math.PI / pr.p) * s;
    }
    return v;
  }

  // ensure(prep, onProgress, done): builds prep.espValues / prep.espScale once
  function ensure(prep, onProgress, done) {
    if (prep.espValues) { done(prep.espValues); return; }
    prep.espWaiters = (prep.espWaiters || []).concat(done);
    if (prep.espBuilding) return;
    prep.espBuilding = true;

    var result = prep.result, atoms = result.atoms, basis = result.basis;
    var nb = prep.nb, D = result.scf.D;
    var W = App.heatmap.W, H = App.heatmap.H;
    var CW = nb > 24 ? 90 : 120, CH = nb > 24 ? 54 : 72; // coarse grid, 5:3
    var plane = prep.plane, halfU = prep.halfU, halfV = prep.halfV;

    var pairs = App.eri.buildPairs(basis);
    // weights: D_ij (x2 off-diagonal); drop negligible pairs entirely
    var act = [];
    var pi = 0;
    for (var i = 0; i < nb; i++) {
      for (var j = 0; j <= i; j++, pi++) {
        var wgt = D[i * nb + j] * (i === j ? 1 : 2);
        if (Math.abs(wgt) > 1e-8) act.push({ pair: pairs[pi], w: wgt });
      }
    }

    var coarse = new Float32Array(CW * CH);
    var row = 0;
    function rowPass() {
      var fv = (row / (CH - 1) * 2 - 1) * -halfV;
      for (var px = 0; px < CW; px++) {
        var fu = (px / (CW - 1) * 2 - 1) * halfU;
        var P = [
          plane.origin[0] + plane.u[0] * fu + plane.v[0] * fv,
          plane.origin[1] + plane.u[1] * fu + plane.v[1] * fv,
          plane.origin[2] + plane.u[2] * fu + plane.v[2] * fv
        ];
        var phi = 0;
        for (var a = 0; a < atoms.length; a++) {
          var dx = P[0] - atoms[a].xyz[0], dy = P[1] - atoms[a].xyz[1], dz = P[2] - atoms[a].xyz[2];
          phi += atoms[a].Z / Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-6);
        }
        for (var k = 0; k < act.length; k++) phi -= act[k].w * pairPotential(act[k].pair, P);
        coarse[row * CW + px] = phi;
      }
      row++;
      if (onProgress) onProgress(row / CH);
      if (row < CH) { setTimeout(rowPass, 0); return; }
      finish();
    }

    function finish() {
      // bilinear upscale to the heatmap resolution
      var out = new Float32Array(W * H);
      for (var py = 0; py < H; py++) {
        var gy = py / (H - 1) * (CH - 1), y0 = Math.floor(gy), fy = gy - y0, y1 = Math.min(y0 + 1, CH - 1);
        for (var px = 0; px < W; px++) {
          var gx = px / (W - 1) * (CW - 1), x0 = Math.floor(gx), fx = gx - x0, x1 = Math.min(x0 + 1, CW - 1);
          out[py * W + px] =
            coarse[y0 * CW + x0] * (1 - fx) * (1 - fy) + coarse[y0 * CW + x1] * fx * (1 - fy) +
            coarse[y1 * CW + x0] * (1 - fx) * fy + coarse[y1 * CW + x1] * fx * fy;
        }
      }
      // color scale from pixels away from nuclear singularities
      var pxPerBohrU = W / (2 * halfU), pxPerBohrV = H / (2 * halfV);
      var scale = 1e-6;
      for (py = 0; py < H; py++) {
        for (px = 0; px < W; px++) {
          var nearNucleus = false;
          for (var a = 0; a < prep.proj.length; a++) {
            var nx = W / 2 + prep.proj[a][0] * pxPerBohrU, ny = H / 2 - prep.proj[a][1] * pxPerBohrV;
            var ddx = (px - nx) / pxPerBohrU, ddy = (py - ny) / pxPerBohrV;
            if (ddx * ddx + ddy * ddy < 1.2 * 1.2) { nearNucleus = true; break; }
          }
          if (!nearNucleus && Math.abs(out[py * W + px]) > scale) scale = Math.abs(out[py * W + px]);
        }
      }
      prep.espValues = out;
      prep.espScale = scale;
      prep.espBuilding = false;
      var ws = prep.espWaiters; prep.espWaiters = [];
      ws.forEach(function (cb) { cb(out); });
    }

    rowPass();
  }

  App.esp = { ensure: ensure };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
