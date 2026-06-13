// 3D field sampling for the volume view: basis functions on a 64^3 grid
// (chunked to keep the UI alive), then per-mode field combine encoded to
// Uint8 for a filterable R8 3D texture. Encoding: sqrt-compressed magnitude,
// sign mapped to [0..0.5..1] for signed fields (good precision near zero).
(function (App) {
  "use strict";

  var N = 64, NVOX = N * N * N;

  function bounds(atoms) {
    var c = [0, 0, 0];
    atoms.forEach(function (a) { c[0] += a.xyz[0]; c[1] += a.xyz[1]; c[2] += a.xyz[2]; });
    c = c.map(function (x) { return x / atoms.length; });
    var half = 0;
    atoms.forEach(function (a) {
      for (var d = 0; d < 3; d++) half = Math.max(half, Math.abs(a.xyz[d] - c[d]));
    });
    return { center: c, half: half + 3.5 };
  }

  // Basis values on the grid, one z-slice per timeout tick.
  // done(prep3d) where prep3d = {bg, bounds, nb, result}
  function buildBasisGrid(result, onProgress, done) {
    var basis = result.basis, nb = basis.length;
    var b = bounds(result.atoms);
    var bg = new Float32Array(nb * NVOX);
    var z = 0;

    function slice() {
      var pz = b.center[2] + (z / (N - 1) * 2 - 1) * b.half;
      for (var y = 0; y < N; y++) {
        var py = b.center[1] + (y / (N - 1) * 2 - 1) * b.half;
        for (var x = 0; x < N; x++) {
          var px = b.center[0] + (x / (N - 1) * 2 - 1) * b.half;
          var vox = (z * N + y) * N + x;
          for (var i = 0; i < nb; i++) {
            var f = basis[i];
            var dx = px - f.center[0], dy = py - f.center[1], dz = pz - f.center[2];
            var r2 = dx * dx + dy * dy + dz * dz;
            var rad = 0;
            for (var k = 0; k < f.exps.length; k++) {
              var e = f.exps[k] * r2;
              if (e < 30) rad += f.coefs[k] * Math.exp(-e);
            }
            if (rad !== 0 && (f.l || f.m || f.n)) {
              rad *= Math.pow(dx, f.l) * Math.pow(dy, f.m) * Math.pow(dz, f.n);
            }
            bg[i * NVOX + vox] = rad;
          }
        }
      }
      z++;
      if (onProgress) onProgress(z / N);
      if (z < N) setTimeout(slice, 0);
      else done({ bg: bg, bounds: b, nb: nb, result: result });
    }
    slice();
  }

  // single MO amplitude (w=0) or accumulate w*psi^2 into out
  function moPass(prep, C, mo, out, w) {
    var nb = prep.nb, bg = prep.bg;
    for (var v = 0; v < NVOX; v++) {
      var psi = 0;
      for (var i = 0; i < nb; i++) psi += C[i * nb + mo] * bg[i * NVOX + v];
      out[v] = w ? out[v] + w * psi * psi : psi;
    }
  }

  // valence-scale cap for total density (a.u.): without it the nuclear cores
  // (rho ~ 10^2 at O/N/F) eat the whole dynamic range and the bonding cloud
  // encodes to ~0 - heavy molecules degrade to dots at the nuclei
  var RHO_CAP = 1.5;

  function encode(field, signed, cap) {
    var max = 1e-12, v;
    for (v = 0; v < NVOX; v++) if (Math.abs(field[v]) > max) max = Math.abs(field[v]);
    if (cap && max > cap) max = cap;
    var u8 = new Uint8Array(NVOX);
    for (v = 0; v < NVOX; v++) {
      var s = Math.sqrt(Math.min(Math.abs(field[v]), max) / max);
      u8[v] = signed
        ? Math.round((Math.sign(field[v]) * s * 0.5 + 0.5) * 255)
        : Math.round(s * 255);
    }
    return u8;
  }

  // which coefficient matrix a single-MO mode refers to
  function moMatrix(scf, mode) {
    if (mode.localized && scf.Cloc) return scf.Cloc;
    return mode.spin === "b" && scf.uhf ? scf.CB : scf.C;
  }

  // list of {C, nocc, w} passes that build the requested field
  function passPlan(scf, mode) {
    if (mode.kind === "spin") return [{ C: scf.C, nocc: scf.nocc, w: 1 }, { C: scf.CB, nocc: scf.noccB, w: -1 }];
    if (scf.uhf) return [{ C: scf.C, nocc: scf.nocc, w: 1 }, { C: scf.CB, nocc: scf.noccB, w: 1 }];
    return [{ C: scf.C, nocc: scf.nocc, w: 2 }];
  }

  function subtractPromolecule(prep, out) {
    prep.result.basis.forEach(function (f, idx) {
      var occ = (App.heatmap.ATOM_OCC[prep.result.atoms[f.atom].Z] || [])[fnPos(prep, idx)] || 0;
      if (!occ) return;
      for (var v = 0; v < NVOX; v++) {
        var b = prep.bg[idx * NVOX + v];
        out[v] -= occ * b * b;
      }
    });
  }

  // mode as in heatmap; done({data, signed}); chunked over occupied MOs.
  function fieldVolume(prep, mode, onProgress, done) {
    var out = new Float32Array(NVOX);
    var scf = prep.result.scf;
    if (mode.kind === "mo") {
      moPass(prep, moMatrix(scf, mode), mode.mo, out, 0);
      done({ data: encode(out, true), signed: true });
      return;
    }
    var plan = passPlan(scf, mode);
    var total = plan.reduce(function (s, p) { return s + p.nocc; }, 0) || 1;
    var pi = 0, m = 0, donePasses = 0;
    function step() {
      while (pi < plan.length && m >= plan[pi].nocc) { pi++; m = 0; }
      if (pi < plan.length) {
        moPass(prep, plan[pi].C, m, out, plan[pi].w);
        m++; donePasses++;
        if (onProgress) onProgress(donePasses / total);
        setTimeout(step, 0);
        return;
      }
      if (mode.kind === "diff") subtractPromolecule(prep, out);
      var signed = mode.kind === "diff" || mode.kind === "spin";
      done({ data: encode(out, signed, signed ? 0 : RHO_CAP), signed: signed });
    }
    step();
  }

  // synchronous float field for exports (.cube); same semantics as fieldVolume
  function fieldFloat(prep, mode) {
    var out = new Float32Array(NVOX);
    var scf = prep.result.scf;
    if (mode.kind === "mo") {
      moPass(prep, moMatrix(scf, mode), mode.mo, out, 0);
      return out;
    }
    passPlan(scf, mode).forEach(function (p) {
      for (var m = 0; m < p.nocc; m++) moPass(prep, p.C, m, out, p.w);
    });
    if (mode.kind === "diff") subtractPromolecule(prep, out);
    return out;
  }

  // asynchronous float field for exports (.cube); yields between occupied-orbital passes
  function fieldFloatAsync(prep, mode, onProgress, done) {
    var out = new Float32Array(NVOX);
    var scf = prep.result.scf;
    if (mode.kind === "mo") {
      // Single-MO export has one heavy pass; run it on the next tick for responsiveness.
      setTimeout(function () {
        moPass(prep, moMatrix(scf, mode), mode.mo, out, 0);
        if (onProgress) onProgress(1);
        done(out);
      }, 0);
      return;
    }
    var plan = passPlan(scf, mode);
    var total = plan.reduce(function (s, p) { return s + p.nocc; }, 0) || 1;
    var pi = 0, m = 0, donePasses = 0;
    function step() {
      while (pi < plan.length && m >= plan[pi].nocc) { pi++; m = 0; }
      if (pi < plan.length) {
        moPass(prep, plan[pi].C, m, out, plan[pi].w);
        m++; donePasses++;
        if (onProgress) onProgress(donePasses / total);
        setTimeout(step, 0);
        return;
      }
      if (mode.kind === "diff") subtractPromolecule(prep, out);
      done(out);
    }
    step();
  }

  // index of basis fn within its atom (to address the occupation table)
  function fnPos(prep, idx) {
    var f = prep.result.basis[idx], pos = 0;
    for (var i = 0; i < idx; i++) if (prep.result.basis[i].atom === f.atom) pos++;
    return pos;
  }

  App.grid3d = { N: N, buildBasisGrid: buildBasisGrid, fieldVolume: fieldVolume,
    fieldFloat: fieldFloat, fieldFloatAsync: fieldFloatAsync };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
