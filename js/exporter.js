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
  function methodTag(result) {
    return result && result.scf && result.scf.uhf ? "UHF" : "RHF";
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
      provenance: deps.getProvenance ? deps.getProvenance() : undefined,
      properties: result.props,
      fci: scf.fci || undefined
    };
    download(new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }),
      baseName() + "-result.json");
  }

  function buildJournalPack(result, preset, mode, provenance, base) {
    var scf = result.scf;
    var basis = result.basisName || "STO-3G";
    var method = methodTag(result);
    var charge = preset ? preset.charge : 0;
    var molecule = preset ? (preset.formula + " " + presetDisplayName(preset)).trim() : "custom molecule";
    var modeFile = base + "-" + modeTag(mode) + ".png";
    var figurePack = {
      schema: "qfm-figure-pack-v1",
      title: molecule,
      generatedAt: new Date().toISOString(),
      figures: [
        { id: "density-map", file: modeFile, how: "auto-exported on report click" },
        { id: "cube-field", file: base + "-" + modeTag(mode) + ".cube", how: "optional: export with .cube button" },
        { id: "raw-result", file: base + "-result.json", how: "optional: export with JSON button" }
      ]
    };
    var manifest = provenance || {
      schema: "qfm-repro-v1",
      generatedAt: new Date().toISOString(),
      method: method,
      basis: basis,
      charge: charge,
      multiplicity: result.mult,
      source: "browser"
    };
    var virial = scf.ET ? -(scf.EVne + scf.EJ + scf.EK + scf.Enuc) / scf.ET : null;
    var s2Exact = scf.S2exact != null ? scf.S2exact : null;
    var checklist = {
      scfConverged: scf.converged !== false,
      virialNearTwo: virial != null ? Math.abs(virial - 2) < 0.2 : false,
      spinConsistent: !scf.uhf || s2Exact == null || scf.S2 == null ? true : Math.abs(scf.S2 - s2Exact) < 0.35,
      hasRequestKey: !!(manifest && manifest.requestKey)
    };
    manifest.validityChecklist = checklist;
    var reportMd = [
      "# Journal-ready report",
      "",
      "Generated: " + new Date().toISOString(),
      "",
      "## System",
      "- Molecule: " + molecule,
      "- Method/Basis: " + method + "/" + basis,
      "- Charge/Multiplicity: " + charge + " / " + result.mult,
      "",
      "## Key electronic results",
      "- SCF total energy: " + scf.E.toFixed(8) + " Ha",
      "- Iterations: " + scf.iterations,
      "- HOMO energy: " + scf.eps[scf.nocc - 1].toFixed(6) + " Ha",
      "- LUMO energy: " + scf.eps[scf.nocc].toFixed(6) + " Ha",
      "",
      "## Validity checklist",
      "- [" + (checklist.scfConverged ? "x" : " ") + "] SCF converged.",
      "- [" + (checklist.virialNearTwo ? "x" : " ") + "] Virial ratio near 2 (current: " + (virial != null ? virial.toFixed(3) : "n/a") + ").",
      "- [" + (checklist.spinConsistent ? "x" : " ") + "] Spin consistency check passed" +
        (scf.uhf && s2Exact != null ? " (S2=" + scf.S2.toFixed(3) + ", exact=" + s2Exact.toFixed(3) + ")." : "."),
      "- [" + (checklist.hasRequestKey ? "x" : " ") + "] Reproducibility request key present.",
      "- [ ] External benchmark/reference attached manually.",
      "",
      "## Figure pack",
      "- " + modeFile + " (current field snapshot)",
      "- " + base + "-result.json (structured data; optional export)",
      "- " + base + "-" + modeTag(mode) + ".cube (3D field; optional export)",
      "",
      "## Companion files",
      "- " + base + "-methods-appendix.md",
      "- " + base + "-reproducibility-manifest.json",
      "- " + base + "-figure-pack.json"
    ].join("\n");
    var methodsMd = [
      "# Methods appendix",
      "",
      "## Computational setup",
      "- Engine: in-browser JavaScript implementation",
      "- Method: " + method,
      "- Basis set: " + basis,
      "- Coordinates: fixed nuclei (Born-Oppenheimer)",
      "",
      "## Approximations and guardrails",
      "- Hartree-Fock-level electronic structure (RHF/UHF).",
      "- For two-electron cases, full CI is available in the same basis.",
      "- Intended for qualitative trends and rapid hypothesis checks.",
      "",
      "## Reproducibility notes",
      "- Request key: " + ((manifest && manifest.requestKey) || "n/a"),
      "- Source: " + ((manifest && manifest.source) || "browser"),
      "- See reproducibility manifest JSON for structured metadata."
    ].join("\n");
    return { reportMd: reportMd, methodsMd: methodsMd, figurePack: figurePack, manifest: manifest };
  }

  // Journal-ready bundle: one-click text artifacts + current map PNG.
  function report() {
    var result = deps.getResult(), preset = deps.getPreset(), mode = deps.getMode();
    if (!result) return;
    var base = baseName();
    var pack = buildJournalPack(result, preset, mode, deps.getProvenance ? deps.getProvenance() : null, base);
    png(); // figure #1 in the pack: current density/map snapshot
    download(new Blob([pack.reportMd], { type: "text/markdown" }), base + "-journal-report.md");
    download(new Blob([pack.methodsMd], { type: "text/markdown" }), base + "-methods-appendix.md");
    download(new Blob([JSON.stringify(pack.figurePack, null, 1)], { type: "application/json" }), base + "-figure-pack.json");
    download(new Blob([JSON.stringify(pack.manifest, null, 1)], { type: "application/json" }), base + "-reproducibility-manifest.json");
  }

  App.exporter = {
    init: function (d) { deps = d; },
    png: png, cube: cube, json: json, report: report,
    buildJournalPack: buildJournalPack
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
