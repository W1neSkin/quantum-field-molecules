// Export of the current state: PNG snapshot, Gaussian .cube of the current
// field (opens in VMD/Avogadro/Multiwfn), JSON with energies and orbitals.
(function (App) {
  "use strict";

  var deps = null; // injected by app.init

  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function baseName() {
    var p = deps.getPreset();
    return (p ? p.id : "custom").replace(/[^\w]/g, "");
  }
  function modeTag(mode) {
    if (mode.kind === "mo") return "mo" + (mode.mo + 1) + (mode.spin === "b" ? "b" : "");
    return { total: "density", diff: "deformation", spin: "spindensity" }[mode.kind] || mode.kind;
  }

  function presetDisplayName(preset) {
    if (!preset) return "";
    var name = preset.name || {};
    return name[App.LANG] || name.en || "";
  }

  function png() {
    var canvas = deps.getView() === "3d" ? deps.getCanvasGl() : deps.getCanvas2d();
    if (deps.getView() === "3d") App.view3d.render(); // fresh frame in this task
    canvas.toBlob(function (b) {
      if (b) download(b, baseName() + "-" + modeTag(deps.getMode()) + ".png");
    });
  }

  // Gaussian cube: x outer / z inner loop, atomic units, 6 values per line.
  // To keep the UI responsive, both field prep and file text assembly run in chunks.
  function cube() {
    var result = deps.getResult();
    var mode = deps.getMode();
    // ESP/ELF/Laplacian exist on the slice only; export the density instead
    if (mode.kind === "esp" || mode.kind === "elf" || mode.kind === "lap") mode = { kind: "total" };
    deps.ensurePrep3d(function (prep) {
      var N = App.grid3d.N;
      var b = prep.bounds;
      var step = 2 * b.half / (N - 1);
      var o = [b.center[0] - b.half, b.center[1] - b.half, b.center[2] - b.half];
      var isMo = mode.kind === "mo";
      var f6 = function (x) { return ("            " + x.toFixed(6)).slice(-12); };

      var lines = [
        "quantum-field-molecules: " + (deps.getPreset()
          ? deps.getPreset().formula + " " + presetDisplayName(deps.getPreset())
          : "custom molecule"),
        "field: " + modeTag(mode) + " (RHF/UHF STO-3G, computed in browser)",
        ("     " + (isMo ? -result.atoms.length : result.atoms.length)).slice(-5) + f6(o[0]) + f6(o[1]) + f6(o[2]),
        ("     " + N).slice(-5) + f6(step) + f6(0) + f6(0),
        ("     " + N).slice(-5) + f6(0) + f6(step) + f6(0),
        ("     " + N).slice(-5) + f6(0) + f6(0) + f6(step)
      ];
      result.atoms.forEach(function (a) {
        lines.push(("     " + a.Z).slice(-5) + f6(a.Z) + f6(a.xyz[0]) + f6(a.xyz[1]) + f6(a.xyz[2]));
      });
      if (isMo) lines.push("    1  " + (mode.mo + 1));
      var runField = App.grid3d.fieldFloatAsync || function (prepArg, modeArg, onProgress, done) {
        if (onProgress) onProgress(1);
        done(App.grid3d.fieldFloat(prepArg, modeArg));
      };
      runField(prep, mode, null, function (field) {
        var parts = [lines.join("\n"), "\n"];
        var x = 0;
        var X_CHUNK = 2;
        function appendChunkedText() {
          var chunk = [];
          var xStop = Math.min(N, x + X_CHUNK);
          for (; x < xStop; x++) {
            for (var y = 0; y < N; y++) {
              var row = [];
              for (var z = 0; z < N; z++) {
                row.push(field[(z * N + y) * N + x].toExponential(5).replace("e", "E"));
                if (row.length === 6 || z === N - 1) { chunk.push(row.join("  ")); row = []; }
              }
            }
          }
          if (chunk.length) parts.push(chunk.join("\n"), "\n");
          if (x < N) { setTimeout(appendChunkedText, 0); return; }
          download(new Blob(parts, { type: "text/plain" }), baseName() + "-" + modeTag(mode) + ".cube");
        }
        appendChunkedText();
      });
    });
  }

  function json() {
    var result = deps.getResult(), preset = deps.getPreset();
    var scf = result.scf;
    var BOHR = 1 / App.engine.ANGSTROM_TO_BOHR;
    var payload = {
      source: "quantum-field-molecules (browser RHF/UHF)",
      molecule: preset ? preset.formula + " " + presetDisplayName(preset) : "custom",
      charge: preset ? preset.charge : undefined,
      mult: result.mult,
      basis: result.basisName || "STO-3G",
      atoms: result.atoms.map(function (a) {
        return { symbol: App.SYMBOLS[a.Z], Z: a.Z, xyz_angstrom: a.xyz.map(function (c) { return c * BOHR; }) };
      }),
      basisLabels: result.basis.map(function (f) { return f.label; }),
      energy_hartree: {
        total: scf.E, electronic: scf.Eelec, nuclear: scf.Enuc,
        kinetic: scf.ET, vne: scf.EVne, coulomb: scf.EJ, exchange: scf.EK
      },
      iterations: scf.iterations,
      eps_hartree: scf.eps, epsB_hartree: scf.epsB,
      nocc: scf.nocc, noccB: scf.noccB,
      C: scf.C, CB: scf.CB,
      mulliken: scf.mulliken, spinPop: scf.spinPop, S2: scf.S2,
      properties: result.props,
      fci: scf.fci || undefined
    };
    download(new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }),
      baseName() + "-result.json");
  }

  App.exporter = {
    init: function (d) { deps = d; },
    png: png, cube: cube, json: json
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
