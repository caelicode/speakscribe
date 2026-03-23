/**
 * SpeakScribe Shared Settings Defaults
 *
 * Single source of truth for all default settings.
 * Used by background.js, options.js, popup.js, and content.js.
 */
const SpeakScribeDefaults = {
  // Engine
  engine: 'web-speech',

  // Language
  language: 'en-US',

  // Transcription behavior
  smartPunctuation: true,
  autoCapitalize: true,
  continuousListening: true,
  showTimestamps: false,

  // UI
  showCommandPalette: true,
  autoOpenOverlay: false,
  overlayOpacity: 'opaque',
  overlayFontSize: null,

  // Export
  exportFormat: 'txt',

  // Meeting
  meetingAutoTranscribe: false,

  // Per-site
  perSiteEnabled: false,

  // Deepgram Enhanced engine proxy URL
  // Change this to your production proxy URL after deploying
  // e.g., 'wss://speakscribe-proxy-production.up.railway.app'
  deepgramProxyUrl: 'ws://localhost:3001',
};

// Make available as global (for service worker importScripts and content scripts)
if (typeof globalThis !== 'undefined') {
  globalThis.SpeakScribeDefaults = SpeakScribeDefaults;
}
// Also support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeakScribeDefaults;
}
