"use strict";

// Dependency-free checks for the static pages published by GitHub Pages.
// This catches broken links and conflicting SEO metadata before deployment.
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var BASE = "https://w1neskin.github.io/quantum-field-molecules/";
var PAGES = [
  "index.html",
  "ru/index.html",
  "learn/index.html",
  "ru/learn/index.html",
  "learn/hartree-fock/index.html",
  "ru/learn/hartree-fock/index.html",
  "learn/h2-dissociation/index.html",
  "ru/learn/h2-dissociation/index.html",
  "learn/electron-density-orbitals/index.html",
  "ru/learn/electron-density-orbitals/index.html",
  "learn/qft-molecules/index.html",
  "ru/learn/qft-molecules/index.html",
  "validation/index.html",
  "ru/validation/index.html"
];
var errors = [];

function report(file, message) {
  errors.push(file + ": " + message);
}

function pageUrl(file) {
  return file === "index.html" ? BASE : BASE + file.replace(/index\.html$/, "");
}

function languagePair(file) {
  var russian = file.indexOf("ru/") === 0;
  var englishFile = russian ? file.slice(3) : file;
  var russianFile = russian ? file : "ru/" + file;
  return {
    en: pageUrl(englishFile),
    ru: pageUrl(russianFile),
    fallback: pageUrl(englishFile)
  };
}

function readMeta(html, name, property) {
  var key = property ? "property" : "name";
  var re = new RegExp("<meta[^>]+" + key + "=[\"']" + name + "[\"'][^>]+content=[\"']([^\"']+)", "i");
  var match = html.match(re);
  return match && match[1];
}

function readLink(html, rel, hreflang) {
  var tags = html.match(/<link\b[^>]*>/gi) || [];
  var found = tags.filter(function (tag) {
    return new RegExp("\\brel=[\"']" + rel + "[\"']", "i").test(tag) &&
      (!hreflang || new RegExp("\\bhreflang=[\"']" + hreflang + "[\"']", "i").test(tag));
  });
  if (found.length !== 1) return { count: found.length, href: "" };
  var href = found[0].match(/\bhref=["']([^"']+)/i);
  return { count: 1, href: href ? href[1] : "" };
}

function checkJsonLd(file, html) {
  var blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  if (!blocks.length) report(file, "missing JSON-LD");
  blocks.forEach(function (block) {
    var json = block.replace(/^.*?>/s, "").replace(/<\/script>$/i, "");
    try { JSON.parse(json); }
    catch (error) { report(file, "invalid JSON-LD: " + error.message); }
  });
}

function checkLocalLinks(file, html) {
  var directory = path.dirname(path.join(ROOT, file));
  var tags = html.match(/<(?:a|link|script|img)\b[^>]*>/gi) || [];
  tags.forEach(function (tag) {
    var match = tag.match(/\b(?:href|src)=["']([^"']+)/i);
    if (!match) return;
    var value = match[1].replace(/&amp;/g, "&");
    if (/^(?:https?:|mailto:|data:|#|\/\/)/i.test(value)) return;
    var clean = value.split(/[?#]/)[0];
    if (!clean) return;
    var target = path.resolve(directory, decodeURIComponent(clean));
    if (/[\\\/]$/.test(clean) || !path.extname(target)) target = path.join(target, "index.html");
    if (!fs.existsSync(target)) report(file, "broken local reference " + match[1]);
  });
}

PAGES.forEach(function (file) {
  var fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    report(file, "page is missing");
    return;
  }
  var html = fs.readFileSync(fullPath, "utf8");
  var expectedLang = file.indexOf("ru/") === 0 ? "ru" : "en";
  var htmlLang = (html.match(/<html[^>]+lang=["']([^"']+)/i) || [])[1];
  if (htmlLang !== expectedLang) report(file, "html lang must be " + expectedLang);

  var title = (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
  if (!title || title.length < 20) report(file, "missing or too-short title");
  var description = readMeta(html, "description");
  if (!description || description.length < 80) report(file, "missing or too-short description");
  if (/noindex/i.test(readMeta(html, "robots") || "")) report(file, "page must be indexable");

  var canonical = readLink(html, "canonical");
  if (canonical.count !== 1 || canonical.href !== pageUrl(file)) {
    report(file, "canonical must be " + pageUrl(file));
  }
  var pair = languagePair(file);
  [["en", pair.en], ["ru", pair.ru], ["x-default", pair.fallback]].forEach(function (item) {
    var alternate = readLink(html, "alternate", item[0]);
    if (alternate.count !== 1 || alternate.href !== item[1]) {
      report(file, "incorrect " + item[0] + " hreflang");
    }
  });

  var h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count !== 1) report(file, "expected one h1, found " + h1Count);
  checkJsonLd(file, html);
  checkLocalLinks(file, html);
});

var sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
var sitemapUrls = (sitemap.match(/<loc>[^<]+<\/loc>/g) || []).map(function (item) {
  return item.replace(/<\/?loc>/g, "");
});
var expectedUrls = PAGES.map(pageUrl);
expectedUrls.forEach(function (url) {
  if (sitemapUrls.indexOf(url) < 0) report("sitemap.xml", "missing " + url);
});
sitemapUrls.forEach(function (url) {
  if (expectedUrls.indexOf(url) < 0) report("sitemap.xml", "unexpected URL " + url);
  if (/[?#]/.test(url)) report("sitemap.xml", "URL must not contain query or hash: " + url);
});

var robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
if (robots.indexOf("Sitemap: " + BASE + "sitemap.xml") < 0) {
  report("robots.txt", "missing absolute sitemap URL");
}
var citation = fs.readFileSync(path.join(ROOT, "CITATION.cff"), "utf8");
if (!/^cff-version: 1\.2\.0/m.test(citation) || citation.indexOf("repository-code:") < 0) {
  report("CITATION.cff", "missing CFF version or repository metadata");
}

if (errors.length) {
  console.error("SEO check failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("PASS SEO: " + PAGES.length + " pages, metadata, sitemap and local links");
