/*
 * Runs synchronously in <head>, before the stylesheet and the module.
 * Mirrors the last host appearance from localStorage so the panel does not
 * flash the wrong palette while the async bridge call is in flight.
 * No framework, no imports, no side effects beyond documentElement attributes.
 */
(function () {
  var KEY = "hindsight.panel.appearance.v1";
  var root = document.documentElement;
  var cached = null;

  try {
    cached = JSON.parse(window.localStorage.getItem(KEY) || "null");
  } catch (error) {
    cached = null;
  }

  var hostBase =
    root.dataset.base === "light" || root.dataset.base === "dark"
      ? root.dataset.base
      : root.dataset.theme === "light" || root.dataset.theme === "dark"
        ? root.dataset.theme
        : null;
  var base =
    hostBase ||
    (cached && (cached.base === "light" || cached.base === "dark") ? cached.base : null);
  if (!base) {
    try {
      base = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (error) {
      base = "light";
    }
  }

  root.dataset.base = base;
  root.style.colorScheme = base;

  // A lang other than the static default was set by the host preload; keep it.
  var hostLocale = root.lang && root.lang !== "zh-CN" ? root.lang : null;
  var locale =
    hostLocale ||
    (cached && typeof cached.locale === "string" && cached.locale
      ? cached.locale
      : navigator.language || "zh-CN");
  root.lang = locale;
})();
