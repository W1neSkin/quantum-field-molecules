// Electron field density renderer: 2D slice of <n(x)> through the molecule.
// Modes: total / deformation / spin density, MO amplitude (with sign),
// ESP, ELF and the density Laplacian (the last three are built lazily).
(function (App) {
  "use strict";

  // field sampling resolution; the visible canvas is larger and the field is
  // blitted up so nuclei markers, labels and arrows stay crisp
  var W = 480, H = 288, NPIX = W * H;
  var BOHR_PER_ANGSTROM = 1.8897259886;
  var fieldCanvas = null;

  // --- colormaps, rebuilt from the active theme palette ---
  var BG = { r: 24, g: 24, b: 24 }, FGc = { r: 212, g: 212, b: 212 };
  var BLUE = { r: 123, g: 175, b: 233 }, YELLOW = { r: 241, g: 180, b: 103 }, ORANGE = { r: 208, g: 135, b: 112 };

  function makeLut(stops) {
    var lut = [];
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      var f = Math.min(Math.max((t - stops[k][0]) / (stops[k + 1][0] - stops[k][0] || 1), 0), 1);
      var c0 = stops[k][1], c1 = stops[k + 1][1];
      lut.push({ r: c0.r + (c1.r - c0.r) * f | 0, g: c0.g + (c1.g - c0.g) * f | 0, b: c0.b + (c1.b - c0.b) * f | 0 });
    }
    return lut;
  }
  var LUT_DENSITY, LUT_DIVERGING;
  function refreshTheme() {
    if (App.theme && typeof document !== "undefined") {
      BG = App.theme.rgb("surface");
      FGc = App.theme.rgb("chart-fg");
      BLUE = App.theme.rgb("map-blue");
      YELLOW = App.theme.rgb("map-warm");
      ORANGE = App.theme.rgb("map-orange");
    }
    LUT_DENSITY = makeLut([[0, BG], [0.5, BLUE], [0.82, YELLOW], [1, FGc]]);
    LUT_DIVERGING = makeLut([[0, BLUE], [0.5, BG], [1, ORANGE]]);
    if (App.heatmap) {
      App.heatmap.LUT_DENSITY = LUT_DENSITY;
      App.heatmap.LUT_DIVERGING = LUT_DIVERGING;
    }
  }
  refreshTheme();

  // Promolecule shell occupations per Z, in basis order [1s, 2s, 2px, 2py, 2pz]
  var ATOM_OCC = {
    1: [1], 2: [2], 3: [2, 1, 0, 0, 0], 4: [2, 2, 0, 0, 0],
    5: [2, 2, 1 / 3, 1 / 3, 1 / 3], 6: [2, 2, 2 / 3, 2 / 3, 2 / 3], 7: [2, 2, 1, 1, 1],
    8: [2, 2, 4 / 3, 4 / 3, 4 / 3], 9: [2, 2, 5 / 3, 5 / 3, 5 / 3], 10: [2, 2, 2, 2, 2]
  };

  function v3(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function norm3(a) {
    var n = Math.hypot(a[0], a[1], a[2]);
    return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [1, 0, 0];
  }

  // Slice plane through the molecule: first three non-collinear atoms, else axis + any perpendicular.
  function pickPlane(atoms) {
    var c = atoms.reduce(function (s, a) { return v3(s, a.xyz, 1); }, [0, 0, 0])
      .map(function (x) { return x / atoms.length; });
    var u = atoms.length > 1
      ? norm3([atoms[1].xyz[0] - atoms[0].xyz[0], atoms[1].xyz[1] - atoms[0].xyz[1], atoms[1].xyz[2] - atoms[0].xyz[2]])
      : [1, 0, 0];
    var v = null;
    for (var k = 2; k < atoms.length; k++) {
      var d = [atoms[k].xyz[0] - atoms[0].xyz[0], atoms[k].xyz[1] - atoms[0].xyz[1], atoms[k].xyz[2] - atoms[0].xyz[2]];
      var dot = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      var perp = v3(d, u, -dot);
      if (Math.hypot(perp[0], perp[1], perp[2]) > 0.2) { v = norm3(perp); break; }
    }
    if (!v) v = norm3(Math.abs(u[0]) < 0.9 ? [1 - u[0] * u[0], -u[0] * u[1], -u[0] * u[2]] : [-u[1] * u[0], 1 - u[1] * u[1], -u[1] * u[2]]);
    return { origin: c, u: u, v: v };
  }

  // Precompute everything reusable for a molecule: plane, extents, basis values on the grid.
  function prepare(result) {
    var atoms = result.atoms, basis = result.basis, nb = basis.length;
    var plane = pickPlane(atoms);
    var margin = 3.6; // bohr
    var maxU = 1, maxV = 1;
    var proj = atoms.map(function (a) {
      var d = [a.xyz[0] - plane.origin[0], a.xyz[1] - plane.origin[1], a.xyz[2] - plane.origin[2]];
      var au = d[0] * plane.u[0] + d[1] * plane.u[1] + d[2] * plane.u[2];
      var av = d[0] * plane.v[0] + d[1] * plane.v[1] + d[2] * plane.v[2];
      maxU = Math.max(maxU, Math.abs(au)); maxV = Math.max(maxV, Math.abs(av));
      return [au, av];
    });
    var halfU = maxU + margin, halfV = maxV + margin;
    if (halfV < halfU * H / W) halfV = halfU * H / W; else halfU = halfV * W / H;

    function gridAt(origin) {
      var bg = new Float32Array(nb * NPIX);
      for (var py = 0; py < H; py++) {
        var fv = (py / (H - 1) * 2 - 1) * -halfV;
        for (var px = 0; px < W; px++) {
          var fu = (px / (W - 1) * 2 - 1) * halfU;
          var P = [
            origin[0] + plane.u[0] * fu + plane.v[0] * fv,
            origin[1] + plane.u[1] * fu + plane.v[1] * fv,
            origin[2] + plane.u[2] * fu + plane.v[2] * fv
          ];
          var pix = py * W + px;
          for (var i = 0; i < nb; i++) {
            var f = basis[i];
            var dx = P[0] - f.center[0], dy = P[1] - f.center[1], dz = P[2] - f.center[2];
            var r2 = dx * dx + dy * dy + dz * dz;
            var rad = 0;
            for (var pidx = 0; pidx < f.exps.length; pidx++) {
              var e = f.exps[pidx] * r2;
              if (e < 30) rad += f.coefs[pidx] * Math.exp(-e);
            }
            if (rad !== 0 && (f.l || f.m || f.n)) {
              rad *= Math.pow(dx, f.l) * Math.pow(dy, f.m) * Math.pow(dz, f.n);
            }
            bg[i * NPIX + pix] = rad;
          }
        }
      }
      return bg;
    }

    var prep = {
      result: result, plane: plane, halfU: halfU, halfV: halfV, proj: proj,
      basisGrid: gridAt(plane.origin), nb: nb, offsetGrid: null
    };
    // lazy slice shifted 0.5 A along the normal, for modes with a node in the main plane
    prep.getOffsetGrid = function () {
      if (!prep.offsetGrid) {
        var nrm = norm3([
          plane.u[1] * plane.v[2] - plane.u[2] * plane.v[1],
          plane.u[2] * plane.v[0] - plane.u[0] * plane.v[2],
          plane.u[0] * plane.v[1] - plane.u[1] * plane.v[0]
        ]);
        prep.offsetGrid = gridAt(v3(plane.origin, nrm, 0.5 * BOHR_PER_ANGSTROM));
      }
      return prep.offsetGrid;
    };
    return prep;
  }

  function moValues(prep, bg, mo, C) {
    var nb = prep.nb;
    var out = new Float32Array(NPIX);
    for (var p = 0; p < NPIX; p++) {
      var psi = 0;
      for (var i = 0; i < nb; i++) psi += C[i * nb + mo] * bg[i * NPIX + p];
      out[p] = psi;
    }
    return out;
  }

  // out += w * psi_m^2 for each of the first nocc orbitals of C
  function occPass(out, prep, bg, C, nocc, w) {
    var nb = prep.nb;
    for (var m = 0; m < nocc; m++) {
      for (var p = 0; p < NPIX; p++) {
        var s = 0;
        for (var i = 0; i < nb; i++) s += C[i * nb + m] * bg[i * NPIX + p];
        out[p] += w * s * s;
      }
    }
  }

  // mode: {kind: "total"|"diff"|"spin"|"mo", mo, spin: "a"|"b"}. May set mode.usedOffset.
  function fieldValues(prep, mode) {
    var bg = prep.basisGrid, scf = prep.result.scf;
    var out = new Float32Array(NPIX), p;
    if (mode.kind === "mo") {
      var C = mode.localized && scf.Cloc ? scf.Cloc
        : mode.spin === "b" && scf.uhf ? scf.CB : scf.C;
      out = moValues(prep, bg, mode.mo, C);
      var maxA = 0;
      for (p = 0; p < NPIX; p++) if (Math.abs(out[p]) > maxA) maxA = Math.abs(out[p]);
      mode.usedOffset = false;
      if (maxA < 1e-6) {
        // node exactly in the slice plane (pi modes of planar molecules)
        out = moValues(prep, prep.getOffsetGrid(), mode.mo, C);
        mode.usedOffset = true;
      }
      return out;
    }
    if (mode.kind === "esp") return prep.espValues || out;
    if (mode.kind === "elf") return prep.elfValues || out;
    if (mode.kind === "lap") return prep.lapValues || out;
    if (mode.kind === "spin") {
      occPass(out, prep, bg, scf.C, scf.nocc, 1);
      occPass(out, prep, bg, scf.CB, scf.noccB, -1);
      return out;
    }
    if (scf.uhf) {
      occPass(out, prep, bg, scf.C, scf.nocc, 1);
      occPass(out, prep, bg, scf.CB, scf.noccB, 1);
    } else {
      occPass(out, prep, bg, scf.C, scf.nocc, 2);
    }
    if (mode.kind === "diff") {
      var fnIdx = {};
      prep.result.basis.forEach(function (f, idx) {
        fnIdx[f.atom] = fnIdx[f.atom] || [];
        fnIdx[f.atom].push(idx);
      });
      prep.result.atoms.forEach(function (a, ai) {
        var occ = ATOM_OCC[a.Z];
        fnIdx[ai].forEach(function (idx, k) {
          var o = occ[k] || 0;
          if (!o) return;
          for (p = 0; p < NPIX; p++) {
            var b = bg[idx * NPIX + p];
            out[p] -= o * b * b;
          }
        });
      });
    }
    return out;
  }

  function draw(canvas, prep, mode) {
    if (!fieldCanvas) {
      fieldCanvas = document.createElement("canvas");
      fieldCanvas.width = W; fieldCanvas.height = H;
    }
    var fctx = fieldCanvas.getContext("2d");
    var vals = fieldValues(prep, mode);
    var img = fctx.createImageData(W, H);
    var isEsp = mode.kind === "esp", isLap = mode.kind === "lap", isElf = mode.kind === "elf";
    var maxAbs = 1e-12;
    if (isEsp && prep.espScale) {
      // nuclei are +inf singularities; scale by the far-field extremum instead
      maxAbs = prep.espScale;
    } else if (isLap && prep.lapScale) {
      maxAbs = prep.lapScale;
    } else if (isElf) {
      maxAbs = 1; // ELF is bounded 0..1 by construction; keep the absolute scale
    } else {
      for (var pm = 0; pm < NPIX; pm++) if (Math.abs(vals[pm]) > maxAbs) maxAbs = Math.abs(vals[pm]);
    }
    var diverging = mode.kind !== "total" && !isElf;
    for (var p = 0; p < NPIX; p++) {
      var c;
      if (diverging) {
        // sign flips keep orange = "chemically interesting": ESP attractive to
        // electrophiles, Laplacian charge concentration
        var v = isEsp || isLap ? -vals[p] : vals[p];
        var s = Math.sign(v) * Math.pow(Math.min(Math.abs(v) / maxAbs, 1), 0.55);
        c = LUT_DIVERGING[Math.round((s + 1) / 2 * 255)];
      } else if (isElf) {
        c = LUT_DENSITY[Math.round(Math.min(Math.max(vals[p], 0), 1) * 255)];
      } else {
        c = LUT_DENSITY[Math.round(Math.pow(Math.min(vals[p] / maxAbs, 1), 0.4) * 255)];
      }
      var o = p * 4;
      img.data[o] = c.r; img.data[o + 1] = c.g; img.data[o + 2] = c.b; img.data[o + 3] = 255;
    }
    fctx.putImageData(img, 0, 0);

    var cw = canvas.width, ch = canvas.height, S = cw / W;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldCanvas, 0, 0, W, H, 0, 0, cw, ch);

    // nuclei markers and 1 angstrom scale bar, in full canvas resolution
    var fg = App.theme ? App.theme.color("chart-fg") : "rgb(212,212,212)";
    ctx.font = Math.round(11 * S) + "px system-ui, sans-serif";
    var pxPerBohr = cw / (2 * prep.halfU);
    prep.proj.forEach(function (uv, ai) {
      var x = cw / 2 + uv[0] * pxPerBohr, y = ch / 2 - uv[1] * pxPerBohr;
      ctx.beginPath(); ctx.arc(x, y, 3.5 * S, 0, 2 * Math.PI);
      ctx.strokeStyle = fg; ctx.lineWidth = 1.5 * S; ctx.stroke();
      ctx.fillStyle = fg;
      ctx.fillText(App.SYMBOLS[prep.result.atoms[ai].Z], x + 6 * S, y - 6 * S);
    });
    var bar = BOHR_PER_ANGSTROM * pxPerBohr, y0 = ch - 14 * S;
    ctx.strokeStyle = fg; ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(14 * S, y0); ctx.lineTo(14 * S + bar, y0);
    ctx.moveTo(14 * S, y0 - 3 * S); ctx.lineTo(14 * S, y0 + 3 * S);
    ctx.moveTo(14 * S + bar, y0 - 3 * S); ctx.lineTo(14 * S + bar, y0 + 3 * S);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.fillText("1 Å", 18 * S + bar, y0 + 4 * S);
  }

  App.heatmap = {
    prepare: prepare, draw: draw, W: W, H: H, refreshTheme: refreshTheme,
    LUT_DENSITY: LUT_DENSITY, LUT_DIVERGING: LUT_DIVERGING, ATOM_OCC: ATOM_OCC
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
