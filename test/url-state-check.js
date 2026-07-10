"use strict";

// Fast contract test for tutorial links before a browser calculation starts.
var assert = require("assert");

global.App = {};
global.location = {
  search: "?lang=ru&mol=H2O&basis=6-31G&mode=elf&lab=bridge"
};
require("../js/url-state.js");

var route = global.App.urlState.read();
assert.strictEqual(route.molecule, "H2O");
assert.strictEqual(route.basis, "6-31G");
assert.strictEqual(route.mode, "elf");
assert.strictEqual(route.labTarget, "bridgeCard");

var rhf = { nocc: 5, eps: [-2, -1, -0.5, -0.3, -0.2, 0.1], uhf: false };
assert.deepStrictEqual(global.App.urlState.resolveMode("homo", rhf, "STO-3G"),
  { kind: "mo", mo: 4, spin: "a" });
assert.deepStrictEqual(global.App.urlState.resolveMode("lumo", rhf, "STO-3G"),
  { kind: "mo", mo: 5, spin: "a" });
assert.deepStrictEqual(global.App.urlState.resolveMode("spin", rhf, "STO-3G"),
  { kind: "total" });
assert.deepStrictEqual(global.App.urlState.resolveMode("diff", rhf, "6-31G"),
  { kind: "total" });

console.log("PASS routing: molecule, basis, mode and laboratory parameters");
