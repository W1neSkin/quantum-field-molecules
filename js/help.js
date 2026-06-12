// In-app help: modal with three tabs — user guide, glossary (wiki), about.
// Content comes from the locale files (helpSections / glossary / about);
// card headers carry data-help="sectionId" buttons that deep-link here.
(function (App) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var t = function (k, p) { return App.i18n.t(k, p); };
  var current = "guide"; // active tab
  var filter = "";

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function paragraphs(parent, body) {
    body.split("\n\n").forEach(function (p) { el("p", "small sec", parent, p); });
  }

  function renderGuide(box) {
    var sections = App.i18n.content("helpSections");
    var nav = el("nav", "help-nav", box);
    var content = el("div", "help-content", box);
    sections.forEach(function (s) {
      var a = el("button", "help-link", nav, s.title);
      a.addEventListener("click", function () {
        var target = document.getElementById("help-sec-" + s.id);
        if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      var sec = el("section", "", content);
      sec.id = "help-sec-" + s.id;
      el("h3", "", sec, s.title);
      paragraphs(sec, s.body);
    });
  }

  function renderGlossary(box) {
    var input = el("input", "help-search", box);
    input.type = "search";
    input.placeholder = t("help.search");
    input.value = filter;
    var list = el("div", "help-content help-gloss", box);
    var fill = function () {
      list.innerHTML = "";
      var q = filter.trim().toLowerCase();
      var items = App.i18n.content("glossary").filter(function (g) {
        return !q || g.term.toLowerCase().indexOf(q) >= 0 || g.body.toLowerCase().indexOf(q) >= 0;
      });
      if (!items.length) { el("p", "small muted", list, t("help.empty")); return; }
      items.forEach(function (g) {
        var sec = el("section", "", list);
        sec.id = "help-term-" + g.id;
        el("h3", "", sec, g.term);
        paragraphs(sec, g.body);
      });
    };
    input.addEventListener("input", function () { filter = input.value; fill(); });
    fill();
    setTimeout(function () { input.focus(); }, 0);
  }

  function renderAbout(box) {
    var content = el("div", "help-content", box);
    paragraphs(content, App.i18n.content("about"));
  }

  function render() {
    var tabs = $("helpTabs");
    tabs.innerHTML = "";
    [["guide", "help.tab.guide"], ["glossary", "help.tab.glossary"], ["about", "help.tab.about"]]
      .forEach(function (def) {
        var b = el("button", "pill" + (current === def[0] ? " active" : ""), tabs, t(def[1]));
        b.addEventListener("click", function () { current = def[0]; render(); });
      });
    $("helpTitle").textContent = t("help.title");
    var box = $("helpBody");
    box.innerHTML = "";
    box.className = "help-body" + (current === "guide" ? " with-nav" : "");
    if (current === "guide") renderGuide(box);
    else if (current === "glossary") renderGlossary(box);
    else renderAbout(box);
  }

  function open(sectionId) {
    current = "guide";
    render();
    $("helpOverlay").style.display = "";
    document.body.style.overflow = "hidden";
    if (sectionId) {
      var target = document.getElementById("help-sec-" + sectionId);
      if (target) target.scrollIntoView({ block: "start" });
    }
  }

  function close() {
    $("helpOverlay").style.display = "none";
    document.body.style.overflow = "";
  }

  function isOpen() { return $("helpOverlay").style.display !== "none"; }

  function init() {
    $("helpBtn").addEventListener("click", function () { open(); });
    $("helpClose").addEventListener("click", close);
    $("helpOverlay").addEventListener("click", function (e) {
      if (e.target === $("helpOverlay")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) close();
    });
    // contextual "?" buttons in card headers
    [].forEach.call(document.querySelectorAll("[data-help]"), function (b) {
      b.addEventListener("click", function () { open(b.getAttribute("data-help")); });
    });
    // re-render the open modal when the language changes
    App.i18n.onChange(function () { if (isOpen()) render(); });
  }

  App.help = { init: init, open: open, close: close };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
