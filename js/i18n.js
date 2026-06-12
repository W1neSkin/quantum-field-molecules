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
    document.title = t("app.title");
    [].forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    [].forEach.call(document.querySelectorAll("[data-i18n-title]"), function (el) {
      el.title = t(el.getAttribute("data-i18n-title"));
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
    var nav = (typeof navigator !== "undefined" && navigator.language || "en").slice(0, 2).toLowerCase();
    App.LANG = App.I18N[saved] ? saved : (App.I18N[nav] ? nav : "en");
    applyDom();
  }

  App.i18n = { t: t, content: content, setLang: setLang, init: init,
    applyDom: applyDom, languages: languages,
    onChange: function (cb) { subs.push(cb); } };
  App.tr = t; // short alias used by the engine for error messages
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
