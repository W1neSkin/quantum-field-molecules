// Inverse-design core (pure, DOM-free): given a seed geometry and target
// properties, generate single-atom substitutions, relax them locally, and
// score them. Imported by the page, the Web Worker and the Node self-check.
//
// This is an educational heuristic, NOT validated molecular design: candidates
// are HF/STO-3G guesses from a tiny substitution space.
(function (App) {
  "use strict";

  var HA_TO_EV = 27.211386;

  // Covalent radii (Cordero 2008), angstrom, index by Z (H..Ne).
  // Kept local on purpose: this module must stay free of the UI builder.
  var COV_R = [0, 0.31, 0.28, 1.28, 0.96, 0.84, 0.76, 0.71, 0.66, 0.57, 0.58];
  // Rough max bond count per element; used only to reject absurd valence.
  var VMAX = { 1: 1, 3: 1, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3, 9: 1 };
  // Elements offered for substitution. Heavy sites span Li..F; H sites swap H/F.
  var HEAVY_POOL = [3, 4, 5, 6, 7, 8, 9];
  var H_POOL = [1, 9];

  function clone(atoms) {
    return atoms.map(function (a) { return { Z: a.Z, xyz: [a.xyz[0], a.xyz[1], a.xyz[2]] }; });
  }
  function dist(a, b) {
    var dx = a.xyz[0] - b.xyz[0], dy = a.xyz[1] - b.xyz[1], dz = a.xyz[2] - b.xyz[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Compact descriptors used for scoring (gap/ip from canonical eigenvalues).
  function descriptors(result) {
    if (!result || !result.scf) return null;
    var scf = result.scf;
    var eps = scf.eps || [];
    var nocc = scf.nocc || 0;
    // gap needs a virtual orbital; null otherwise (see He2 lesson in cavity).
    var gap = (nocc > 0 && nocc < eps.length) ? (eps[nocc] - eps[nocc - 1]) * HA_TO_EV : null;
    var ip = (nocc > 0 && nocc <= eps.length) ? -eps[nocc - 1] * HA_TO_EV : null;
    var dip = result.props && result.props.dipole ? result.props.dipole.debye : null;
    return {
      dipoleD: dip, gapEv: gap, ipEv: ip,
      nelec: scf.nelec, openShell: !!scf.uhf, energyHa: scf.E
    };
  }

  // Local restoring relax: any pair within bonding range is pulled toward its
  // covalent length r0 (stretched -> contract, too close -> push apart). One
  // linear spring covers both, so substituted geometries get sane bond lengths.
  // Crude on purpose - "optimize geometry" does the real SCF refinement.
  function relaxAtoms(atoms, iters) {
    var out = clone(atoms);
    var n = out.length;
    if (n < 2) return out;
    iters = Math.max(1, Math.min(iters || 40, 200));
    for (var step = 0; step < iters; step++) {
      var disp = new Float64Array(n * 3); // desired displacement, +u = toward the partner
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var dx = out[j].xyz[0] - out[i].xyz[0];
          var dy = out[j].xyz[1] - out[i].xyz[1];
          var dz = out[j].xyz[2] - out[i].xyz[2];
          var r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          var r0 = COV_R[out[i].Z] + COV_R[out[j].Z];
          if (r >= 1.27 * r0) continue; // not bonded: leave non-bonded pairs alone
          var ux = dx / r, uy = dy / r, uz = dz / r;
          var f = r - r0; // r>r0: pull i toward j; r<r0: push i away from j
          disp[i * 3] += f * ux; disp[i * 3 + 1] += f * uy; disp[i * 3 + 2] += f * uz;
          disp[j * 3] -= f * ux; disp[j * 3 + 1] -= f * uy; disp[j * 3 + 2] -= f * uz;
        }
      }
      var maxStep = 0;
      for (i = 0; i < n; i++) {
        var mx = 0.5 * disp[i * 3], my = 0.5 * disp[i * 3 + 1], mz = 0.5 * disp[i * 3 + 2];
        var s = Math.hypot(mx, my, mz);
        if (s > 0.10) { mx *= 0.10 / s; my *= 0.10 / s; mz *= 0.10 / s; s = 0.10; }
        out[i].xyz[0] += mx; out[i].xyz[1] += my; out[i].xyz[2] += mz;
        if (s > maxStep) maxStep = s;
      }
      if (maxStep < 1e-4) break;
    }
    return out;
  }

  // Reject chemically broken geometries: collisions, over-valence, fragments.
  function isPlausible(atoms) {
    var n = atoms.length;
    if (n < 2) return true;
    var adj = atoms.map(function () { return []; });
    var deg = atoms.map(function () { return 0; });
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var d = dist(atoms[i], atoms[j]);
        var r0 = COV_R[atoms[i].Z] + COV_R[atoms[j].Z];
        if (d < 0.62 * r0) return false; // hard clash
        if (d < 1.25 * r0) { adj[i].push(j); adj[j].push(i); deg[i]++; deg[j]++; }
      }
    }
    for (i = 0; i < n; i++) {
      var vm = VMAX[atoms[i].Z];
      if (vm != null && deg[i] > vm) return false;
    }
    // connected? (single fragment)
    var seen = atoms.map(function () { return false; }), q = [0], comp = 0;
    seen[0] = true;
    while (q.length) {
      var v = q.pop(); comp++;
      adj[v].forEach(function (k) { if (!seen[k]) { seen[k] = true; q.push(k); } });
    }
    return comp === n;
  }

  function formula(atoms) {
    var counts = {};
    atoms.forEach(function (a) { counts[a.Z] = (counts[a.Z] || 0) + 1; });
    return Object.keys(counts).map(Number).sort(function (a, b) { return a - b; })
      .map(function (z) { return App.SYMBOLS[z] + (counts[z] > 1 ? counts[z] : ""); }).join("");
  }

  function atomsToXyz(atoms) {
    return atoms.map(function (a) {
      return App.SYMBOLS[a.Z] + " " + a.xyz.map(function (c) { return c.toFixed(4); }).join(" ");
    }).join("\n");
  }

  // Single-site substitutions, round-robin over pool ranks so a hard cap still
  // spreads across many sites. Each survivor is relaxed and validity-checked.
  function genCandidates(seed, opts) {
    opts = opts || {};
    var cap = opts.cap || 20;
    var relaxIters = opts.relaxIters == null ? 40 : opts.relaxIters;
    var maxRank = Math.max(HEAVY_POOL.length, H_POOL.length);
    var out = [], seenKeys = {};
    for (var rank = 0; rank < maxRank && out.length < cap; rank++) {
      for (var site = 0; site < seed.length && out.length < cap; site++) {
        var pool = seed[site].Z === 1 ? H_POOL : HEAVY_POOL;
        if (rank >= pool.length) continue;
        var Z = pool[rank];
        if (Z === seed[site].Z) continue;
        var cand = clone(seed);
        cand[site].Z = Z;
        var relaxed = opts.relax === false ? cand : relaxAtoms(cand, relaxIters);
        if (!isPlausible(relaxed)) continue;
        var f = formula(relaxed);
        var key = f + "|" + site + "|" + Z;
        if (seenKeys[key]) continue;
        seenKeys[key] = 1;
        out.push({
          atoms: relaxed, formula: f, site: site,
          label: App.SYMBOLS[seed[site].Z] + (site + 1) + "\u2192" + App.SYMBOLS[Z]
        });
      }
    }
    return out;
  }

  var SCALE = { dipole: 1.5, gap: 4.0, ip: 4.0 };
  var MISS_PENALTY = 100;

  // Lower score = closer to the targets. null when no target is enabled.
  function score(desc, targets) {
    if (!desc || !targets) return null;
    var s = 0, used = 0;
    function term(on, val, got, scale) {
      if (!on) return;
      used++;
      if (got == null) { s += MISS_PENALTY; return; }
      var z = (got - val) / scale;
      s += z * z;
    }
    term(targets.dipole && targets.dipole.on, targets.dipole && targets.dipole.val, desc.dipoleD, SCALE.dipole);
    term(targets.gap && targets.gap.on, targets.gap && targets.gap.val, desc.gapEv, SCALE.gap);
    term(targets.ip && targets.ip.on, targets.ip && targets.ip.val, desc.ipEv, SCALE.ip);
    if (targets.shell && targets.shell.on) {
      used++;
      var want = targets.shell.val === "open";
      if (desc.openShell !== want) s += 1.0;
    }
    return used ? s : null;
  }

  // Attach scores and return candidates sorted best-first (scorable only).
  function rank(items, targets) {
    var scored = items.map(function (it) {
      return { label: it.label, xyz: it.xyz, desc: it.desc, formula: it.formula, score: score(it.desc, targets) };
    }).filter(function (it) { return it.score != null; });
    scored.sort(function (a, b) { return a.score - b.score; });
    return scored;
  }

  App.finderCore = {
    descriptors: descriptors,
    relaxAtoms: relaxAtoms,
    isPlausible: isPlausible,
    genCandidates: genCandidates,
    atomsToXyz: atomsToXyz,
    formula: formula,
    score: score,
    rank: rank,
    HEAVY_POOL: HEAVY_POOL,
    H_POOL: H_POOL,
    COV_R: COV_R
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
