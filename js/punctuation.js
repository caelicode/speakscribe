const PUNCTUATION_MAP = {

  'period': '.',
  'full stop': '.',
  'dot': '.',
  'comma': ',',
  'question mark': '?',
  'exclamation mark': '!',
  'exclamation point': '!',
  'semicolon': ';',
  'semi colon': ';',
  'colon': ':',
  'dash': '-',
  'hyphen': '-',
  'ellipsis': '...',
  'dot dot dot': '...',


  'open quote': '"',
  'close quote': '"',
  'quote': '"',
  'open parenthesis': '(',
  'close parenthesis': ')',
  'open bracket': '[',
  'close bracket': ']',
  'open brace': '{',
  'close brace': '}',


  'ampersand': '&',
  'at sign': '@',
  'hash': '#',
  'hashtag': '#',
  'dollar sign': '$',
  'percent': '%',
  'percent sign': '%',
  'asterisk': '*',
  'star': '*',
  'plus sign': '+',
  'equals sign': '=',
  'slash': '/',
  'backslash': '\\',
  'underscore': '_',
  'pipe': '|',
  'tilde': '~',


  'new line': '\n',
  'newline': '\n',
  'new paragraph': '\n\n',
  'tab': '\t',
};

const NO_SPACE_BEFORE = new Set(['.', ',', '?', '!', ';', ':', ')', ']', '}', '"', "'", '%']);

const NO_SPACE_AFTER = new Set(['(', '[', '{', '"', "'"]);

const CAPITALIZE_AFTER = new Set(['.', '?', '!', '\n']);

export function processTranscription(text, options = {}) {
  const {
    smartPunctuation = true,
    autoCapitalize = true,
    customVocab = [],
    vocabReplacements = {},
  } = options;

  if (!text || typeof text !== 'string') {
    return '';
  }

  let processed = text;


  if (Object.keys(vocabReplacements).length > 0) {
    for (const [wrong, correct] of Object.entries(vocabReplacements)) {
      const regex = new RegExp(`\\b${escapeRegex(wrong)}\\b`, 'gi');
      processed = processed.replace(regex, correct);
    }
  }


  if (smartPunctuation) {
    processed = applySmartPunctuation(processed);
  }


  if (autoCapitalize) {
    processed = applyAutoCapitalization(processed);
  }


  processed = cleanSpacing(processed);

  return processed;
}

function applySmartPunctuation(text) {
  let result = text;


  const sortedCommands = Object.entries(PUNCTUATION_MAP)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [spoken, symbol] of sortedCommands) {

    const regex = new RegExp(`\\b${escapeRegex(spoken)}\\b`, 'gi');
    result = result.replace(regex, symbol);
  }

  return result;
}

function applyAutoCapitalization(text) {
  if (!text) return text;

  let result = '';
  let capitalizeNext = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (capitalizeNext && /[a-zA-Z]/.test(char)) {
      result += char.toUpperCase();
      capitalizeNext = false;
    } else {
      result += char;
    }

    if (CAPITALIZE_AFTER.has(char)) {
      capitalizeNext = true;
    }
  }

  return result;
}

function cleanSpacing(text) {
  let result = text;


  for (const punct of NO_SPACE_BEFORE) {
    const regex = new RegExp(`\\s+\\${escapeRegex(punct)}`, 'g');
    result = result.replace(regex, punct);
  }


  for (const punct of NO_SPACE_AFTER) {
    const regex = new RegExp(`\\${escapeRegex(punct)}\\s+`, 'g');
    result = result.replace(regex, punct);
  }


  result = result.replace(/([.?!,;:])([A-Za-z])/g, '$1 $2');


  result = result.replace(/ {2,}/g, ' ');

  return result.trim();
}

export function parseVocabulary(vocabEntries) {
  const words = [];
  const replacements = {};

  for (const entry of vocabEntries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (trimmed.includes('=')) {
      const [wrong, correct] = trimmed.split('=').map(s => s.trim());
      if (wrong && correct) {
        replacements[wrong] = correct;
        words.push(correct);
      }
    } else {
      words.push(trimmed);
    }
  }

  return { words, replacements };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
