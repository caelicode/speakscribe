/**
 * SpeakScribe Theme Manager
 * Handles dark/light/system theme switching with chrome.storage persistence.
 */
const SpeakScribeTheme = (() => {
  const STORAGE_KEY = 'speakscribe_theme';
  const VALID_MODES = ['dark', 'light', 'system'];

  // Fix #12: Track the media query listener so we can remove it to avoid leaks
  let _mediaListener = null;
  let _mediaQuery = null;

  /**
   * Read the saved theme preference from chrome.storage.local.
   * Falls back to 'dark' if nothing is stored.
   */
  function getSavedTheme() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve('dark');
        return;
      }
      chrome.storage.local.get([STORAGE_KEY], (data) => {
        if (chrome.runtime.lastError) {
          resolve('dark');
          return;
        }
        const mode = data[STORAGE_KEY];
        resolve(VALID_MODES.includes(mode) ? mode : 'dark');
      });
    });
  }

  /**
   * Persist the theme preference.
   */
  function saveTheme(mode) {
    if (!VALID_MODES.includes(mode)) return;
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.set({ [STORAGE_KEY]: mode });
  }

  /**
   * Resolve 'system' to the actual theme the OS is using.
   */
  function resolveSystemTheme() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }

  /**
   * Apply the resolved theme to the document body.
   */
  function applyTheme(mode) {
    const resolved = mode === 'system' ? resolveSystemTheme() : mode;
    document.body.setAttribute('data-theme', resolved);
  }

  /**
   * Remove any existing system theme listener to prevent leaks.
   */
  function _removeMediaListener() {
    if (_mediaListener && _mediaQuery) {
      _mediaQuery.removeEventListener('change', _mediaListener);
      _mediaListener = null;
      _mediaQuery = null;
    }
  }

  /**
   * Add a system theme change listener (only one at a time).
   */
  function _addMediaListener() {
    _removeMediaListener();
    if (typeof window !== 'undefined' && window.matchMedia) {
      _mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      _mediaListener = () => applyTheme('system');
      _mediaQuery.addEventListener('change', _mediaListener);
    }
  }

  /**
   * Initialize: read stored preference, apply it, and listen for system changes.
   * Returns the stored mode ('dark' | 'light' | 'system').
   */
  async function init() {
    const mode = await getSavedTheme();
    applyTheme(mode);

    // If user chose 'system', watch for OS changes
    if (mode === 'system') {
      _addMediaListener();
    }

    return mode;
  }

  /**
   * Set a new theme mode, persist it, and apply immediately.
   */
  function setTheme(mode) {
    if (!VALID_MODES.includes(mode)) return;
    saveTheme(mode);
    applyTheme(mode);

    // Manage system listener: add if 'system', remove otherwise
    if (mode === 'system') {
      _addMediaListener();
    } else {
      _removeMediaListener();
    }
  }

  /**
   * Cycle through themes: dark -> light -> system -> dark ...
   * Useful for the popup toggle button.
   */
  async function cycleTheme() {
    const current = await getSavedTheme();
    const idx = VALID_MODES.indexOf(current);
    const next = VALID_MODES[(idx + 1) % VALID_MODES.length];
    setTheme(next);
    return next;
  }

  return {
    VALID_MODES,
    getSavedTheme,
    saveTheme,
    resolveSystemTheme,
    applyTheme,
    init,
    setTheme,
    cycleTheme
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeakScribeTheme;
}
