// English long-form content: user guide, glossary (wiki), about.
// Plain text; blank line = paragraph break. Rendered by js/help.js.
(function (App) {
  "use strict";
  App.I18N = App.I18N || {};
  var d = App.I18N.en = App.I18N.en || {};

  d.helpSections = [
    {
      id: "quickstart", title: "Getting started",
      body: "Pick a molecule from the selector in the top bar. The application solves the Hartree\u2013Fock equations for it directly in your browser and shows: a map of the electron density (left), the orbital energy diagram and the energy budget (right), and additional panels below.\n\nThe status indicator next to the selector reports progress: integral evaluation, SCF iterations, map rendering. Small systems take a fraction of a second; benzene takes about 15 seconds. Results are cached - repeating a calculation is instant."
    },
    {
      id: "presets", title: "Building your own molecules",
      body: "Choose \u201cbuild your own molecule\u201d at the end of the list. The builder works by clicks: an element button adds an atom bonded to the selected (highlighted) atom, with the bond length taken from covalent radii and the direction chosen by valence-geometry rules. Click an atom in the preview to make it the new anchor; drag to rotate. Water is three clicks: O, H, H. The placement is deliberately rough - press \u201cCompute\u201d and then \u201coptimize geometry\u201d, and BFGS relaxes the structure to the nearest energy minimum.\n\nThe \u201cXYZ text\u201d tab shows the same molecule as editable text: one atom per line, an element symbol and three Cartesian coordinates in angstroms. Text and builder stay in sync, errors are reported as you type, and a standard XYZ file header (atom count plus comment) is accepted - so you can paste geometries from the literature. \u201cCopy current molecule\u201d pulls whatever is shown on the map into the editor, e.g. a preset to modify. Elements H through Ne, up to 30 atoms (up to 90 basis functions).\n\nThe charge field shifts the electron count: +1 removes one electron, \u22121 adds one. Systems with an odd number of electrons are computed automatically as spin doublets with the UHF method."
    },
    {
      id: "map", title: "Reading the density map",
      body: "The map shows a planar slice of a field through the molecule; the slice plane is chosen from the first three non-collinear atoms. Circles mark the nuclei, the segment at the bottom left is the 1 \u00c5 scale bar.\n\n\u03c1 - total electron density: the observable \u27e8n\u0302(x)\u27e9, bright regions hold more charge. \u0394\u03c1 - deformation density: the difference between the molecular density and superposed free atoms; orange marks density gained on bond formation (available in the STO-3G basis). \u03c6 - electrostatic potential: orange regions (\u03c6 < 0) attract electrophiles; a reactivity map. \u03c1\u209b - spin density (open shells only): the distribution of unpaired electrons.\n\nMO buttons (HOMO, LUMO and levels picked in the diagram) display the amplitude of one orbital with its sign: orange positive, blue negative. If an orbital\u2019s nodal plane coincides with the slice, the application automatically shows a parallel slice 0.5 \u00c5 above and says so in the caption."
    },
    {
      id: "view3d", title: "3D view",
      body: "The 3D button switches the density panel to volume rendering: the field is shown as a glowing cloud, signed fields (orbitals) in two colors. Drag to rotate, use the mouse wheel to zoom.\n\nFor orientation the view draws bond sticks between nearby nuclei, element labels and a bounding box with axes. The electrostatic potential is available only in the 2D view. Building the 3D grid takes a moment on first use; volumes are cached per mode."
    },
    {
      id: "levels", title: "MO level diagram",
      body: "Each horizontal line is one molecular orbital (a field mode) at its energy \u03b5 in electronvolts. Solid lines with arrows are occupied; dashed lines are virtual (empty). Deep core levels (1s of heavy atoms) are collapsed into a note at the bottom.\n\nClick any level to display that orbital on the map. For open-shell systems (UHF) there are two columns: \u03b1 (\u2191) and \u03b2 (\u2193) spin orbitals; the singly occupied level is labeled SOMO. Nearly degenerate levels are drawn side by side - degeneracy reflects molecular symmetry."
    },
    {
      id: "budget", title: "Energy budget and properties",
      body: "The budget decomposes the total energy E (in hartree) into physically distinct parts: kinetic energy T, electron\u2013nucleus attraction V, the classical Coulomb repulsion of the electron cloud J, the exchange term K (a purely quantum consequence of the field\u2019s anticommutation - the Pauli principle), and the internuclear repulsion. The virial ratio \u2212V/T must equal 2 for an exact wavefunction at equilibrium; deviations indicate basis-set strain or a non-equilibrium geometry.\n\nBelow are properties: the dipole moment |\u03bc| in debye, the Koopmans ionization potential (\u2212\u03b5 of the highest occupied orbital, compared with experiment where available), Mulliken atomic charges and Mayer bond orders. For two-electron systems the exact full-CI energy and the correlation energy are listed as well.\n\nAll comparisons with experiment cite vertical ionization potentials and equilibrium dipoles from standard compilations (NIST, CCCBDB)."
    },
    {
      id: "rscan", title: "The E(R) bond curve",
      body: "For diatomic presets the application scans the bond length R: it repeats the full SCF calculation at \u224836 distances and plots the resulting curve next to the experimental Morse potential built from spectroscopic constants (Huber & Herzberg). The minima are aligned at \u2212D\u2091 so the shapes can be compared.\n\nMove the slider - the density map follows the selected geometry, letting you watch the bond form and break. For H\u2082 and HeH\u207a the green curve shows the exact (full CI) solution in the same basis: unlike RHF it dissociates correctly to two neutral atoms. This is the cleanest illustration of electron correlation available in this tool."
    },
    {
      id: "basis", title: "Choosing a basis set",
      body: "The basis selector offers STO-3G (minimal: one contracted function per occupied atomic shell), 6-31G (split valence: two sizes per valence shell, giving the field room to breathe), and 6-31G* (adds d polarization functions on heavy atoms, letting density shift off atomic axes).\n\nLarger bases lower the energy variationally and improve dipoles and geometries, at a higher computational cost. The deformation density \u0394\u03c1 is available only in STO-3G, where the reference promolecule is tabulated. Energies from different bases must not be compared with each other - only within one basis."
    },
    {
      id: "boys", title: "Boys localized orbitals",
      body: "Canonical molecular orbitals are delocalized over the whole molecule, which often hides the chemistry. The \u201cBoys orbitals\u201d toggle applies the Foster\u2013Boys procedure: a unitary rotation of the occupied orbitals that minimizes their spatial extent. The total density and energy are strictly unchanged.\n\nThe result is the textbook picture: two-center bond orbitals (labeled \u201cbond X\u2013Y\u201d), lone pairs, and atomic cores. Orbital energies are not defined for localized orbitals, so the level diagram keeps showing canonical levels. Available for closed-shell (RHF) calculations."
    },
    {
      id: "optvib", title: "Optimization and vibrations",
      body: "\u201cOptimize geometry\u201d relaxes the nuclei to the nearest minimum of the energy surface using the BFGS method with numerical gradients (up to 10 atoms). The optimized coordinates are written into the XYZ editor, so you can copy them. The status line then shows how many steps were taken and the energy gain.\n\n\u201cCompute vibrations\u201d builds the numerical Hessian (second derivatives of the energy), mass-weights it, projects out translations and rotations and diagonalizes it (up to 6 atoms). The result is the set of normal modes: harmonic frequencies in cm\u207b\u00b9 with IR intensities, drawn as a stick spectrum with a Lorentzian envelope. Click a mode - displacement arrows appear on the density map. An imaginary frequency (red dashed) means the geometry is a saddle point, not a minimum: optimize first.\n\nNote that Hartree\u2013Fock systematically overestimates harmonic frequencies by roughly 10%; published work scales them by \u22480.89\u20130.91."
    },
    {
      id: "export", title: "Export and caching",
      body: "PNG saves a snapshot of the current map or 3D view. The .cube button writes the current field (density, \u0394\u03c1, spin density or a selected orbital) as a Gaussian cube file on a 64\u00b3 grid - the standard volumetric format read by VMD, Avogadro, Multiwfn and others. JSON exports energies, orbital coefficients, charges and properties for further analysis.\n\nEvery completed calculation (including R-scans, optimizations and Hessians) is cached in the browser\u2019s IndexedDB: repeating it is instantaneous, and previously visited molecules work offline. The cache is keyed by geometry, charge, multiplicity and basis."
    },
    {
      id: "qft", title: "The QFT viewpoint",
      body: "The application narrates ordinary quantum chemistry in the language of quantum field theory - the two descriptions are mathematically equivalent. The molecule is a stationary bound state of the electron field; molecular orbitals are the modes of that field; the occupation of a mode is the number of field quanta (electrons) in it.\n\nThe map shows the expectation value of the density operator \u03c8\u0302\u2020(x)\u03c8\u0302(x). The exchange energy K - and with it the entire Pauli principle - follows from the anticommutation of fermionic field operators. The Coulomb attraction and repulsion are, in QED, the static limit of virtual-photon exchange between charges (the diagram in the corner panel counts those channels). What this tool does not include are radiative corrections proper - the Lamb shift, vacuum polarization - which for chemistry are negligible (\u224810\u207b\u2077 of the energy) but measurable in precision spectroscopy of H\u2082."
    },
    {
      id: "fields", title: "Fields: what exists and what is drawn",
      body: "In quantum field theory the primary objects are not particles but fields filling all of space; every particle is a quantum (a stable excitation) of its field. The Standard Model counts about seventeen: the matter fields - the electron field with its two heavy copies (muon, tau), three neutrino fields and six quark fields - and the force carriers: the electromagnetic (photon), gluon, weak W/Z and Higgs fields, plus gravity outside the model.\n\nChemistry needs exactly two of them. Quarks and gluons are confined inside nuclei, where the energy scale is a million times the chemical one, so a nucleus enters as a point charge (the crosses on the map). Weak-field effects in molecules are ~15 orders of magnitude below bond energies; the Higgs field is a constant background whose only chemical job is the electron mass; gravity between an electron and a nucleus is ~39 orders weaker than their electric attraction. What remains is the electron field - the protagonist - bound by the static part of the electromagnetic field.\n\nMost map modes display observables of the electron field: the density \u03c1, the deformation density \u0394\u03c1, the spin density, individual modes (MO/LMO), ELF and the Laplacian \u2207\u00b2\u03c1. The electromagnetic field appears as the electrostatic potential \u03c6 with its field arrows E = \u2212\u2207\u03c6, and through the IR intensities (how strongly a vibration shakes the dipole and couples to light). The nuclei are clamped classical points (Born\u2013Oppenheimer), but their quantum nature is restored in two places: the harmonic analysis with zero-point energy, and the vibrational wavefunctions \u03c7\u1d65(R) drawn inside the Morse well of the E(R) chart.\n\nSome fields honestly cannot be drawn: the electron current density vanishes in a stationary ground state without a magnetic field; the magnetic field of a closed-shell molecule is zero (for open shells the spin density plays that role); quark, weak, Higgs and gravitational contributions are constants or negligibly small at this scale."
    }
  ];

  d.glossary = [
    { id: "hf", term: "Hartree\u2013Fock method",
      body: "The basic ab initio method of quantum chemistry: each electron moves in the mean field of all the others. The many-electron wavefunction is a single Slater determinant - an antisymmetrized product of orbitals. It captures \u224899% of the total energy; the missing part is the correlation energy. Reference: Szabo & Ostlund, \u201cModern Quantum Chemistry\u201d." },
    { id: "scf", term: "SCF (self-consistent field)",
      body: "The iterative solution of the Hartree\u2013Fock equations: orbitals define the mean field, the field redefines the orbitals, until self-consistency. The status line shows the iteration count; convergence is accelerated here by the DIIS method." },
    { id: "basis-set", term: "Basis set",
      body: "A finite set of atom-centered Gaussian functions in which orbitals are expanded. The basis truncates the Hilbert space of the field: the larger the basis, the lower (variationally) the energy. This application offers STO-3G, 6-31G and 6-31G*." },
    { id: "sto3g", term: "STO-3G",
      body: "A minimal basis: one contracted function (of three Gaussians) per occupied atomic shell. Fast and qualitatively reasonable, but stiff - dipoles and energetics carry large errors. A standard teaching basis." },
    { id: "631g", term: "6-31G and 6-31G*",
      body: "Split-valence bases: each valence shell is described by two functions of different size, so the field can expand or contract per molecule. The asterisk adds d polarization functions on non-hydrogen atoms, letting density bend away from atomic axes - important for accurate geometries and dipoles." },
    { id: "mo", term: "Molecular orbital (MO)",
      body: "A one-electron wavefunction spread over the molecule; in field language, a mode of the electron field. Each MO holds at most two electrons (one per spin projection). Canonical MOs have a defined orbital energy \u03b5." },
    { id: "homo", term: "HOMO / LUMO / SOMO",
      body: "Highest occupied, lowest unoccupied, and singly occupied molecular orbitals. The HOMO\u2013LUMO pair governs chemical reactivity (frontier-orbital theory); the SOMO appears in open-shell systems (radicals) and carries the unpaired spin." },
    { id: "density", term: "Electron density \u03c1(r)",
      body: "The expectation value of the density operator \u27e8\u03c8\u0302\u2020(r)\u03c8\u0302(r)\u27e9: the average number of electrons per unit volume. An observable, measurable by X-ray diffraction. Integrates to the electron count." },
    { id: "defdensity", term: "Deformation density \u0394\u03c1",
      body: "The molecular density minus the superposition of spherically averaged free atoms (the promolecule). Positive regions (orange) show where density accumulated on bonding - typically the bond midpoints and lone pairs; negative regions show depletion." },
    { id: "spindensity", term: "Spin density \u03c1\u209b",
      body: "The difference \u03c1\u2191 \u2212 \u03c1\u2193 between the densities of the two spin projections. Nonzero only for open shells; shows where unpaired electrons reside. Its integral equals N\u2191 \u2212 N\u2193 (twice the spin projection)." },
    { id: "esp", term: "Electrostatic potential (ESP)",
      body: "The potential \u03c6(r) felt by a unit positive test charge: nuclear contributions minus the electron cloud. Negative regions attract electrophiles, positive regions attract nucleophiles - a standard map of reactive sites used across medicinal and materials chemistry." },
    { id: "elf", term: "ELF (electron localization function)",
      body: "A measure (Becke & Edgecombe, 1990) of how strongly electrons are localized in pairs, built from the kinetic energy density: the smaller the excess of local kinetic energy over the Weizs\u00e4cker bound, the harder it is for a same-spin electron to be nearby. ELF = 1 marks a perfectly localized pair (a bond, a lone pair, an atomic shell), 0.5 corresponds to a homogeneous electron gas. Unlike the density itself, ELF separates shells and makes lone pairs visible as distinct bright islands." },
    { id: "laplacian", term: "Laplacian of the density \u2207\u00b2\u03c1",
      body: "The second derivative of the electron density, central to Bader\u2019s QTAIM theory. Where \u2207\u00b2\u03c1 < 0 charge is locally concentrated - covalent bonds, lone pairs and atomic shells; where \u2207\u00b2\u03c1 > 0 it is depleted, as in ionic or closed-shell contacts. The alternation of its sign reveals the shell structure of atoms that the smooth density itself hides. On the map, orange marks concentration and blue depletion; the colour scale excludes the singular spikes at the nuclei." },
    { id: "mulliken", term: "Mulliken charges",
      body: "A partitioning of the electron density among atoms based on basis-function ownership. Simple and instructive but basis-dependent; trends are meaningful, absolute values are not. Reported in the properties panel." },
    { id: "mayer", term: "Mayer bond order",
      body: "A quantum-mechanical generalization of the classical bond multiplicity, computed from the density and overlap matrices. Reproduces intuition: \u22481 for H\u2082, \u22483 for N\u2082, \u22481.45 for the aromatic C\u2013C in benzene, \u22480 for unbound He\u2082." },
    { id: "koopmans", term: "Koopmans\u2019 theorem",
      body: "In Hartree\u2013Fock, the energy needed to remove an electron from an orbital approximately equals \u2212\u03b5 of that orbital (frozen-orbital approximation). It gives quick estimates of the ionization potential, usually accurate to \u223c1 eV thanks to error cancellation." },
    { id: "dipole", term: "Dipole moment",
      body: "The first moment of the molecular charge distribution; measured in debye (D). Determines rotational spectra, dielectric behaviour and intermolecular forces. Computed from the density and nuclear charges; compared with experimental values in the properties panel." },
    { id: "fci", term: "Full CI (full configuration interaction)",
      body: "The exact solution of the electronic Schr\u00f6dinger equation within a given basis: the wavefunction is expanded over all possible determinants. Its cost grows factorially, so it is feasible only for tiny systems - here it is solved for two-electron molecules (H\u2082, HeH\u207a)." },
    { id: "correlation", term: "Correlation energy",
      body: "The difference between the exact (full CI) and Hartree\u2013Fock energies in the same basis: the part of the interaction the mean field cannot capture, by Lowdin's definition. Small in absolute terms (\u22481% of E) but decisive for bond breaking: RHF dissociates H\u2082 incorrectly, full CI repairs it." },
    { id: "rhf-uhf", term: "RHF / UHF",
      body: "Restricted HF: each spatial orbital holds an \u2191\u2193 pair - correct for closed shells. Unrestricted HF: \u03b1 and \u03b2 electrons get independent orbitals - needed for radicals and triplets (O\u2082, NO, OH). The price of UHF is spin contamination, monitored via \u27e8S\u00b2\u27e9." },
    { id: "s2", term: "\u27e8S\u00b2\u27e9 and spin contamination",
      body: "The expectation value of the total spin squared. For a pure doublet it is 0.75, for a triplet 2.0. A UHF value above the exact one means the determinant mixes higher spin states - spin contamination; a small excess is acceptable, a large one signals an unreliable wavefunction." },
    { id: "boys", term: "Boys localization",
      body: "A unitary rotation of the occupied orbitals minimizing their spatial spread (Foster & Boys, 1960). Converts delocalized canonical MOs into chemical objects - two-center bonds, lone pairs, cores - without changing the density or the energy." },
    { id: "geomopt", term: "Geometry optimization",
      body: "The search for nuclear positions minimizing the total energy, here by the BFGS quasi-Newton method with numerical gradients. The result approximates the equilibrium structure; its quality is limited by the basis (STO-3G bond lengths carry a few percent error)." },
    { id: "hessian", term: "Hessian and normal modes",
      body: "The matrix of second derivatives of the energy with respect to nuclear coordinates. Mass-weighted and diagonalized, it yields normal modes - independent collective vibrations - and their harmonic frequencies. Negative eigenvalues (imaginary frequencies) flag saddle points." },
    { id: "ir", term: "IR intensity",
      body: "The strength of infrared absorption by a vibrational mode, proportional to |\u2202\u03bc/\u2202Q|\u00b2 - the squared derivative of the dipole moment along the mode. Modes that do not change the dipole (e.g. the symmetric stretch of CO\u2082) are IR-inactive." },
    { id: "morse", term: "Morse potential",
      body: "A classic analytic model of a diatomic bond curve: V(R) = D\u2091(1 \u2212 e^{\u2212a(R\u2212R\u2091)})\u00b2 \u2212 D\u2091. Built here from experimental spectroscopic constants (Huber & Herzberg) and used as the reference for computed E(R) curves." },
    { id: "virial", term: "Virial theorem",
      body: "For a Coulomb system at equilibrium the exact ratio \u2212V/T equals 2 (V - total potential, T - kinetic energy). The budget panel reports it as a quality check: deviations from 2 reveal basis strain or non-equilibrium geometry." },
    { id: "bo", term: "Born\u2013Oppenheimer approximation",
      body: "Nuclei are \u223c10\u2074 times heavier than electrons, so the electronic problem is solved at fixed nuclear positions, and the nuclei then move on the resulting energy surface. All maps here are electronic structure at clamped nuclei; nuclear motion enters through E(R) scans and the Hessian." },
    { id: "qft-view", term: "QFT view: fields and quanta",
      body: "In quantum field theory the electron is a quantum of the electron field \u03c8\u0302(x). A molecule is a localized bound state of interacting fields; orbitals are field modes; exchange (and the Pauli principle) follows from the anticommutator {\u03c8\u0302(x), \u03c8\u0302\u2020(y)}. The Coulomb force is the static limit of virtual-photon exchange. For molecular energy scales this reduces exactly to ordinary quantum mechanics - which is what this application solves." },
    { id: "au", term: "Atomic units",
      body: "The unit system of quantum chemistry: \u0127 = m\u2091 = e = 4\u03c0\u03b5\u2080 = 1. Energy is measured in hartree (1 Ha = 27.211 eV), length in bohr (0.5292 \u00c5). The interface shows energies in hartree, gaps and \u03b5 in eV, geometry in angstroms." }
  ];

  d.about = "Molecules through Quantum Field Theory is an educational application that runs a genuine ab initio quantum chemistry engine - restricted and unrestricted Hartree\u2013Fock with Gaussian bases (STO-3G, 6-31G, 6-31G*), plus full CI for two-electron systems - entirely in the browser, with no server. The presentation deliberately uses the language of quantum field theory: orbitals as field modes, electrons as quanta, exchange as a consequence of anticommutation.\n\nWhat it computes: electron density, deformation and spin densities, electrostatic potential, canonical and Boys-localized orbitals, orbital energies, total-energy decomposition, Mulliken charges, Mayer bond orders, dipole moments, Koopmans ionization potentials, E(R) bond curves with experimental Morse references, geometry optimization (BFGS), harmonic vibrational analysis with IR intensities, and export to PNG, Gaussian cube and JSON.\n\nAccuracy disclaimer: Hartree\u2013Fock with small bases is a qualitative tool. Typical errors: bond lengths to a few percent, dipoles to tens of percent, harmonic frequencies +10% systematic. Comparisons with experiment shown in the interface (NIST, CCCBDB, Huber & Herzberg) are there to make these errors visible rather than to hide them.\n\nEverything is computed locally; calculations are cached in your browser (IndexedDB) and previously visited molecules work offline. The code is plain JavaScript with zero dependencies. Standard textbook reference: A. Szabo, N. S. Ostlund, \u201cModern Quantum Chemistry\u201d (Dover, 1996).";
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
