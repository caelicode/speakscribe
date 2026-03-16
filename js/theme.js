/**
 * SpeakScribe Theme Manager
 * Handles dark/light/system theme switching with chrome.storage persistence.
 */
const SpeakScribeTheme = (() => {
  const STORAGE_KEY = 'speakscribe_theme';
  const VALID_MODES = ['dark', 'light', 'system'];

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
   * Initialize: read stored preference, apply it, and listen for system changes.
   * Returns the stored mode ('dark' | 'light' | 'system').
   */
  async function init() {
    const mode = await getSavedTheme();
    applyTheme(mode);

    // If user chose 'system', watch for OS changes
    if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        applyTheme('system');
      });
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

    // Re-register / remove system listener as needed
    // (Lightweight: just apply on change regardless; the attribute controls the CSS)
    if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        applyTheme('system');
      });
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
