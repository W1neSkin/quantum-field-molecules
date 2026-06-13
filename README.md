# quantum-field-molecules

**Live: <https://w1neskin.github.io/quantum-field-molecules/>**

Interactive visualization of molecules "through the eyes of quantum field
theory": electron field density ⟨n̂(x)⟩, molecular orbitals (field modes),
an energy budget with the exchange component singled out, bond curves E(R),
IR spectra and an exchange diagram. The interface is available in five
languages (EN/RU/DE/ES/ZH) with built-in help, a wiki-style glossary and
dark/light themes.

The key point: **there is no precomputed molecule database** - the electronic
structure is computed on the fly by a real Hartree–Fock method (RHF and UHF;
STO-3G, 6-31G, 6-31G* basis sets) implemented in pure JavaScript. Presets are
just ready-made geometries with extra facts and spectroscopic curves.

## Running

No dependencies. Two ways:

```bash
# any static server (recommended: computation runs in a Web Worker)
python3 -m http.server 8000
# open http://localhost:8000
```

or simply open `index.html` with a double click - then the computation runs on
the main thread (the UI may stutter on heavy molecules like benzene).

## Features

### Computational methods

- **RHF** for closed shells, **UHF** for open shells (O₂, NO, OH, CH₃ and
  any custom molecule with an odd electron count): separate α/β orbitals,
  spin density, ⟨S²⟩ with spin contamination.
- **FCI for two-electron systems** (H₂, HeH⁺, etc.) - the exact solution in
  the chosen basis: correlation energy and correct dissociation on the E(R)
  curve.
- **STO-3G / 6-31G / 6-31G\* basis sets** (selector in the header): Basis Set
  Exchange data, d functions (6 Cartesian components) for 6-31G*.
- **Geometry optimization**: BFGS over numerical gradients (up to 10 atoms);
  the optimized coordinates are inserted into the "custom molecule" field.
- **Vibrational analysis**: numerical Hessian, projection of translations and
  rotations, harmonic frequencies, relative IR intensities |∂μ/∂Q|², spectrum
  with Lorentzian broadening; clicking a mode draws nuclear displacement
  arrows on the map. Imaginary frequencies are flagged as a saddle point
  (up to 6 atoms).

### Properties

- Dipole moment (compared with experiment in the presets).
- Koopmans ionization potential (−ε HOMO/SOMO) versus experiment.
- Mayer bond orders, Mulliken charges, spin populations.
- Virial ratio −V/T as a live sanity check of the calculation.

### Visualization

- Map modes: total density, deformation Δρ (STO-3G only), electrostatic
  potential φ(r) (a reactivity map), ELF (electron localization function:
  bonds, lone pairs and shells as bright basins), Laplacian ∇²ρ (QTAIM charge
  concentration/depletion), spin density ρₛ (UHF), amplitude of any MO with
  its sign.
- Electric field arrows E = −∇φ over the ESP map (toggleable): the direction
  a positive test charge would be pushed.
- **Boys localization** (the "Boys orbitals" checkbox): occupied MOs are
  rotated into "bonds", "lone pairs" and "cores" - the very objects from a
  chemistry classroom, with automatic labels (bond O1–H2, lone pair O1,
  core O1).
- 3D view (WebGL2 raymarching, 64³ grid): the molecule as a glowing field
  cloud - density encoding is capped at the valence scale, so bonding clouds
  stay visible next to heavy-atom cores. MO modes are two-colored by the sign
  of ψ and animated as the physical standing wave Re ψ·e^(−iεt/ħ) (slowed by
  ~10¹⁵, toggleable). The classical scaffold - nucleus dots, bond sticks, the
  volume frame - is an opt-in overlay, off by default; only element labels
  remain for orientation.
- R slider for diatomics: an E(R) scan in the background, the map follows the
  slider; the chart shows the RHF/UHF curve, the FCI curve (for 2e⁻) and the
  experimental Morse potential with its exact vibrational levels Eᵥ and
  nuclear wavefunctions χᵥ(R) - quantized bond motion, zero-point smearing
  included.
- MO level diagram: two columns for UHF (α↑ and β↓), the SOMO is highlighted.

### Export

- **PNG** - snapshot of the current view (2D or 3D).
- **.cube** - the current field in Gaussian cube format (opens in VMD,
  Avogadro, Multiwfn).
- **JSON** - energies, orbitals, properties, FCI - everything for further
  processing.

### Interface

- **Five languages**: English, Russian (complete, including molecule facts,
  help and glossary), German, Spanish and Simplified Chinese (UI; long-form
  texts fall back to English). The language is detected from the browser, can
  be switched with the selector and is remembered; `?lang=ru` (de/es/zh) in
  the URL makes language variants directly linkable. Engine errors are
  localized right in the worker.
- **Help and wiki glossary**: a modal window (the "Help" button or the "?" in
  each panel header) with three tabs - a guide to the main features
  (13 sections, including "Fields: what exists and what is drawn"), a glossary
  of ~30 terms with search (Hartree–Fock, basis set, ESP, ELF, the Laplacian,
  Koopmans, correlation, Hessian, the QFT view, etc.) and "About".
- **Dark and light themes**: a toggle in the header, starts from
  prefers-color-scheme, remembered. Everything is repainted, including the
  canvas LUT density maps and the SVG charts.

### Other

- Molecule builder (large modal editor): chain/branch placement modes,
  click-to-add atoms with covalent-radii bond lengths and VSEPR-like
  directions, undo/redo history, quick-relax cleanup, live geometry warnings
  (too-close atoms, disconnected fragments, obvious valence overflow), synced
  "XYZ text" tab with as-you-type validation for pasted geometries, apply /
  apply+compute flow. H–Ne, up to 30 atoms (up to 90 basis functions for
  6-31G*).
- Result cache in IndexedDB: reopening is instant
  (scans, optimizations and Hessians are cached too).

## Architecture

```
UI (app.js, heatmap.js, grid3d.js + view3d.js, molevels.js, energy.js, irchart.js, diagrams.js)
  + i18n.js + lang/{en,ru,de,es,zh}.js (+ *-content.js), theme.js, help.js
  └─ compute client (client.js): cache + transport (+ request language)
       └─ Web Worker (worker.js) | main thread (file://)
            └─ engine: basis.js → integrals.js + eri.js → scf.js | uhf.js
                       → props.js, fci2.js, optimize.js, vib.js (engine.js)
```

i18n: dictionaries are flat keys in `App.I18N[lang]` with `{x}` interpolation
and English fallback; static HTML is marked up with `data-i18n` attributes,
dynamic panels re-render on the language-change event. The worker imports the
same dictionaries and receives the active language with every request, so
engine error messages arrive already localized. Preset names and facts live in
`geometries.js` as `{en, ru, ...}` objects. Themes are CSS custom properties
(`:root` / `[data-theme="light"]`); canvas/SVG renderers take colors via
`App.theme.color()` and repaint on the theme-change event.

3D: `grid3d.js` samples the field into a 64³ grid (frame by frame, without
blocking the UI) and encodes it sqrt-compressed with a valence-scale cap for
total density; `view3d.js` is a WebGL2 raycaster (emission–absorption,
front-to-back) with an orbit camera and a requestAnimationFrame phase loop
for MO modes. No WebGL2 - the 3D button simply is not shown.

The client → worker boundary is an asynchronous request/response, i.e. a
ready-made contract for a server-side backend (PySCF and the like) if one is
ever needed.

### Engine (js/)

| File | Contents |
|------|----------|
| `basis.js` | STO-3G for H–Ne, Cartesian s/p/d shells, contraction normalization |
| `basis631.js` | 6-31G and 6-31G* (Basis Set Exchange data) |
| `integrals.js` | McMurchie–Davidson scheme: S, T, V; Boys function |
| `eri.js` | Two-electron integrals, 8-fold symmetry, Schwarz screening |
| `linalg.js` | Jacobi diagonalization, S^(−1/2), DIIS solver |
| `scf.js` | RHF: GWH guess, damping, DIIS, Mulliken charges |
| `uhf.js` | UHF: α/β Fock matrices, ⟨S²⟩, spin populations |
| `props.js` | Dipole integrals and moment, Mayer bond orders |
| `fci2.js` | FCI for 2e⁻: AO→MO transformation, CI matrix of singlet CSFs |
| `localize.js` | Foster–Boys localization: Jacobi rotations, LMO labels |
| `optimize.js` | Numerical gradients + BFGS, emits the optimized XYZ |
| `vib.js` | Numerical Hessian, frequencies, IR intensities |
| `esp.js` | Electrostatic potential on a slice (reuses ERI pairs) |
| `fields2d.js` | ELF and ∇²ρ on a slice: density-matrix contraction of basis values, gradients and Laplacians |
| `builder.js` | Click-to-build molecule editor: VSEPR-like atom placement, skeleton preview |
| `engine.js` | XYZ parser and the computation pipeline |
| `i18n.js` + `lang/` | EN/RU/DE/ES/ZH dictionaries, `t()` with interpolation, `data-i18n` DOM markup |
| `theme.js` | Dark/light themes, CSS variable access for canvas/SVG |
| `help.js` | Help modal: guide, searchable glossary, "about" |

## Verification

```bash
npm test
# or
node test/selfcheck.js
```

39 checks against literature values (excerpt):

| What | Reference | Source |
|------|-----------|--------|
| H₂, H₂O, CH₄, N₂, C₆H₆ (RHF/STO-3G) | −1.1167 … −227.89 a.u. | Szabo & Ostlund; CCCBDB |
| H₂O dipole | 1.71 D | CCCBDB HF/STO-3G |
| Mayer bond orders H₂ / N₂ | 1.00 / 3.00 | by definition |
| FCI H₂: correlation and dissociation | −0.0206 a.u.; 2×E(H) | Szabo & Ostlund |
| UHF: H atom, O₂ triplet ⟨S²⟩ | −0.46658; 2.00 | analytic |
| H and He in 6-31G | −0.498233; −2.855160 | literature |
| Variational ordering of bases | STO-3G > 6-31G > 6-31G* | principle |
| Boys localization (H₂O) | core + 2 lone pairs + 2 bonds | density invariants |
| H₂ optimum | R = 0.7122 Å | CCCBDB HF/STO-3G |
| H₂ / H₂O frequencies | 5482 / 2170, 4140, 4391 cm⁻¹ | CCCBDB HF/STO-3G |

The same self-check is run automatically on every push/PR via
`.github/workflows/selfcheck.yml`.

## Physical caveats

- Hartree–Fock in small basis sets is a qualitative picture, not quantitative
  chemistry: frequencies are overestimated by ~10%, 6-31G dipoles are
  overestimated.
- Preset E(R) curves are Morse potentials built from spectroscopic constants
  (Huber & Herzberg); RHF dissociation is qualitatively wrong at large R
  (the FCI curve for 2e⁻ and UHF fix this - visible right on the chart).
- Δρ is built relative to a promolecule of spherically averaged atoms and is
  defined only in STO-3G.
- Compute vibrations at the optimized geometry - otherwise expect imaginary
  frequencies and shifted values (the app warns about this honestly).

## Deployment

Static files with no build step: GitHub Pages / Cloudflare Pages work fine -
just serve the repository root.
