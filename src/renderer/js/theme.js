// Theme controller: resolves System/Light/Dark and applies data-theme on <html>.
// Loaded synchronously in <head> (right after the stylesheets) so the theme is
// set before first paint. The pure logic is exported for Node unit tests.
(function () {
  'use strict';

  const THEME_KEY = 'qc-theme';

  function normalizeMode(mode) {
    return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'dark';
  }

  function resolveTheme(mode, prefersLight) {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    return prefersLight ? 'light' : 'dark';
  }

  // Node test hook: theme.js has no DOM dependencies, only the pure helpers.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { THEME_KEY, normalizeMode, resolveTheme };
    return;
  }

  let mode = 'dark';
  try {
    mode = normalizeMode(localStorage.getItem(THEME_KEY));
  } catch (e) {
    /* storage may be unavailable */
  }

  const mq = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

  function apply() {
    const resolved = resolveTheme(mode, mq ? mq.matches : false);
    document.documentElement.setAttribute('data-theme', resolved);
  }
  apply();

  if (mq) {
    const onChange = () => {
      if (mode === 'system') apply();
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
    } else if (mq.addListener) {
      mq.addListener(onChange);
    }
  }

  window.QuoteCraftTheme = {
    getMode: () => mode,
    setMode(next) {
      mode = normalizeMode(next);
      try {
        localStorage.setItem(THEME_KEY, mode);
      } catch (e) {
        /* ignore */
      }
      apply();
      document.dispatchEvent(new CustomEvent('themechange', { detail: mode }));
    },
  };
})();