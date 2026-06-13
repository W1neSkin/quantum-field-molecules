// Panels controller extracted from app.js:
// MO levels, Boys localization, budget/facts, and E(R) card visibility.
(function (App) {
  "use strict";

  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var setStatus = ctx.setStatus;
    var setMode = ctx.setMode;
    var renderModePills = ctx.renderModePills;
    var fmtEv = ctx.fmtEv;
    var HA_TO_EV = ctx.haToEv;
    var locReq = 0;

    function renderLevels() {
      App.molevels.render($("levels"), state.result.scf, {
        selected: state.mode.kind === "mo" && !state.mode.localized ? state.mode.mo : -1,
        selectedSpin: state.mode.spin || "a",
        onSelect: function (mo, spin) {
          // level diagram is canonical: picking a level leaves Boys view
          if (state.localized) { state.localized = false; $("locToggle").checked = false; }
          setMode({ kind: "mo", mo: mo, spin: spin });
        }
      });
    }

    function applyLocalizedState(on, scf) {
      state.localized = on;
      if (state.mode.kind === "mo") {
        if (on) {
          // prefer the first bond LMO as the landing view
          var k = scf.locLabels.findIndex(function (l) { return l.type === "bond"; });
          setMode({ kind: "mo", mo: k >= 0 ? k : scf.nocc - 1, spin: "a", localized: true });
        } else {
          setMode({ kind: "mo", mo: scf.nocc - 1, spin: "a" });
        }
      } else {
        renderModePills();
      }
    }

    // ---------- Boys localization toggle ----------
    function setLocalized(on) {
      var scf = state.result.scf;
      var gen = state.resultGen;
      var reqId = ++locReq;
      if (on && !scf.Cloc) {
        // Yield one tick first so the busy status paints before heavy math starts.
        setStatus(t("status.localize"), "busy");
        var runLoc = App.localize.boysAsync || function (result, onProgress, done, fail) {
          try { done(App.localize.boys(result)); } catch (e) { if (fail) fail(e); }
        };
        setTimeout(function () {
          // Ignore stale jobs (toggle changed, new result loaded, etc.).
          if (reqId !== locReq || gen !== state.resultGen || !state.result || state.result.scf !== scf) return;
          runLoc(state.result, null, function (loc) {
            if (reqId !== locReq || gen !== state.resultGen || !state.result || state.result.scf !== scf) return;
            scf.Cloc = loc.C;
            scf.locLabels = loc.labels;
            applyLocalizedState(true, scf);
            setStatus(state.okStatus, "ok");
          }, function (e) {
            if (reqId !== locReq || gen !== state.resultGen || !state.result || state.result.scf !== scf) return;
            setStatus(t("status.locfail", { msg: e.message }), "error");
            $("locToggle").checked = false;
          });
        }, 0);
        return;
      }
      applyLocalizedState(on, scf);
      if (!on) setStatus(state.okStatus, "ok");
    }

    function renderBudget() {
      var scf = state.result.scf;
      var props = state.result.props;
      var exp = (state.preset && state.preset.exp) || {};
      var rows = [
        [t("budget.E"), scf.E.toFixed(4) + t("u.ha")],
        [t("budget.T"), scf.ET.toFixed(3)],
        [t("budget.Vne"), scf.EVne.toFixed(3)],
        [t("budget.J"), scf.EJ.toFixed(3)],
        [t("budget.K"), scf.EK.toFixed(3)],
        [t("budget.Enuc"), scf.Enuc.toFixed(3)],
        [t("budget.virial"), (-(scf.EVne + scf.EJ + scf.EK + scf.Enuc) / scf.ET).toFixed(3)]
      ];
      if (scf.uhf) {
        rows.push([t("budget.S2", { x: scf.S2exact.toFixed(2) }), scf.S2.toFixed(4)]);
      }
      if (scf.fci) {
        rows.push([t("budget.fci"), scf.fci.E.toFixed(4) + t("u.ha")]);
        rows.push([t("budget.corr"), scf.fci.Ecorr.toFixed(4) + t("u.ha") + " (" +
          (scf.fci.Ecorr * HA_TO_EV).toFixed(2) + t("u.ev") + ")"]);
      }
      if (props) {
        rows.push([t("budget.dip") + (exp.dipole != null ? t("budget.exp", { v: exp.dipole.toFixed(2) + t("u.debye") }) : ""),
          props.dipole.debye.toFixed(2) + t("u.debye")]);
        rows.push([t("budget.ip", { orb: scf.uhf && scf.nocc > scf.noccB ? "SOMO" : "HOMO" }) +
          (exp.ip != null ? t("budget.exp", { v: exp.ip.toFixed(1) }) : ""),
          fmtEv(-scf.eps[scf.nocc - 1])]);
      }
      $("budget").innerHTML = rows.map(function (r) {
        return "<div class='brow'><span>" + r[0] + "</span><b>" + r[1] + "</b></div>";
      }).join("");

      var atoms = state.result.atoms;
      var sym = function (i) { return App.SYMBOLS[atoms[i].Z] + (atoms.length > 1 ? i + 1 : ""); };
      var html = t("mull.title") + atoms.map(function (a, i) {
        var q = scf.mulliken[i];
        return "<span class='chip'>" + sym(i) + ": " + (q >= 0 ? "+" : "") + q.toFixed(2) +
          (scf.uhf && Math.abs(scf.spinPop[i]) > 0.005 ? t("mull.spin", { s: scf.spinPop[i].toFixed(2) }) : "") + "</span>";
      }).join(" ");
      if (props && props.mayer.length) {
        html += "<br>" + t("mayer.title") + props.mayer.map(function (b) {
          return "<span class='chip'>" + sym(b.a) + "–" + sym(b.b) + ": " + b.order.toFixed(2) + "</span>";
        }).join(" ");
      }
      $("mulliken").innerHTML = html;
      renderProvenance();
    }

    function renderProvenance() {
      var box = $("provenance");
      if (!box) return;
      if (!state.provenance || !App.provenance || !App.provenance.formatForUi) {
        box.innerHTML = "";
        return;
      }
      var rows = App.provenance.formatForUi(state.provenance, t);
      box.innerHTML = "<p class='small muted'>" + t("prov.title") + "</p>" + rows.map(function (r) {
        var v = r.mono ? "<code>" + r.value + "</code>" : r.value;
        return "<div class='brow'><span>" + r.key + "</span><b>" + v + "</b></div>";
      }).join("");
    }

    function renderFacts() {
      var facts = state.preset
        ? App.presetFacts(state.preset)
        : [t("facts.custom", { basis: state.result.basisName || "STO-3G" })];
      $("facts").innerHTML = facts.map(function (f) { return "<p class='small sec'>- " + f + "</p>"; }).join("");

      var c = App.diagrams.pairCounts(state.result.atoms, state.result.scf.nelec);
      $("pairs").textContent = t("pairs", { ee: c.ee, en: c.en, nn: c.nn });
    }

    function renderEnergyCard() {
      var card = $("energyCard");
      var show = state.preset && state.preset.morse;
      card.style.display = show ? "" : "none";
      // exchange card takes the full row when there is no E(R) curve
      $("bottomGrid").classList.toggle("solo", !show);
      App.scanCtl.presetLoaded(show ? state.preset : null, state.result);
    }

    return {
      renderLevels: renderLevels,
      setLocalized: setLocalized,
      renderBudget: renderBudget,
      renderFacts: renderFacts,
      renderEnergyCard: renderEnergyCard
    };
  }

  App.appPanels = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
