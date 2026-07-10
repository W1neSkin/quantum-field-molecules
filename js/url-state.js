// Read shareable application state from the query string.
// These URLs are entry points for tutorials, not separate canonical pages.
(function (App) {
  "use strict";

  var MODE_ALIASES = {
    density: "total",
    total: "total",
    deformation: "diff",
    diff: "diff",
    esp: "esp",
    elf: "elf",
    laplacian: "lap",
    lap: "lap",
    spin: "spin",
    homo: "homo",
    lumo: "lumo"
  };
  var LABS = { cavity: "cavityCard", scaling: "scalingCard", bridge: "bridgeCard", finder: "finderCard" };

  function params() {
    try { return new URLSearchParams(location.search); }
    catch (e) { return new URLSearchParams(); }
  }

  function read() {
    var q = params();
    var mode = (q.get("mode") || "").toLowerCase();
    var lab = (q.get("lab") || "").toLowerCase();
    return {
      molecule: q.get("mol") || "",
      basis: q.get("basis") || "",
      mode: MODE_ALIASES[mode] || "",
      labTarget: LABS[lab] || ""
    };
  }

  // Translate a route mode after SCF has supplied the occupied-orbital count.
  function resolveMode(mode, scf, basisName) {
    if (!mode || !scf) return null;
    if (mode === "homo") return { kind: "mo", mo: Math.max(0, scf.nocc - 1), spin: "a" };
    if (mode === "lumo") return scf.nocc < scf.eps.length
      ? { kind: "mo", mo: scf.nocc, spin: "a" }
      : null;
    if (mode === "diff" && basisName !== "STO-3G") return { kind: "total" };
    if (mode === "spin" && !scf.uhf) return { kind: "total" };
    return { kind: mode };
  }

  App.urlState = { read: read, resolveMode: resolveMode };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
