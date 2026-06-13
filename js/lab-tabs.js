// Tab switcher for scientific tool cards (cavity / scaling / bridge).
(function (App) {
  "use strict";
  var S = { bound: false, active: null };

  function tabs() {
    return [].slice.call(document.querySelectorAll("[data-lab-target]"));
  }

  function panels() {
    return [].slice.call(document.querySelectorAll("[data-lab-panel]"));
  }

  function refreshPanel(targetId) {
    if (targetId === "cavityCard" && App.cavitySandbox && App.cavitySandbox.refresh) App.cavitySandbox.refresh();
    if (targetId === "scalingCard" && App.scalingLab && App.scalingLab.refresh) App.scalingLab.refresh();
    if (targetId === "bridgeCard" && App.crossBridge && App.crossBridge.refresh) App.crossBridge.refresh();
  }

  function show(targetId) {
    if (typeof document === "undefined") return;
    var ps = panels();
    if (!ps.length) return;
    var hasTarget = ps.some(function (p) { return p.id === targetId; });
    var active = hasTarget ? targetId : ps[0].id;
    ps.forEach(function (p) { p.style.display = p.id === active ? "" : "none"; });
    tabs().forEach(function (b) {
      var on = b.getAttribute("data-lab-target") === active;
      b.classList.toggle("active", on);
    });
    S.active = active;
    refreshPanel(active);
  }

  function init() {
    if (typeof document === "undefined") return;
    var btns = tabs();
    if (!btns.length) return;
    if (!S.bound) {
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          show(b.getAttribute("data-lab-target"));
        });
      });
      S.bound = true;
    }
    show(S.active || btns[0].getAttribute("data-lab-target"));
  }

  App.labTabs = { init: init, show: show };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
