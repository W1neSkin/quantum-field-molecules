// ELF and the density Laplacian on the heatmap slice. One pass over the
// total density matrix yields rho, grad rho, tau (kinetic energy density)
// and lap rho on a coarse grid, bilinearly upscaled; cached on prep like ESP.
// ELF = 1/(1+(D/Dh)^2), Becke-Edgecombe 1990; D clamped at 0, far tail damped.
(function (App) {
  "use strict";

  var CF = 0.3 * Math.pow(3 * Math.PI * Math.PI, 2 / 3); // Thomas-Fermi prefactor

  // d^(l-2)..d^(l+2); negative powers unused (their coefficients vanish)
  function pw(d, l) {
    var p0 = Math.pow(d, l);
    return [l > 1 ? Math.pow(d, l - 2) : 0, l > 0 ? Math.pow(d, l - 1) : 0, p0, p0 * d, p0 * d * d];
  }

  // chi, grad chi, lap chi of a contracted Cartesian Gaussian -> buf[off..off+4]
  function evalBasis(f, dx, dy, dz, buf, off) {
    var r2 = dx * dx + dy * dy + dz * dz;
    var S0 = 0, S1 = 0, S2 = 0;
    for (var k = 0; k < f.exps.length; k++) {
      var a = f.exps[k], e = a * r2;
      if (e < 30) { var g = f.coefs[k] * Math.exp(-e); S0 += g; S1 += a * g; S2 += a * a * g; }
    }
    if (S0 === 0 && S1 === 0) {
      buf[off] = buf[off + 1] = buf[off + 2] = buf[off + 3] = buf[off + 4] = 0;
      return;
    }
    var X = pw(dx, f.l), Y = pw(dy, f.m), Z = pw(dz, f.n);
    buf[off] = X[2] * Y[2] * Z[2] * S0;
    buf[off + 1] = Y[2] * Z[2] * (f.l * X[1] * S0 - 2 * X[3] * S1);
    buf[off + 2] = X[2] * Z[2] * (f.m * Y[1] * S0 - 2 * Y[3] * S1);
    buf[off + 3] = X[2] * Y[2] * (f.n * Z[1] * S0 - 2 * Z[3] * S1);
    buf[off + 4] =
      Y[2] * Z[2] * (f.l * (f.l - 1) * X[0] * S0 - 2 * (2 * f.l + 1) * X[2] * S1 + 4 * X[4] * S2) +
      X[2] * Z[2] * (f.m * (f.m - 1) * Y[0] * S0 - 2 * (2 * f.m + 1) * Y[2] * S1 + 4 * Y[4] * S2) +
      X[2] * Y[2] * (f.n * (f.n - 1) * Z[0] * S0 - 2 * (2 * f.n + 1) * Z[2] * S1 + 4 * Z[4] * S2);
  }

  // significant D_ij entries (x2 off-diagonal), same screening as the ESP map
  function pairList(basis, D) {
    var nb = basis.length, act = [];
    for (var i = 0; i < nb; i++) {
      for (var j = 0; j <= i; j++) {
        var w = D[i * nb + j] * (i === j ? 1 : 2);
        if (Math.abs(w) > 1e-8) act.push({ i: i, j: j, w: w });
      }
    }
    return act;
  }

  // rho, |grad rho|^2, tau, lap rho at one 3D point (a.u.); buf = Float64Array(5*nb)
  function fieldsAt(basis, act, P, buf) {
    for (var i = 0; i < basis.length; i++) {
      var f = basis[i];
      evalBasis(f, P[0] - f.center[0], P[1] - f.center[1], P[2] - f.center[2], buf, i * 5);
    }
    var rho = 0, gx = 0, gy = 0, gz = 0, gdot = 0, lap = 0;
    for (var k = 0; k < act.length; k++) {
      var a = act[k], oi = a.i * 5, oj = a.j * 5, w = a.w;
      var vi = buf[oi], vj = buf[oj];
      var dd = buf[oi + 1] * buf[oj + 1] + buf[oi + 2] * buf[oj + 2] + buf[oi + 3] * buf[oj + 3];
      rho += w * vi * vj;
      gx += w * (vi * buf[oj + 1] + vj * buf[oi + 1]);
      gy += w * (vi * buf[oj + 2] + vj * buf[oi + 2]);
      gz += w * (vi * buf[oj + 3] + vj * buf[oi + 3]);
      gdot += w * dd;
      lap += w * (vi * buf[oj + 4] + vj * buf[oi + 4] + 2 * dd);
    }
    // tau = (1/2) sum_ij D_ij grad chi_i . grad chi_j (per-pair kinetic density)
    return { rho: rho, g2: gx * gx + gy * gy + gz * gz, tau: 0.5 * gdot, lap: lap };
  }

  function elfOf(q) {
    if (q.rho < 1e-12) return 0;
    var D = q.tau - q.g2 / (8 * q.rho);
    if (D < 0) D = 0; // Pauli kinetic energy is non-negative; clamp numeric noise
    var x = D / (CF * Math.pow(q.rho, 5 / 3));
    // damp where the density itself is negligible so the background stays dark
    return 1 / (1 + x * x) * (q.rho / (q.rho + 1e-6));
  }

  // builds prep.elfValues / prep.lapValues / prep.lapScale once, async by rows
  function ensure(prep, onProgress, done) {
    if (prep.elfValues) { done(); return; }
    prep.fieldsWaiters = (prep.fieldsWaiters || []).concat(done);
    if (prep.fieldsBuilding) return;
    prep.fieldsBuilding = true;

    var result = prep.result, basis = result.basis, nb = prep.nb;
    var W = App.heatmap.W, H = App.heatmap.H;
    var CW = nb > 40 ? 160 : 240, CH = nb > 40 ? 96 : 144; // coarse grid, 5:3
    var plane = prep.plane, halfU = prep.halfU, halfV = prep.halfV;
    var act = pairList(basis, result.scf.D);
    var buf = new Float64Array(5 * nb);

    var cElf = new Float32Array(CW * CH), cLap = new Float32Array(CW * CH);
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
        var q = fieldsAt(basis, act, P, buf);
        cElf[row * CW + px] = elfOf(q);
        cLap[row * CW + px] = q.lap;
      }
      row++;
      if (onProgress) onProgress(row / CH);
      if (row < CH) { setTimeout(rowPass, 0); return; }
      finish();
    }

    function upscale(coarse) {
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
      return out;
    }

    function finish() {
      var lap = upscale(cLap);
      // core spikes dominate; colour scale from pixels away from the nuclei
      var pxPerBohrU = W / (2 * halfU), pxPerBohrV = H / (2 * halfV);
      var scale = 1e-12;
      for (var py = 0; py < H; py++) {
        for (var px = 0; px < W; px++) {
          var nearNucleus = false;
          for (var a = 0; a < prep.proj.length; a++) {
            var nx = W / 2 + prep.proj[a][0] * pxPerBohrU, ny = H / 2 - prep.proj[a][1] * pxPerBohrV;
            var ddx = (px - nx) / pxPerBohrU, ddy = (py - ny) / pxPerBohrV;
            if (ddx * ddx + ddy * ddy < 1.2 * 1.2) { nearNucleus = true; break; }
          }
          if (!nearNucleus && Math.abs(lap[py * W + px]) > scale) scale = Math.abs(lap[py * W + px]);
        }
      }
      prep.elfValues = upscale(cElf);
      prep.lapValues = lap;
      prep.lapScale = scale;
      prep.fieldsBuilding = false;
      var ws = prep.fieldsWaiters; prep.fieldsWaiters = [];
      ws.forEach(function (cb) { cb(); });
    }

    rowPass();
  }

  // synchronous single-point evaluation for tests: P in bohr
  function probe(result, P) {
    var act = pairList(result.basis, result.scf.D);
    var q = fieldsAt(result.basis, act, P, new Float64Array(5 * result.basis.length));
    q.elf = elfOf(q);
    return q;
  }

  App.fields2d = { ensure: ensure, probe: probe };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
