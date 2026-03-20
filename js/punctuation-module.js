// ES module re-export wrapper for punctuation.js
//
// punctuation.js is loaded as a regular (non-module) content script by the
// manifest, so it CANNOT contain `export` statements (SyntaxError in that
// context). It defines its functions and attaches them to
// window.SpeakScribePunctuation for content script consumers.
//
// For ES module consumers (speech-engine.js, popup.js), popup.html loads
// punctuation.js via a plain <script> tag first, then this module re-exports
// the functions from the global.

const _p = (typeof window !== 'undefined' && window.SpeakScribePunctuation) || {};

export const processTranscription = _p.processTranscription || ((text) => text || '');
export const parseVocabulary = _p.parseVocabulary || (() => ({ words: [], replacements: {} }));
