// Builder controller extracted from app.js:
// keeps custom-molecule editor state and UI wiring in one place.
(function (App) {
  "use strict";

  var BOHR_TO_A = 0.529177210903; // engine atoms are stored in bohr

  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var loadMolecule = ctx.loadMolecule;
    var ui = App.appBuilderUi.create({ t: t, $: $ });
    var atomTag = ui.atomTag;
    var renderInfo = ui.renderInfo;

    function syncFromBuilder() {
      $("xyzInput").value = App.builder.toXyz();
      $("xyzError").style.display = "none";
      renderInfo();
    }

    // textarea -> builder preview, with live localized validation
    function parseToBuilder() {
      try {
        var atoms = App.engine.parseXYZ($("xyzInput").value).map(function (a) {
          return { Z: a.Z, xyz: a.xyz.map(function (c) { return c * BOHR_TO_A; }) };
        });
        $("xyzError").style.display = "none";
        App.builder.setAtoms(atoms);
        renderInfo();
      } catch (e) {
        $("xyzError").textContent = e.message;
        $("xyzError").style.display = "";
      }
    }

    function setBldTab(build) {
      $("bldPane").style.display = build ? "" : "none";
      $("xyzPane").style.display = build ? "none" : "";
      $("tabBuild").classList.toggle("active", build);
      $("tabText").classList.toggle("active", !build);
    }

    function open() {
      $("builderOverlay").style.display = "";
      setBldTab(true);
      parseToBuilder();
      App.builder.render();
    }

    function close() { $("builderOverlay").style.display = "none"; }

    function runCustomCompute(closeAfter) {
      try {
        App.engine.parseXYZ($("xyzInput").value);
        $("xyzError").style.display = "none";
      } catch (e) {
        $("xyzError").textContent = e.message;
        $("xyzError").style.display = "";
        open();
        setBldTab(false);
        return;
      }
      if (closeAfter) close();
      loadMolecule($("xyzInput").value, parseInt($("chargeInput").value, 10) || 0, null);
    }

    function addFragment(kind) {
      var oldMode = App.builder.mode();
      var ok = true;
      function safeAdd(z) {
        if (App.builder.add(z) >= 0) return true;
        renderInfo(t("err.parse.maxatoms"));
        return false;
      }
      if (kind === "CH3") {
        App.builder.setMode("chain");
        if (!safeAdd(6)) ok = false;
        if (ok) {
          var c = App.builder.selected();
          App.builder.setMode("branch");
          ok = safeAdd(1) && safeAdd(1) && safeAdd(1);
          App.builder.setSelected(c);
        }
      } else if (kind === "OH") {
        App.builder.setMode("chain");
        ok = safeAdd(8) && safeAdd(1);
      } else if (kind === "NH2") {
        App.builder.setMode("chain");
        if (!safeAdd(7)) ok = false;
        if (ok) {
          var n = App.builder.selected();
          App.builder.setMode("branch");
          ok = safeAdd(1) && safeAdd(1);
          App.builder.setSelected(n);
        }
      }
      App.builder.setMode(oldMode);
      if (ok) renderInfo(t("custom.frag.done"));
    }

    function init() {
      App.builder.init($("bldCanvas"), syncFromBuilder);
      App.builder.setMode("chain");
      for (var z = 1; z <= 10; z++) {
        (function (z) {
          var b = document.createElement("button");
          b.className = "pill";
          b.textContent = App.SYMBOLS[z];
          b.addEventListener("click", function () {
            if (App.builder.add(z) < 0) $("bldInfo").textContent = t("err.parse.maxatoms");
          });
          $("bldElems").appendChild(b);
        })(z);
      }

      $("bldModeChain").addEventListener("click", function () { App.builder.setMode("chain"); renderInfo(); });
      $("bldModeBranch").addEventListener("click", function () { App.builder.setMode("branch"); renderInfo(); });
      $("bldUndo").addEventListener("click", function () { App.builder.undo(); renderInfo(); });
      $("bldRedo").addEventListener("click", function () { App.builder.redo(); renderInfo(); });
      $("bldDel").addEventListener("click", function () { App.builder.remove(); });
      $("bldClear").addEventListener("click", function () { App.builder.clear(); });
      $("bldRelax").addEventListener("click", function () {
        var r = App.builder.relax(28);
        renderInfo(t("custom.relax.done", { i: r.iters, d: r.moved.toFixed(2) }));
      });
      $("bldFromCur").addEventListener("click", function () {
        if (!state.result) return;
        App.builder.setAtoms(state.result.atoms.map(function (a) {
          return { Z: a.Z, xyz: a.xyz.map(function (c) { return c * BOHR_TO_A; }) };
        }), false, { resetHistory: true });
        syncFromBuilder();
      });
      Array.prototype.forEach.call(document.querySelectorAll("#bldFragments [data-frag]"), function (b) {
        b.addEventListener("click", function () { addFragment(b.dataset.frag); });
      });
      $("bldConnectBtn").addEventListener("click", function () {
        var from = App.builder.selected();
        var to = parseInt($("bldConnectTo").value, 10);
        if (from < 0 || !isFinite(to)) return;
        if (App.builder.connect(from, to)) {
          var atoms = App.builder.getAtoms();
          renderInfo(t("custom.connect.done", { a: atomTag(atoms[from], from), b: atomTag(atoms[to], to) }));
        }
      });

      $("openBuilderBtn").addEventListener("click", open);
      $("builderClose").addEventListener("click", close);
      $("builderApply").addEventListener("click", close);
      $("builderApplyRun").addEventListener("click", function () { runCustomCompute(true); });
      $("computeBtn").addEventListener("click", function () { runCustomCompute(false); });

      $("tabBuild").addEventListener("click", function () { setBldTab(true); });
      $("tabText").addEventListener("click", function () { setBldTab(false); });
      $("builderOverlay").addEventListener("click", function (e) {
        if (e.target === $("builderOverlay")) close();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && $("builderOverlay").style.display !== "none") close();
      });

      var timer = null;
      $("xyzInput").addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(parseToBuilder, 350);
      });
      parseToBuilder(); // seed the preview from the example geometry
      renderInfo();
    }

    return { init: init, renderInfo: renderInfo, open: open, close: close };
  }

  App.appBuilder = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
