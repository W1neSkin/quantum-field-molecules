// Builder UI helper extracted from app-builder.js:
// warning analysis and right-side panel rendering.
(function (App) {
  "use strict";

  function create(ctx) {
    var t = ctx.t;
    var $ = ctx.$;

    function atomTag(a, i) { return App.SYMBOLS[a.Z] + (i + 1); }

    function bldIssues() {
      var atoms = App.builder.getAtoms();
      var warns = [];
      if (atoms.length < 2) return warns;
      var adj = atoms.map(function () { return []; });
      var deg = atoms.map(function () { return 0; });
      var vmax = { 1: 1, 3: 1, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3, 9: 1 };
      var i, j;

      for (i = 0; i < atoms.length; i++) {
        for (j = i + 1; j < atoms.length; j++) {
          var dx = atoms[i].xyz[0] - atoms[j].xyz[0];
          var dy = atoms[i].xyz[1] - atoms[j].xyz[1];
          var dz = atoms[i].xyz[2] - atoms[j].xyz[2];
          var d = Math.hypot(dx, dy, dz);
          var r0 = App.builder.COV_R[atoms[i].Z] + App.builder.COV_R[atoms[j].Z];
          if (d < 0.68 * r0) warns.push(t("custom.warn.close", {
            a: atomTag(atoms[i], i), b: atomTag(atoms[j], j), d: d.toFixed(2)
          }));
          if (d < 1.25 * r0) { adj[i].push(j); adj[j].push(i); deg[i]++; deg[j]++; }
        }
      }
      for (i = 0; i < atoms.length; i++) {
        var vm = vmax[atoms[i].Z];
        if (vm != null && deg[i] > vm) warns.push(t("custom.warn.valence", { a: atomTag(atoms[i], i), n: deg[i] }));
      }

      var seen = atoms.map(function () { return false; }), comp = 0;
      for (i = 0; i < atoms.length; i++) {
        if (seen[i]) continue;
        comp++;
        var q = [i];
        seen[i] = true;
        while (q.length) {
          var v = q.pop();
          adj[v].forEach(function (n) { if (!seen[n]) { seen[n] = true; q.push(n); } });
        }
      }
      if (comp > 1) warns.push(t("custom.warn.frag", { n: comp }));
      return warns;
    }

    function renderConnectOptions(atoms, sel) {
      var s = $("bldConnectTo");
      s.innerHTML = "";
      if (sel < 0 || atoms.length < 2) {
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = t("custom.connect.none");
        s.appendChild(empty);
        $("bldConnectBtn").disabled = true;
        return;
      }
      atoms.forEach(function (a, i) {
        if (i === sel) return;
        var o = document.createElement("option");
        o.value = i;
        o.textContent = atomTag(a, i);
        s.appendChild(o);
      });
      $("bldConnectBtn").disabled = s.options.length === 0;
    }

    function renderInfo(extra) {
      var atoms = App.builder.getAtoms();
      var warns = bldIssues();
      var modeKey = App.builder.mode() === "branch" ? "custom.mode.branch" : "custom.mode.chain";
      $("customSummary").textContent = atoms.length
        ? t("custom.summary", { n: atoms.length, w: warns.length, mode: t(modeKey) })
        : "";

      if (!atoms.length) {
        $("bldInfo").textContent = "";
        $("bldWarn").innerHTML = "<p>" + t("custom.warn.ok") + "</p>";
        $("bldSel").innerHTML = "<p>" + t("custom.sel.none") + "</p>";
        renderConnectOptions(atoms, -1);
        $("bldUndo").disabled = !App.builder.canUndo();
        $("bldRedo").disabled = !App.builder.canRedo();
        return;
      }

      var s = t("custom.natoms", { n: atoms.length });
      var sel = App.builder.selected();
      if (sel >= 0) {
        s += t("custom.sel", { sym: atomTag(atoms[sel], sel) });
        var bonds = App.builder.selectionBonds();
        if (bonds && bonds.length) {
          s += " (" + bonds.map(function (b) { return b.label + " " + b.len.toFixed(2) + " Å"; }).join(", ") + ")";
        }
      }
      if (extra) s += " · " + extra;
      $("bldInfo").textContent = s;

      $("bldWarn").innerHTML = warns.length
        ? warns.slice(0, 5).map(function (w) { return "<p>• " + w + "</p>"; }).join("")
        : "<p>" + t("custom.warn.ok") + "</p>";
      if (warns.length > 5) $("bldWarn").innerHTML += "<p>• " + t("custom.warn.more", { n: warns.length - 5 }) + "</p>";

      var selHtml;
      if (sel < 0) selHtml = "<p>" + t("custom.sel.none") + "</p>";
      else {
        var sb = App.builder.selectionBonds();
        selHtml = "<p>" + t("custom.sel.atom", { a: atomTag(atoms[sel], sel) }) + "</p>";
        if (sb && sb.length) {
          selHtml += sb.map(function (b) { return "<p>" + b.label + ": " + b.len.toFixed(2) + " Å</p>"; }).join("");
        } else selHtml += "<p>" + t("custom.sel.nobonds") + "</p>";
      }
      $("bldSel").innerHTML = selHtml;
      renderConnectOptions(atoms, sel);

      $("bldUndo").disabled = !App.builder.canUndo();
      $("bldRedo").disabled = !App.builder.canRedo();
      $("bldModeChain").classList.toggle("active", App.builder.mode() === "chain");
      $("bldModeBranch").classList.toggle("active", App.builder.mode() === "branch");
    }

    return { atomTag: atomTag, renderInfo: renderInfo };
  }

  App.appBuilderUi = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
