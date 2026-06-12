// Interactive molecule builder with chain/branch placement, history and
// a cheap local relax pass. Geometry is intentionally rough: "optimize
// geometry" in app.js does the physically meaningful SCF-based refinement.
(function (App) {
  "use strict";

  // covalent radii (Cordero 2008), angstrom, H..Ne; bond if d < 1.25*(r1+r2)
  var COV_R = [0, 0.31, 0.28, 1.28, 0.96, 0.84, 0.76, 0.71, 0.66, 0.57, 0.58];
  // CPK colours
  var CPK = ["", "#dfdfdf", "#d9ffff", "#cc80ff", "#c2ff00", "#ffb5b5",
    "#909090", "#3050f8", "#ff0d0d", "#90e050", "#b3e3f5"];
  var MAX_ATOMS = 30;
  var MAX_HISTORY = 120;

  var atoms = [];   // {Z, xyz: [x,y,z] angstrom}
  var sel = -1;
  var mode = "branch"; // chain: keep growing from the new atom; branch: keep anchor
  var cam = { yaw: 0.5, pitch: 0.25 };
  var canvas = null, onChange = null;
  var past = [], future = [];

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add3(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
  function unit(a) { var n = len3(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
  function cloneAtoms(xs) {
    return xs.map(function (a) { return { Z: a.Z, xyz: a.xyz.slice() }; });
  }
  function snapshot() { return { atoms: cloneAtoms(atoms), sel: sel, mode: mode }; }
  function restore(s) {
    atoms = cloneAtoms(s.atoms);
    sel = s.sel;
    mode = s.mode || mode;
    render();
  }
  function checkpoint() {
    past.push(snapshot());
    if (past.length > MAX_HISTORY) past.shift();
    future = [];
  }
  function bondLim(a, b) { return 1.25 * (COV_R[a.Z] + COV_R[b.Z]); }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function perp(v) {
    return unit(Math.abs(v[0]) < 0.9 ? cross(v, [1, 0, 0]) : cross(v, [0, 1, 0]));
  }

  function neighbors(i) {
    var out = [];
    for (var j = 0; j < atoms.length; j++) {
      if (j === i) continue;
      var lim = bondLim(atoms[i], atoms[j]);
      if (len3(sub(atoms[i].xyz, atoms[j].xyz)) < lim) out.push(j);
    }
    return out;
  }

  // direction for a new bond from anchor a, given its current neighbours
  function newBondDir(a) {
    var nbrs = neighbors(a);
    if (!nbrs.length) return [1, 0, 0];
    var A = atoms[a].xyz;
    if (nbrs.length === 1) {
      // tetrahedral angle off the single existing bond
      var u = unit(sub(atoms[nbrs[0]].xyz, A));
      return unit(add3([-u[0] / 3, -u[1] / 3, -u[2] / 3], perp(u), Math.sqrt(8) / 3));
    }
    var s = [0, 0, 0];
    nbrs.forEach(function (n) { s = add3(s, unit(sub(atoms[n].xyz, A)), 1); });
    var dir = len3(s) > 0.25 ? unit([-s[0], -s[1], -s[2]])
      : perp(unit(sub(atoms[nbrs[0]].xyz, A)));
    if (nbrs.length > 2) return dir; // anti-sum is already out of plane
    // with two bonds, tilt out of their plane: a flat start (NH3) is a saddle
    var n12 = cross(unit(sub(atoms[nbrs[0]].xyz, A)), unit(sub(atoms[nbrs[1]].xyz, A)));
    return unit(add3(dir, len3(n12) > 0.1 ? unit(n12) : perp(dir), 0.35));
  }

  // adds an element bonded to the selected anchor; returns new index or -1
  function addAtom(Z) {
    if (atoms.length >= MAX_ATOMS) return -1;
    checkpoint();
    if (!atoms.length) {
      atoms.push({ Z: Z, xyz: [0, 0, 0] });
      sel = 0;
    } else {
      var a = sel >= 0 ? sel : atoms.length - 1;
      var L = COV_R[Z] + COV_R[atoms[a].Z];
      atoms.push({ Z: Z, xyz: add3(atoms[a].xyz, newBondDir(a), L) });
      sel = mode === "chain" ? atoms.length - 1 : a;
    }
    changed();
    return atoms.length - 1;
  }

  function removeSelected() {
    if (sel < 0) return;
    checkpoint();
    atoms.splice(sel, 1);
    sel = atoms.length ? Math.min(sel, atoms.length - 1) : -1;
    changed();
  }

  function clear() {
    if (!atoms.length) return;
    checkpoint();
    atoms = [];
    sel = -1;
    changed();
  }

  function setAtoms(list, keepSel, opts) {
    opts = opts || {};
    if (opts.history) checkpoint();
    atoms = cloneAtoms(list);
    if (!keepSel || sel >= atoms.length) sel = atoms.length ? 0 : -1;
    if (opts.mode === "chain" || opts.mode === "branch") mode = opts.mode;
    if (opts.resetHistory) { past = []; future = []; }
    if (opts.emit) changed();
    else render();
  }

  function undo() {
    if (!past.length) return false;
    future.push(snapshot());
    restore(past.pop());
    if (onChange) onChange();
    return true;
  }

  function redo() {
    if (!future.length) return false;
    past.push(snapshot());
    restore(future.pop());
    if (onChange) onChange();
    return true;
  }

  function setMode(m) {
    mode = m === "branch" ? "branch" : "chain";
    render();
  }

  function toXyz() {
    return atoms.map(function (a) {
      return App.SYMBOLS[a.Z] + " " + a.xyz.map(function (c) { return c.toFixed(4); }).join(" ");
    }).join("\n");
  }

  // bonds of the selected atom, for the caption: [{label, len}]
  function selectionBonds() {
    if (sel < 0) return null;
    return neighbors(sel).map(function (n) {
      return { label: App.SYMBOLS[atoms[n].Z] + (n + 1),
               len: len3(sub(atoms[sel].xyz, atoms[n].xyz)) };
    });
  }

  // quick local cleanup of obvious clashes/strain; does not use SCF energies
  function quickRelax(iters) {
    if (atoms.length < 2) return { moved: 0, iters: 0 };
    checkpoint();
    iters = Math.max(1, Math.min(iters || 28, 120));
    var start = cloneAtoms(atoms);
    var targetCOM = [0, 0, 0];
    atoms.forEach(function (a) {
      targetCOM[0] += a.xyz[0]; targetCOM[1] += a.xyz[1]; targetCOM[2] += a.xyz[2];
    });
    targetCOM[0] /= atoms.length; targetCOM[1] /= atoms.length; targetCOM[2] /= atoms.length;

    var doneIters = 0;
    for (var step = 0; step < iters; step++) {
      doneIters = step + 1;
      var F = new Float64Array(atoms.length * 3);
      // spring toward covalent lengths for bonded pairs; repel near-collisions
      for (var i = 0; i < atoms.length; i++) {
        for (var j = i + 1; j < atoms.length; j++) {
          var d = sub(atoms[j].xyz, atoms[i].xyz);
          var r = len3(d) || 1e-9;
          var u = [d[0] / r, d[1] / r, d[2] / r];
          var r0 = COV_R[atoms[i].Z] + COV_R[atoms[j].Z];
          var bonded = r < 1.27 * r0;
          var fmag = 0;
          if (bonded) fmag = 0.34 * (r - r0); // Hooke spring
          else if (r < 0.84 * r0) fmag = -0.85 * (0.84 * r0 - r); // soft repulsion
          if (!fmag) continue;
          F[i * 3] += fmag * u[0];     F[i * 3 + 1] += fmag * u[1];     F[i * 3 + 2] += fmag * u[2];
          F[j * 3] -= fmag * u[0];     F[j * 3 + 1] -= fmag * u[1];     F[j * 3 + 2] -= fmag * u[2];
        }
      }

      var maxStep = 0;
      for (i = 0; i < atoms.length; i++) {
        var dx = -0.10 * F[i * 3], dy = -0.10 * F[i * 3 + 1], dz = -0.10 * F[i * 3 + 2];
        var s = Math.hypot(dx, dy, dz);
        if (s > 0.09) { dx *= 0.09 / s; dy *= 0.09 / s; dz *= 0.09 / s; s = 0.09; }
        atoms[i].xyz[0] += dx; atoms[i].xyz[1] += dy; atoms[i].xyz[2] += dz;
        if (s > maxStep) maxStep = s;
      }

      // keep the center fixed so the preview does not drift on screen
      var com = [0, 0, 0];
      atoms.forEach(function (a) {
        com[0] += a.xyz[0]; com[1] += a.xyz[1]; com[2] += a.xyz[2];
      });
      com[0] /= atoms.length; com[1] /= atoms.length; com[2] /= atoms.length;
      var sh = [targetCOM[0] - com[0], targetCOM[1] - com[1], targetCOM[2] - com[2]];
      atoms.forEach(function (a) {
        a.xyz[0] += sh[0]; a.xyz[1] += sh[1]; a.xyz[2] += sh[2];
      });

      if (maxStep < 1e-4) break;
    }

    var moved = 0;
    for (i = 0; i < atoms.length; i++) moved = Math.max(moved, len3(sub(atoms[i].xyz, start[i].xyz)));
    changed();
    return { moved: moved, iters: doneIters };
  }

  function changed() {
    render();
    if (onChange) onChange();
  }

  // ---------- preview rendering (orthographic, orbit by drag) ----------
  function project() {
    var c = [0, 0, 0];
    atoms.forEach(function (a) { c = add3(c, a.xyz, 1 / atoms.length); });
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var maxR = 0.8;
    var pts = atoms.map(function (a) {
      var d = sub(a.xyz, c);
      maxR = Math.max(maxR, len3(d));
      var x = cy * d[0] + sy * d[2], z1 = -sy * d[0] + cy * d[2];
      return [x, cp * d[1] - sp * z1, sp * d[1] + cp * z1];
    });
    var W = canvas.width, H = canvas.height;
    var k = (Math.min(W, H) / 2 - 26) / (maxR + 0.6);
    return pts.map(function (p) {
      return { x: W / 2 + p[0] * k, y: H / 2 - p[1] * k, z: p[2] };
    });
  }

  function render() {
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;
    var C = App.theme.color;
    ctx.fillStyle = C("surface");
    ctx.fillRect(0, 0, W, H);
    // the canvas is ~2x downscaled by CSS, so sizes below are doubled
    if (!atoms.length) {
      ctx.fillStyle = C("chart-axis");
      ctx.font = "22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(App.i18n.t("custom.empty"), W / 2, H / 2);
      ctx.textAlign = "start";
      return;
    }
    var pts = project();
    ctx.strokeStyle = C("chart-axis");
    ctx.lineWidth = 2.6;
    for (var i = 0; i < atoms.length; i++) {
      for (var j = i + 1; j < atoms.length; j++) {
        var lim = 1.25 * (COV_R[atoms[i].Z] + COV_R[atoms[j].Z]);
        if (len3(sub(atoms[i].xyz, atoms[j].xyz)) >= lim) continue;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }
    }
    var order = atoms.map(function (_, k) { return k; })
      .sort(function (a, b) { return pts[a].z - pts[b].z; }); // painter: back first
    ctx.font = "17px system-ui, sans-serif";
    order.forEach(function (k) {
      var r = 8 + COV_R[atoms[k].Z] * 13;
      ctx.beginPath();
      ctx.arc(pts[k].x, pts[k].y, r, 0, 2 * Math.PI);
      ctx.fillStyle = CPK[atoms[k].Z];
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (k === sel) {
        ctx.beginPath();
        ctx.arc(pts[k].x, pts[k].y, r + 5, 0, 2 * Math.PI);
        ctx.strokeStyle = C("curve-calc");
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      ctx.fillStyle = C("chart-fg");
      ctx.fillText(App.SYMBOLS[atoms[k].Z] + (k + 1), pts[k].x + r + 3, pts[k].y - r - 2);
    });
  }

  function pickAt(px, py) {
    if (!atoms.length) return -1;
    var pts = project();
    var best = -1, bd = 28 * 28;
    pts.forEach(function (p, k) {
      var d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  function init(canvasEl, changeCb) {
    canvas = canvasEl;
    onChange = changeCb;
    var down = null, moved = 0;
    var toCanvas = function (e) {
      var r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * canvas.width / r.width,
              (e.clientY - r.top) * canvas.height / r.height];
    };
    canvas.addEventListener("pointerdown", function (e) {
      down = [e.clientX, e.clientY];
      moved = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!down) return;
      moved += Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]);
      cam.yaw += (e.clientX - down[0]) * 0.01;
      cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + (e.clientY - down[1]) * 0.01));
      down = [e.clientX, e.clientY];
      render();
    });
    canvas.addEventListener("pointerup", function (e) {
      if (down && moved < 5) {
        var p = toCanvas(e);
        var hit = pickAt(p[0], p[1]);
        if (hit >= 0) { sel = hit; changed(); }
      }
      down = null;
    });
  }

  App.builder = {
    init: init, render: render, add: addAtom, remove: removeSelected,
    clear: clear, setAtoms: setAtoms, getAtoms: function () { return atoms; },
    toXyz: toXyz, selectionBonds: selectionBonds,
    selected: function () { return sel; },
    mode: function () { return mode; },
    setMode: setMode,
    undo: undo, redo: redo,
    canUndo: function () { return past.length > 0; },
    canRedo: function () { return future.length > 0; },
    relax: quickRelax,
    COV_R: COV_R
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
