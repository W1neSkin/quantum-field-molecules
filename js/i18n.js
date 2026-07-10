// i18n core: dictionaries live in js/lang/*.js (App.I18N[lang]).
// DOM-free on load so the Web Worker can import it and localize engine errors;
// the worker receives the active language with every request.
(function (App) {
  "use strict";

  var KEY = "qft.lang";
  var subs = [];
  App.I18N = App.I18N || {};
  App.LANG = App.LANG || "en";

  // t("key", {x: 1}) with {x} interpolation; falls back lang -> en -> key
  function t(key, params) {
    var s = (App.I18N[App.LANG] || {})[key];
    if (s == null) s = (App.I18N.en || {})[key];
    if (s == null) return key;
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return params[k] != null ? params[k] : m;
      });
    }
    return s;
  }

  // long-form structured content (help sections, glossary) with en fallback
  function content(field) {
    var d = App.I18N[App.LANG] || {};
    return d[field] || (App.I18N.en || {})[field] || [];
  }

  function languages() {
    return Object.keys(App.I18N).map(function (code) {
      return { code: code, name: (App.I18N[code]._name || code) };
    });
  }

  // fills every element carrying data-i18n / data-i18n-title / data-i18n-ph
  function applyDom() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = App.LANG;
    var title = t("app.title");
    if (document.title !== title) document.title = title;
    [].forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      // Keep server-rendered fallback text when it already matches. Replacing
      // identical text delays LCP because the browser treats it as a new paint.
      var text = t(el.getAttribute("data-i18n"));
      if (el.textContent !== text) el.textContent = text;
    });
    // custom tooltips (js/tooltip.js) read data-tip; aria-label for a11y
    [].forEach.call(document.querySelectorAll("[data-i18n-title]"), function (el) {
      var s = t(el.getAttribute("data-i18n-title"));
      el.dataset.tip = s;
      // A visible button label is the clearest accessible name. Tooltip text
      // remains in data-tip; use it as aria-label only for icon/form controls.
      var tag = el.tagName;
      var visible = (el.textContent || "").trim();
      var needsAria = tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA" ||
        !visible || /^[?×✕☾☀]$/.test(visible);
      if (needsAria) el.setAttribute("aria-label", s);
      else el.removeAttribute("aria-label");
    });
    [].forEach.call(document.querySelectorAll("[data-i18n-ph]"), function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-ph"));
    });
  }

  function setLang(lang) {
    if (!App.I18N[lang]) lang = "en";
    App.LANG = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
    applyDom();
    subs.forEach(function (cb) { cb(lang); });
  }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    // ?lang=xx wins: it makes language variants linkable (and crawlable via hreflang)
    var url = null;
    try { url = new URLSearchParams(location.search).get("lang"); } catch (e) { /* worker/node */ }
    var nav = (typeof navigator !== "undefined" && navigator.language || "en").slice(0, 2).toLowerCase();
    App.LANG = App.I18N[url] ? url : App.I18N[saved] ? saved : (App.I18N[nav] ? nav : "en");
    applyDom();
  }

  App.i18n = { t: t, content: content, setLang: setLang, init: init,
    applyDom: applyDom, languages: languages,
    onChange: function (cb) { subs.push(cb); } };
  App.tr = t; // short alias used by the engine for error messages
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
