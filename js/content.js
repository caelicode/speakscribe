(function () {
  'use strict';


  if (window.__speakscribe_loaded) return;
  window.__speakscribe_loaded = true;




  const PUNCTUATION_MAP = {
    'period': '.', 'full stop': '.', 'dot': '.',
    'comma': ',', 'question mark': '?',
    'exclamation mark': '!', 'exclamation point': '!',
    'semicolon': ';', 'semi colon': ';', 'colon': ':',
    'dash': '-', 'hyphen': '-',
    'ellipsis': '...', 'dot dot dot': '...',
    'open quote': '\u201C', 'close quote': '\u201D', 'quote': '"',
    'open parenthesis': '(', 'close parenthesis': ')',
    'open bracket': '[', 'close bracket': ']',
    'ampersand': '&', 'at sign': '@', 'hash': '#', 'hashtag': '#',
    'dollar sign': '$', 'percent': '%', 'percent sign': '%',
    'asterisk': '*', 'star': '*', 'slash': '/', 'underscore': '_',
    'new line': '\n', 'newline': '\n', 'new paragraph': '\n\n',
  };
  const NO_SPACE_BEFORE = ['.', ',', '?', '!', ';', ':', ')', ']', '}', '%'];
  const CAPITALIZE_AFTER = new Set(['.', '?', '!', '\n']);

  function processText(text, opts) {
    if (!text) return '';
    let r = text;
    if (opts.vocabReplacements) {
      for (const [w, c] of Object.entries(opts.vocabReplacements)) {
        r = r.replace(new RegExp('\\b' + esc(w) + '\\b', 'gi'), c);
      }
    }
    if (opts.smartPunctuation !== false) {
      const sorted = Object.entries(PUNCTUATION_MAP).sort((a, b) => b[0].length - a[0].length);
      for (const [s, sym] of sorted) r = r.replace(new RegExp('\\b' + esc(s) + '\\b', 'gi'), sym);
    }
    if (opts.autoCapitalize !== false) {
      let out = '', cap = true;
      for (const ch of r) {
        if (cap && /[a-zA-Z]/.test(ch)) { out += ch.toUpperCase(); cap = false; }
        else { out += ch; }
        if (CAPITALIZE_AFTER.has(ch)) cap = true;
      }
      r = out;
    }
    for (const p of NO_SPACE_BEFORE) r = r.replace(new RegExp('\\s+' + esc(p), 'g'), p);
    r = r.replace(/([.?!,;:])([A-Za-z])/g, '$1 $2').replace(/ {2,}/g, ' ');
    return r.trim();
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function parseVocab(entries) {
    const m = {};
    for (const e of (entries || [])) {
      const t = e.trim();
      if (t.includes('=')) { const [w, c] = t.split('=').map(s => s.trim()); if (w && c) m[w] = c; }
    }
    return m;
  }
  function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }




  let capsMode = false;
  let injectionHistory = [];

  function addToHistory(text) {
    injectionHistory.push(text);
    if (injectionHistory.length > 50) injectionHistory.shift();
  }

  function undoLastInjection() {
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;
    if (injectionHistory.length === 0) return false;

    const lastSegment = injectionHistory.pop();
    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        const val = activeInputTarget.value;
        if (val.endsWith(lastSegment)) {
          activeInputTarget.value = val.substring(0, val.length - lastSegment.length);
          activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
          activeInputTarget.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[SpeakScribe] Undid last injection');
          return true;
        }
      } else if (activeInputTarget.isContentEditable || activeInputTarget.getAttribute('role') === 'textbox') {
        const text = activeInputTarget.textContent || '';
        if (text.endsWith(lastSegment)) {
          activeInputTarget.textContent = text.substring(0, text.length - lastSegment.length);
          activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('[SpeakScribe] Undid last injection from contenteditable');
          return true;
        }
      }
    } catch (err) {
      console.warn('[SpeakScribe] Undo failed:', err.message);
    }
    return false;
  }

  function deleteLastWord() {
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;

    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        const val = activeInputTarget.value;
        const trimmed = val.replace(/\s+$/, '');
        const lastSpaceIdx = trimmed.lastIndexOf(' ');
        activeInputTarget.value = lastSpaceIdx >= 0 ? trimmed.substring(0, lastSpaceIdx) : '';
        activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
        activeInputTarget.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[SpeakScribe] Deleted last word');
        return true;
      } else if (activeInputTarget.isContentEditable || activeInputTarget.getAttribute('role') === 'textbox') {
        const text = activeInputTarget.textContent || '';
        const trimmed = text.replace(/\s+$/, '');
        const lastSpaceIdx = trimmed.lastIndexOf(' ');
        activeInputTarget.textContent = lastSpaceIdx >= 0 ? trimmed.substring(0, lastSpaceIdx) : '';
        activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[SpeakScribe] Deleted last word from contenteditable');
        return true;
      }
    } catch (err) {
      console.warn('[SpeakScribe] Delete word failed:', err.message);
    }
    return false;
  }

  function selectAllText() {
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;

    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        activeInputTarget.select();
        console.log('[SpeakScribe] Selected all text');
        return true;
      } else if (activeInputTarget.isContentEditable || activeInputTarget.getAttribute('role') === 'textbox') {
        const range = document.createRange();
        range.selectNodeContents(activeInputTarget);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        console.log('[SpeakScribe] Selected all text in contenteditable');
        return true;
      }
    } catch (err) {
      console.warn('[SpeakScribe] Select all failed:', err.message);
    }
    return false;
  }

  function moveCursorToEnd() {
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;

    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        activeInputTarget.focus();
        activeInputTarget.selectionStart = activeInputTarget.selectionEnd = activeInputTarget.value.length;
        console.log('[SpeakScribe] Moved cursor to end');
        return true;
      } else if (activeInputTarget.isContentEditable || activeInputTarget.getAttribute('role') === 'textbox') {
        activeInputTarget.focus();
        const range = document.createRange();
        range.selectNodeContents(activeInputTarget);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        console.log('[SpeakScribe] Moved cursor to end in contenteditable');
        return true;
      }
    } catch (err) {
      console.warn('[SpeakScribe] Move cursor failed:', err.message);
    }
    return false;
  }

  function moveCursorToStart() {
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;

    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        activeInputTarget.focus();
        activeInputTarget.selectionStart = activeInputTarget.selectionEnd = 0;
        console.log('[SpeakScribe] Moved cursor to start');
        return true;
      } else if (activeInputTarget.isContentEditable || activeInputTarget.getAttribute('role') === 'textbox') {
        activeInputTarget.focus();
        const range = document.createRange();
        range.selectNodeContents(activeInputTarget);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        console.log('[SpeakScribe] Moved cursor to start in contenteditable');
        return true;
      }
    } catch (err) {
      console.warn('[SpeakScribe] Move cursor failed:', err.message);
    }
    return false;
  }

  function clearFieldContent() {
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;

    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        activeInputTarget.value = '';
        activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
        activeInputTarget.dispatchEvent(new Event('change', { bubbles: true }));
        injectionHistory = [];
        console.log('[SpeakScribe] Cleared field content');
        return true;
      } else if (activeInputTarget.isContentEditable || activeInputTarget.getAttribute('role') === 'textbox') {
        activeInputTarget.textContent = '';
        activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
        injectionHistory = [];
        console.log('[SpeakScribe] Cleared field content');
        return true;
      }
    } catch (err) {
      console.warn('[SpeakScribe] Clear field failed:', err.message);
    }
    return false;
  }

  function wrapLastSegmentBold() {
    if (injectionHistory.length === 0) return false;
    if (!activeInputTarget || !document.body.contains(activeInputTarget)) return false;

    const lastSegment = injectionHistory[injectionHistory.length - 1];
    try {
      if (activeInputTarget.tagName === 'TEXTAREA' || activeInputTarget.tagName === 'INPUT') {
        const val = activeInputTarget.value;
        if (val.endsWith(lastSegment)) {
          const before = val.substring(0, val.length - lastSegment.length);
          const bold = '**' + lastSegment + '**';
          activeInputTarget.value = before + bold;
          injectionHistory[injectionHistory.length - 1] = bold;
          activeInputTarget.dispatchEvent(new Event('input', { bubbles: true }));
          activeInputTarget.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[SpeakScribe] Wrapped last segment in bold markers');
          return true;
        }
      }
    } catch (err) {
      console.warn('[SpeakScribe] Bold wrap failed:', err.message);
    }
    return false;
  }

  function checkVoiceCommand(text) {
    const normalized = text.toLowerCase().trim();
    const builtInCommands = {
      'undo that': undoLastInjection,
      'scratch that': undoLastInjection,
      'delete that': undoLastInjection,
      'delete word': deleteLastWord,
      'select all': selectAllText,
      'go to end': moveCursorToEnd,
      'go to the end': moveCursorToEnd,
      'go to start': moveCursorToStart,
      'go to the start': moveCursorToStart,
      'go to beginning': moveCursorToStart,
      'stop listening': () => {
        stopRecognition();
        chrome.runtime.sendMessage({ type: 'SET_RECORDING', value: false }).catch(() => {});
        return true;
      },
      'stop recording': () => {
        stopRecognition();
        chrome.runtime.sendMessage({ type: 'SET_RECORDING', value: false }).catch(() => {});
        return true;
      },
      'clear all': clearFieldContent,
      'clear everything': clearFieldContent,
      'caps on': () => { capsMode = true; console.log('[SpeakScribe] Caps mode ON'); return true; },
      'caps off': () => { capsMode = false; console.log('[SpeakScribe] Caps mode OFF'); return true; },
      'bold that': wrapLastSegmentBold,
    };

    if (builtInCommands[normalized]) {
      return {
        isCommand: true,
        execute: builtInCommands[normalized]
      };
    }

    return { isCommand: false };
  }




  let activeInputTarget = null;

  function isTextInputElement(el) {
    if (!el) return false;
    const tag = el.tagName;

    if (tag === 'TEXTAREA') return true;

    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      const textTypes = ['text', 'search', 'url', 'email', 'tel', 'number'];
      return textTypes.includes(type);
    }

    if (el.isContentEditable) return true;

    if (el.getAttribute('role') === 'textbox') return true;

    return false;
  }

  function findTextInputAncestor(el) {
    let current = el;
    let depth = 0;
    while (current && depth < 10) {
      if (isTextInputElement(current)) return current;
      current = current.parentElement;
      depth++;
    }
    return null;
  }

  function injectTextIntoField(el, text) {
    if (!el || !text) return false;

    try {
      el.focus();

      if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
        const sel = window.getSelection();
        if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }

        const inserted = document.execCommand('insertText', false, text);
        if (inserted) {
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text,
          }));
          return true;
        }

        const textNode = document.createTextNode(text);
        const range2 = sel.getRangeAt(0);
        range2.deleteContents();
        range2.insertNode(textNode);
        range2.setStartAfter(textNode);
        range2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range2);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.focus();
        const inserted = document.execCommand('insertText', false, text);
        if (inserted) return true;

        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const before = el.value.substring(0, start);
        const after = el.value.substring(end);
        el.value = before + text + after;
        el.selectionStart = el.selectionEnd = start + text.length;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, el.value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
      }
    } catch (err) {
      console.warn('[SpeakScribe] Text injection failed:', err.message);
    }
    return false;
  }

  document.addEventListener('focusin', (e) => {
    const target = findTextInputAncestor(e.target);
    if (target) {
      activeInputTarget = target;
      console.log('[SpeakScribe] Tracked input target:', target.tagName, target.className);
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && widget && widget.contains(active)) return;
      if (active && findTextInputAncestor(active)) return;
    }, 100);
  }, true);




  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => {
        return clipboardFallback(text);
      });
    }
    return Promise.resolve(clipboardFallback(text));
  }

  function clipboardFallback(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (e) {
      console.warn('[SpeakScribe] Clipboard fallback failed:', e.message);
      return false;
    }
  }




  let micStream = null;

  async function ensureMicPermission() {
    try {
      const permState = await navigator.permissions.query({ name: 'microphone' });
      if (permState.state === 'granted') {
        console.log('[SpeakScribe] Mic permission already granted');
        return true;
      }
    } catch (e) {
      console.log('[SpeakScribe] Could not query mic permission, will try getUserMedia');
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[SpeakScribe] Mic access granted via getUserMedia');
      return true;
    } catch (err) {
      console.error('[SpeakScribe] Mic access denied:', err.name, err.message);
      return false;
    }
  }

  function releaseMicStream() {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
  }




  let recognition = null;
  let isListening = false;
  let manualStop = false;
  let restartTimer = null;
  let restartCount = 0;
  let currentSettings = {};
  let fullTranscript = '';
  let transcriptLines = [];
  let lastInjectedFinalText = '';
  let meetingModeActive = false;
  let bubbleClearTimer = null;

  function createRecognition(settings) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.error('[SpeakScribe] Web Speech API not supported.');
      showError('Web Speech API not supported in this browser.');
      return null;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = settings.language || 'en-US';
    rec.maxAlternatives = 1;
    const vocR = parseVocab(settings.customVocab);
    const pOpts = {
      smartPunctuation: settings.smartPunctuation,
      autoCapitalize: settings.autoCapitalize,
      vocabReplacements: vocR,
    };

    rec.onresult = (event) => {
      restartCount = 0;
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      if (interim) {
        const p = processText(interim, pOpts);
        updateBubble(fullTranscript, p);
        broadcast(p, false);
      }
      if (final) {
        const p = processText(final, pOpts);


        const cmdCheck = checkVoiceCommand(p);
        if (cmdCheck.isCommand) {
          cmdCheck.execute();
          console.log('[SpeakScribe] Voice command executed:', p);
          return;
        }

        const ts = new Date().toLocaleTimeString();
        transcriptLines.push({ text: p, timestamp: ts });
        fullTranscript += (fullTranscript ? ' ' : '') + p;
        updateBubble(fullTranscript, '');
        broadcast(p, true, ts);


        let textToInject = p;
        if (capsMode) {
          textToInject = textToInject.toUpperCase();
        }

        if (activeInputTarget && document.body.contains(activeInputTarget)) {
          const prefix = lastInjectedFinalText ? ' ' : '';
          const finalText = prefix + textToInject;
          const injected = injectTextIntoField(activeInputTarget, finalText);
          if (injected) {
            lastInjectedFinalText = textToInject;
            addToHistory(textToInject);
            console.log('[SpeakScribe] Injected text into field:', textToInject.substring(0, 50));


            if (bubbleClearTimer) clearTimeout(bubbleClearTimer);
            bubbleClearTimer = setTimeout(() => {
              fullTranscript = '';
              transcriptLines = [];
              updateBubble('', '');
            }, 800);
          }
        }
      }
    };

    rec.onaudiostart = () => {
      console.log('[SpeakScribe] Audio capture started (mic is working)');
      releaseMicStream();
      showStatus('Listening... speak now');
    };

    rec.onspeechstart = () => {
      console.log('[SpeakScribe] Speech detected');
    };

    rec.onerror = (event) => {
      const silentErrors = ['no-speech', 'aborted'];
      if (silentErrors.includes(event.error)) {
        console.log('[SpeakScribe] Recognition event:', event.error, '(normal, restarting)');
      } else {
        console.warn('[SpeakScribe] Recognition error:', event.error, event.message || '');
      }

      switch (event.error) {
        case 'not-allowed':
          showError('Microphone access denied. Click the lock icon in the address bar to allow mic access, then try again.');
          stopRecognition();
          chrome.runtime.sendMessage({ type: 'SET_RECORDING', value: false }).catch(() => {});
          return;

        case 'audio-capture':
          showError('No microphone found. Please connect a mic and try again.');
          stopRecognition();
          chrome.runtime.sendMessage({ type: 'SET_RECORDING', value: false }).catch(() => {});
          return;

        case 'network':
          showError('Network error. Web Speech API needs internet. Check your connection.');
          if (restartCount < 3 && isListening && !manualStop) {
            restartCount++;
            scheduleRestart(2000);
          } else {
            stopRecognition();
          }
          return;

        case 'no-speech':
          if (isListening && !manualStop) {
            scheduleRestart(300);
          }
          return;

        case 'aborted':
          return;

        default:
          showError('Error: ' + event.error);
          restartCount++;
          if (restartCount < 5 && isListening && !manualStop) {
            scheduleRestart(1000);
          } else {
            stopRecognition();
          }
      }
    };

    rec.onend = () => {
      console.log('[SpeakScribe] Recognition ended. isListening:', isListening, 'manualStop:', manualStop);
      if (isListening && !manualStop && settings.continuous !== false) {
        scheduleRestart(300);
      } else {
        isListening = false;
        updateFabState(false);
      }
    };

    rec.onstart = () => {
      console.log('[SpeakScribe] Recognition started successfully');
      updateFabState(true);
    };

    return rec;
  }

  async function startRecognition(settings) {
    currentSettings = settings;
    manualStop = false;
    restartCount = 0;
    lastInjectedFinalText = '';

    fullTranscript = '';
    transcriptLines = [];
    injectionHistory = [];
    updateBubble('', '');

    showStatus('Requesting microphone access...');
    const hasMic = await ensureMicPermission();
    if (!hasMic) {
      showError('Microphone access denied. Click the lock icon in the address bar to allow mic access.');
      updateFabState(false);
      return;
    }

    if (recognition) { try { recognition.abort(); } catch (e) {} }
    recognition = createRecognition(settings);
    if (!recognition) return;

    isListening = true;
    showStatus('Starting speech recognition...');

    try {
      recognition.start();
      console.log('[SpeakScribe] recognition.start() called successfully');
    } catch (e) {
      console.error('[SpeakScribe] Start failed:', e.message);
      try { recognition.abort(); } catch (e2) {}
      setTimeout(() => {
        try {
          recognition.start();
          console.log('[SpeakScribe] Retry start succeeded');
        } catch (e3) {
          console.error('[SpeakScribe] Retry also failed:', e3.message);
          showError('Could not start speech recognition: ' + e3.message);
          isListening = false;
          updateFabState(false);
        }
      }, 500);
    }
  }

  function stopRecognition() {
    manualStop = true;
    isListening = false;
    restartCount = 0;
    lastInjectedFinalText = '';
    capsMode = false;
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    releaseMicStream();
    updateFabState(false);

    fullTranscript = '';
    transcriptLines = [];
    injectionHistory = [];
    updateBubble('', '');
    chrome.runtime.sendMessage({ type: 'CLEAR_TRANSCRIPT' }).catch(() => {});
  }

  function scheduleRestart(ms) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (!isListening || manualStop) return;
      try {
        recognition.start();
      } catch (e) {
        recognition = createRecognition(currentSettings);
        if (recognition) {
          setTimeout(() => { try { recognition.start(); } catch (e2) {} }, 500);
        }
      }
    }, ms);
  }

  function broadcast(text, isFinal, timestamp) {
    const msg = { type: 'TRANSCRIPT_UPDATE', text, isFinal, timestamp: timestamp || '' };
    chrome.runtime.sendMessage(msg).catch(() => {});
    chrome.runtime.sendMessage({ type: 'CONTENT_TRANSCRIPT', text, isFinal, timestamp }).catch(() => {});
  }




  let widget = null;
  let fab = null;
  let bubble = null;
  let actionsRow = null;
  let commandPalette = null;

  function buildWidget() {
    if (widget) return;

    widget = document.createElement('div');
    widget.id = 'speakscribe-widget';

    widget.style.bottom = '24px';
    widget.style.right = '24px';


    fab = document.createElement('button');
    fab.id = 'speakscribe-fab';
    const fabIcon = document.createElement('img');
    fabIcon.src = chrome.runtime.getURL('icons/ui/mic-32.png');
    fabIcon.alt = 'Mic';
    fabIcon.className = 'ss-fab-icon';
    fabIcon.id = 'speakscribe-fab-icon';
    fab.appendChild(fabIcon);
    fab.title = 'SpeakScribe: Click to start, drag to move';


    const floatPanel = document.createElement('div');
    floatPanel.id = 'speakscribe-float-panel';

    bubble = document.createElement('div');
    bubble.id = 'speakscribe-bubble';
    bubble.innerHTML = '<span class="ss-empty">Click the mic to start transcribing</span>';

    actionsRow = document.createElement('div');
    actionsRow.id = 'speakscribe-actions';

    const copyBtn = makeActionBtn('icons/ui/copy-24.png', 'Copy transcript', () => {
      if (fullTranscript.trim()) {
        copyToClipboard(fullTranscript).then((ok) => {
          if (ok) {
            copyBtn.textContent = '\u2713';
            setTimeout(() => { copyBtn.innerHTML = ''; const img = document.createElement('img'); img.src = chrome.runtime.getURL('icons/ui/copy-24.png'); img.alt = 'Copy'; img.className = 'ss-action-icon'; copyBtn.appendChild(img); }, 1200);
          } else {
            copyBtn.textContent = '\u2717';
            setTimeout(() => { copyBtn.innerHTML = ''; const img = document.createElement('img'); img.src = chrome.runtime.getURL('icons/ui/copy-24.png'); img.alt = 'Copy'; img.className = 'ss-action-icon'; copyBtn.appendChild(img); }, 1200);
          }
        });
      }
    });

    const clearBtn = makeActionBtn('icons/ui/delete-24.png', 'Clear transcript', () => {
      fullTranscript = '';
      transcriptLines = [];
      lastInjectedFinalText = '';
      injectionHistory = [];
      updateBubble('', '');
      chrome.runtime.sendMessage({ type: 'CLEAR_TRANSCRIPT' }).catch(() => {});
    });

    const overlayBtn = makeActionBtn('icons/ui/overlay-24.png', 'Open overlay', async () => {
      const allowed = await checkLicenseFeature('floatingOverlay');
      if (!allowed) {
        showUpgradePrompt('Floating overlay');
        return;
      }
      chrome.runtime.sendMessage({ type: 'OPEN_FLOATING' }).catch(() => {});
    });

    const hideBtn = makeActionBtn('icons/ui/delete-24.png', 'Hide SpeakScribe', () => {
      if (isRecording) {
        if (!confirm('Recording is active. Hide SpeakScribe anyway?')) return;
      }
      widget.style.display = 'none';
      // Show again via keyboard shortcut or popup
      chrome.runtime.sendMessage({ type: 'WIDGET_HIDDEN' }).catch(() => {});
    });
    hideBtn.className = 'ss-action-btn ss-hide-btn';
    hideBtn.innerHTML = '\u2715';
    hideBtn.title = 'Hide SpeakScribe widget';

    actionsRow.append(copyBtn, clearBtn, overlayBtn, hideBtn);

    commandPalette = document.createElement('div');
    commandPalette.id = 'speakscribe-cmd-palette';
    commandPalette.style.cssText = 'display:none;';
    buildCommandPalette();


    floatPanel.append(bubble, actionsRow, commandPalette);


    widget.append(floatPanel, fab);
    document.body.appendChild(widget);

    setupDrag();
    setupFabClick();
    setupHoverExpand();
    loadPosition();
  }

  function buildCommandPalette() {
    const cmds = [
      { trigger: 'Undo that', desc: 'Remove last text' },
      { trigger: 'Delete word', desc: 'Delete last word' },
      { trigger: 'Clear all', desc: 'Clear field' },
      { trigger: 'Select all', desc: 'Select all text' },
      { trigger: 'Go to end', desc: 'Cursor to end' },
      { trigger: 'Go to start', desc: 'Cursor to start' },
      { trigger: 'Caps on/off', desc: 'Toggle caps mode' },
      { trigger: 'Bold that', desc: 'Wrap in **' },
      { trigger: 'Stop listening', desc: 'Stop recording' },
    ];

    let paletteHtml = '<div class="ss-cmd-header">Voice Commands</div>';
    paletteHtml += '<div class="ss-cmd-grid">';
    for (const cmd of cmds) {
      paletteHtml += `<div class="ss-cmd-item"><span class="ss-cmd-trigger">${escHtml(cmd.trigger)}</span><span class="ss-cmd-desc">${escHtml(cmd.desc)}</span></div>`;
    }
    paletteHtml += '</div>';

    commandPalette.innerHTML = paletteHtml;
  }

  function getIconUrl(name) {
    return chrome.runtime.getURL('icons/ui/' + name);
  }

  function makeActionBtn(iconSrc, titleText, onClick) {
    const btn = document.createElement('button');
    btn.className = 'ss-action-btn';
    if (iconSrc.startsWith('icons/')) {
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL(iconSrc);
      img.alt = titleText;
      img.className = 'ss-action-icon';
      btn.appendChild(img);
    } else {
      btn.textContent = iconSrc;
    }
    btn.title = titleText;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }




  let _isDragging = false;
  let _hasDragged = false;

  function setupDrag() {
    let startX, startY, startLeft, startTop;

    fab.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      _isDragging = true;
      _hasDragged = false;
      fab.classList.add('dragging');

      const rect = fab.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!_isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) _hasDragged = true;
      if (!_hasDragged) return;

      const fabSize = 36;
      let newRight = window.innerWidth - (startLeft + dx) - fabSize;
      let newBottom = window.innerHeight - (startTop + dy) - fabSize;
      newRight = Math.max(0, Math.min(newRight, window.innerWidth - fabSize));
      newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - fabSize));
      widget.style.right = newRight + 'px';
      widget.style.bottom = newBottom + 'px';
      widget.style.left = 'auto';
      widget.style.top = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!_isDragging) return;
      _isDragging = false;
      fab.classList.remove('dragging');
      if (_hasDragged) { savePosition(); _hasDragged = false; }
    });

    fab.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      _isDragging = true;
      _hasDragged = false;
      const rect = fab.getBoundingClientRect();
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = rect.left;
      startTop = rect.top;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!_isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) _hasDragged = true;
      if (!_hasDragged) return;
      const fabSize = 36;
      let newRight = window.innerWidth - (startLeft + dx) - fabSize;
      let newBottom = window.innerHeight - (startTop + dy) - fabSize;
      newRight = Math.max(0, Math.min(newRight, window.innerWidth - fabSize));
      newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - fabSize));
      widget.style.right = newRight + 'px';
      widget.style.bottom = newBottom + 'px';
      widget.style.left = 'auto';
      widget.style.top = 'auto';
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (!_isDragging) return;
      _isDragging = false;
      if (_hasDragged) { savePosition(); _hasDragged = false; }
    });
  }




  function setupFabClick() {
    let mouseDownTime = 0;
    fab.addEventListener('mousedown', () => { mouseDownTime = Date.now(); });
    fab.addEventListener('mouseup', () => {
      if (Date.now() - mouseDownTime < 300 && !_hasDragged) {
        toggleRecording();
      }
    });
    fab.addEventListener('touchend', (e) => {
      if (!_hasDragged) { e.preventDefault(); toggleRecording(); }
    });
  }




  function setupHoverExpand() {
    let hoverTimer;
    widget.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      widget.classList.add('expanded');
      if (fullTranscript || isListening) bubble.classList.add('visible');

    });
    widget.addEventListener('mouseleave', () => {
      hoverTimer = setTimeout(() => {
        widget.classList.remove('expanded');
        if (!isListening) bubble.classList.remove('visible');
        hideCommandPalette();
      }, 800);
    });
  }

  function showCommandPalette() {
    if (!commandPalette) return;
    chrome.storage.local.get('settings', (data) => {
      const s = data.settings || {};
      if (s.showCommandPalette === false) return;
      commandPalette.style.display = 'block';
      if (commandPalette._hideTimer) clearTimeout(commandPalette._hideTimer);
      commandPalette._hideTimer = setTimeout(() => {
        if (!widget.matches(':hover')) hideCommandPalette();
      }, 5000);
    });
  }

  function hideCommandPalette() {
    if (!commandPalette) return;
    if (commandPalette._hideTimer) clearTimeout(commandPalette._hideTimer);
    commandPalette.style.display = 'none';
  }




  function checkLicenseFeature(feature) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_FEATURE', feature }, (response) => {
        if (chrome.runtime.lastError) { resolve(true); return; }
        resolve(response && response.allowed);
      });
    });
  }

  function checkLicenseLanguage(lang) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_LANGUAGE', language: lang }, (response) => {
        if (chrome.runtime.lastError) { resolve(true); return; }
        resolve(response && response.allowed);
      });
    });
  }

  function showUpgradePrompt(featureName) {
    if (!bubble) return;
    bubble.classList.add('visible');
    bubble.innerHTML = '<div class="ss-upgrade-prompt">' +
      '<span class="ss-upgrade-icon">&#128274;</span> ' +
      '<span class="ss-upgrade-text">' + escHtml(featureName) + ' requires SpeakScribe Pro</span>' +
      '<button class="ss-upgrade-btn" id="ss-upgrade-cta">Upgrade</button>' +
      '</div>';

    const btn = bubble.querySelector('#ss-upgrade-cta');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'OPEN_UPGRADE' }).catch(() => {});
      });
    }

    setTimeout(() => {
      if (bubble && bubble.querySelector('.ss-upgrade-prompt')) {
        bubble.innerHTML = '<span class="ss-empty">Click the mic to start transcribing</span>';
        if (!isListening && !widget.matches(':hover')) bubble.classList.remove('visible');
      }
    }, 5000);
  }

  async function toggleRecording() {
    if (isListening) {
      stopRecognition();
      chrome.runtime.sendMessage({ type: 'SET_RECORDING', value: false }).catch(() => {});
    } else {
      const data = await new Promise(r => chrome.storage.local.get('settings', r));
      const s = data.settings || {};

      const siteSettings = await new Promise(r => chrome.storage.local.get('siteSettings', r));
      let settings = {
        language: s.language || 'en-US',
        continuous: s.continuousListening !== false,
        smartPunctuation: s.smartPunctuation !== false,
        autoCapitalize: s.autoCapitalize !== false,
        customVocab: s.customVocab || [],
      };

      if (siteSettings.siteSettings && siteSettings.siteSettings[window.location.hostname]) {
        const hasSitePerm = await checkLicenseFeature('perSiteSettings');
        if (hasSitePerm) {
          const siteSetting = siteSettings.siteSettings[window.location.hostname];
          if (siteSetting.language) settings.language = siteSetting.language;
          if (siteSetting.smartPunctuation !== undefined) settings.smartPunctuation = siteSetting.smartPunctuation;
          if (siteSetting.autoCapitalize !== undefined) settings.autoCapitalize = siteSetting.autoCapitalize;
        }
      }

      const langAllowed = await checkLicenseLanguage(settings.language);
      if (!langAllowed) {
        showUpgradePrompt('Language: ' + settings.language);
        settings.language = 'en-US';
      }

      const contAllowed = await checkLicenseFeature('continuousListening');
      if (!contAllowed) {
        settings.continuous = false;
      }

      await startRecognition(settings);
      chrome.runtime.sendMessage({ type: 'SET_RECORDING', value: true }).catch(() => {});
    }
  }




  function updateFabState(recording) {
    if (!fab) return;
    if (recording) {
      fab.classList.add('recording');
      bubble.classList.add('visible');
    } else {
      fab.classList.remove('recording');
      if (!widget.matches(':hover')) bubble.classList.remove('visible');
    }
  }

  function updateBubble(finalText, interimText) {
    if (!bubble) return;
    if (!finalText && !interimText) {
      bubble.innerHTML = '<span class="ss-empty">Click the mic to start transcribing</span>';
      return;
    }
    let html = '';
    if (finalText) html += escHtml(finalText);
    if (interimText) html += '<span class="ss-interim"> ' + escHtml(interimText) + '</span>';
    bubble.innerHTML = html;
    bubble.scrollTop = bubble.scrollHeight;
  }

  function showStatus(msg) {
    if (!bubble) return;
    bubble.classList.add('visible');
    bubble.innerHTML = '<span class="ss-empty">' + escHtml(msg) + '</span>';
  }

  function showError(msg) {
    if (!bubble) return;
    bubble.classList.add('visible');
    bubble.innerHTML = '<span style="color: #ff6b6b; font-size: 12px;">' + escHtml(msg) + '</span>';
  }




  function savePosition() {
    if (!widget) return;

    const rect = fab.getBoundingClientRect();
    chrome.storage.local.set({
      widgetPosition: {
        rightPct: (window.innerWidth - rect.right) / window.innerWidth,
        bottomPct: (window.innerHeight - rect.bottom) / window.innerHeight,
      }
    }).catch(() => {});
  }

  function loadPosition() {
    chrome.storage.local.get('widgetPosition', (data) => {
      if (data.widgetPosition) {
        const { rightPct, bottomPct } = data.widgetPosition;
        const r = Math.max(0, Math.min(rightPct * window.innerWidth, window.innerWidth - 50));
        const b = Math.max(0, Math.min(bottomPct * window.innerHeight, window.innerHeight - 50));
        widget.style.right = r + 'px';
        widget.style.bottom = b + 'px';
        widget.style.left = 'auto';
        widget.style.top = 'auto';
      }
    });
  }




  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'START_RECOGNITION':
        startRecognition(message.settings || {});
        sendResponse({ success: true });
        break;
      case 'STOP_RECOGNITION':
        stopRecognition();
        sendResponse({ success: true });
        break;
      case 'STATE_UPDATE':
        if (message.isRecording && !isListening) updateFabState(true);
        else if (!message.isRecording && isListening) stopRecognition();
        else if (!message.isRecording) updateFabState(false);
        sendResponse({ received: true });
        break;
      case 'MEETING_MODE_STATE':
        meetingModeActive = message.isActive || false;
        if (meetingModeActive) {
          fab.classList.add('ss-meeting-mode');
          fab.title = 'SpeakScribe (Meeting Mode)';
        } else {
          fab.classList.remove('ss-meeting-mode');
          fab.title = 'SpeakScribe: Click to start, drag to move';
        }
        sendResponse({ received: true });
        break;
      case 'MEETING_AUDIO_DATA':
        if (message.text) {
          const ts = new Date().toLocaleTimeString();
          transcriptLines.push({ text: message.text, timestamp: ts });
          fullTranscript += (fullTranscript ? ' ' : '') + message.text;
          updateBubble(fullTranscript, '');
          broadcast(message.text, true, ts);
        }
        sendResponse({ received: true });
        break;
      case 'SHOW_WIDGET':
        if (widget) {
          widget.style.display = '';
        }
        sendResponse({ received: true });
        break;
      default:
        sendResponse({ received: true });
    }
    return true;
  });




  function init() {
    buildWidget();
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.isRecording) {
        chrome.storage.local.get('settings', (data) => {
          const s = data.settings || {};
          startRecognition({
            language: s.language || 'en-US',
            continuous: s.continuousListening !== false,
            smartPunctuation: s.smartPunctuation !== false,
            autoCapitalize: s.autoCapitalize !== false,
            customVocab: s.customVocab || [],
          });
        });
      }
    });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  console.log('[SpeakScribe] Content script loaded (v2.0)');
})();
