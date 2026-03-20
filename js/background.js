importScripts('license.js');
importScripts('defaults.js');

let floatingWindowId = null;
let isRecording = false;
let currentTranscript = '';
let transcriptLines = [];
let isMeetingMode = false;
let meetingTabId = null;
let offscreenCreated = false;

// --- Fix #5: Restore transcript state from session storage on SW restart ---
chrome.storage.session.get(['transcriptLines', 'currentTranscript', 'isRecording']).then((data) => {
  if (data.transcriptLines) transcriptLines = data.transcriptLines;
  if (data.currentTranscript) currentTranscript = data.currentTranscript;
  if (data.isRecording) isRecording = data.isRecording;
}).catch(() => {});

// Debounced persistence of transcript state to session storage
let _persistTimer = null;
function persistTranscriptState() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    chrome.storage.session.set({
      transcriptLines,
      currentTranscript,
      isRecording
    }).catch(() => {});
  }, 500);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'GET_STATE':
      sendResponse({
        floatingWindowId,
        isRecording,
        currentTranscript,
        transcriptLines,
        isMeetingMode,
        meetingTabId
      });
      break;

    case 'SET_RECORDING':
      isRecording = request.value !== undefined ? request.value : request.status;
      broadcastState();
      persistTranscriptState();
      sendResponse({ success: true });
      break;

    case 'TRANSCRIPT_UPDATE':
      handleTranscriptUpdate(request.data || request);
      sendResponse({ success: true });
      break;

    case 'CLEAR_TRANSCRIPT':
      currentTranscript = '';
      transcriptLines = [];
      broadcastTranscript();
      persistTranscriptState();
      sendResponse({ success: true });
      break;

    case 'OPEN_FLOATING':
      openFloatingWindow().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        console.error('Error opening floating window:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'CLOSE_FLOATING':
      closeFloatingWindow();
      sendResponse({ success: true });
      break;

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage().catch(err => {
        console.error('Error opening options page:', err);
      });
      sendResponse({ success: true });
      break;

    case 'EXPORT_TRANSCRIPT':
      exportTranscript(request.format).then(result => {
        sendResponse({ success: true, data: result });
      }).catch(err => {
        console.error('Error exporting transcript:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'TOGGLE_MEETING_MODE':
      toggleMeetingMode().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        console.error('Error toggling meeting mode:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'START_DEEPGRAM':
      startDeepgramCapture(request).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        console.error('Error starting Deepgram:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'STOP_DEEPGRAM':
      stopDeepgramCapture().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false });
      });
      return true;

    case 'DEEPGRAM_TRANSCRIPT':
      // Forward Deepgram transcripts from offscreen to popup and content scripts
      if (request.isFinal && request.text) {
        transcriptLines.push({ text: request.text, startMs: request.timestamp || Date.now() });
        currentTranscript += (currentTranscript ? ' ' : '') + request.text;
        persistTranscriptState();
      }
      broadcastTranscript();
      // Forward to popup
      chrome.runtime.sendMessage({
        type: 'DEEPGRAM_TRANSCRIPT',
        text: request.text,
        isFinal: request.isFinal,
        timestamp: request.isFinal ? new Date().toLocaleTimeString() : '',
      }).catch(() => {});
      // Forward to all content scripts (for floating widget display + text injection)
      chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'DEEPGRAM_TRANSCRIPT',
              text: request.text,
              isFinal: request.isFinal,
              timestamp: request.isFinal ? new Date().toLocaleTimeString() : '',
            }).catch(() => {});
          }
        }
      }).catch(() => {});
      sendResponse({ received: true });
      break;

    case 'DEEPGRAM_STARTED':
      isRecording = true;
      persistTranscriptState();
      broadcastState();
      // Forward to content scripts so widget updates
      chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'DEEPGRAM_STARTED' }).catch(() => {});
          }
        }
      }).catch(() => {});
      sendResponse({ received: true });
      break;

    case 'DEEPGRAM_STOPPED':
      isRecording = false;
      persistTranscriptState();
      broadcastState();
      // Forward to content scripts
      chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'DEEPGRAM_STOPPED', reason: request.reason }).catch(() => {});
          }
        }
      }).catch(() => {});
      sendResponse({ received: true });
      break;

    case 'DEEPGRAM_ERROR':
      console.error('Deepgram error from offscreen:', request.error);
      isRecording = false;
      broadcastState();
      // Forward to content scripts
      chrome.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'DEEPGRAM_ERROR', error: request.error }).catch(() => {});
          }
        }
      }).catch(() => {});
      sendResponse({ received: true });
      break;

    case 'SET_SITE_SETTINGS':
      setSiteSettings(request.hostname, request.settings).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        console.error('Error setting site settings:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'GET_SITE_SETTINGS':
      getSiteSettings(request.hostname).then(settings => {
        sendResponse({ success: true, settings });
      }).catch(err => {
        console.error('Error getting site settings:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'MEETING_TRANSCRIPT':
      handleMeetingTranscript(request.data || request).catch(err => {
        console.error('Error handling meeting transcript:', err);
      });
      sendResponse({ success: true });
      break;

    case 'GET_LICENSE_INFO':
      SpeakScribeLicense.getLicenseInfo().then(info => {
        sendResponse(info);
      }).catch(err => {
        console.error('Error getting license info:', err);
        sendResponse({ tier: 'free', isPro: false, error: err.message });
      });
      return true;

    case 'ACTIVATE_LICENSE':
      SpeakScribeLicense.activateLicense(request.licenseKey).then(result => {
        sendResponse(result);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'DEACTIVATE_LICENSE':
      SpeakScribeLicense.deactivateLicense().then(result => {
        sendResponse(result);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'START_TRIAL':
      SpeakScribeLicense.startTrial().then(result => {
        sendResponse(result);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'CHECK_FEATURE':
      SpeakScribeLicense.hasFeature(request.feature).then(allowed => {
        sendResponse({ allowed });
      }).catch(err => {
        sendResponse({ allowed: false, error: err.message });
      });
      return true;

    case 'CHECK_LANGUAGE':
      SpeakScribeLicense.isLanguageAllowed(request.language).then(allowed => {
        sendResponse({ allowed });
      }).catch(err => {
        sendResponse({ allowed: false, error: err.message });
      });
      return true;

    case 'CHECK_EXPORT_FORMAT':
      SpeakScribeLicense.isExportFormatAllowed(request.format).then(allowed => {
        sendResponse({ allowed });
      }).catch(err => {
        sendResponse({ allowed: false, error: err.message });
      });
      return true;

    case 'VALIDATE_LICENSE':
      SpeakScribeLicense.validateLicense().then(result => {
        sendResponse(result);
      }).catch(err => {
        sendResponse({ valid: false, error: err.message });
      });
      return true;

    case 'GET_SESSION_LIMIT':
      SpeakScribeLicense.getSessionLimit().then(limitMs => {
        sendResponse({ limitMs });
      }).catch(err => {
        sendResponse({ limitMs: SpeakScribeLicense.FREE_SESSION_LIMIT_MS });
      });
      return true;

    case 'OPEN_UPGRADE':
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/upgrade.html') });
      sendResponse({ success: true });
      break;

    case 'WIDGET_HIDDEN':
      // Track that widget is hidden for this tab
      if (sender.tab && sender.tab.id) {
        chrome.storage.session.set({ ['widget_hidden_' + sender.tab.id]: true }).catch(() => {});
      }
      sendResponse({ success: true });
      break;

    case 'GET_WIDGET_STATE':
      // Check if widget is hidden for the active tab
      if (request.tabId) {
        chrome.storage.session.get('widget_hidden_' + request.tabId).then((data) => {
          sendResponse({ hidden: !!data['widget_hidden_' + request.tabId] });
        }).catch(() => sendResponse({ hidden: false }));
        return true;
      }
      sendResponse({ hidden: false });
      break;

    default:
      console.warn('Unknown message type:', request.type);
  }
});

chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'toggle-transcription':
      handleToggleTranscription();
      break;

    case 'toggle-overlay':
      handleToggleOverlay();
      break;

    case 'toggle-meeting':
      toggleMeetingMode().catch(err => {
        console.error('Error toggling meeting mode via shortcut:', err);
      });
      break;

    default:
      console.warn('Unknown command:', command);
  }
});

// --- Fix #3: Use canonical 'settings' key with shared defaults ---
async function handleToggleTranscription() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tabs.length === 0) return;

  const activeTab = tabs[0];
  const result = await chrome.storage.local.get('settings').catch(() => ({}));
  const settings = result.settings || SpeakScribeDefaults;

  if (isRecording) {
    chrome.tabs.sendMessage(activeTab.id, {
      type: 'STOP_RECOGNITION'
    }).catch(err => {
      console.error('Error sending stop recognition:', err);
    });
  } else {
    chrome.tabs.sendMessage(activeTab.id, {
      type: 'START_RECOGNITION',
      settings: settings
    }).catch(err => {
      console.error('Error sending start recognition:', err);
    });
  }
}

function handleToggleOverlay() {
  if (floatingWindowId) {
    closeFloatingWindow();
  } else {
    openFloatingWindow().catch(err => {
      console.error('Error opening floating window from shortcut:', err);
    });
  }
}

async function openFloatingWindow() {
  if (floatingWindowId) {
    const windows = await chrome.windows.getAll().catch(() => []);
    const exists = windows.some(w => w.id === floatingWindowId);
    if (exists) {
      chrome.windows.update(floatingWindowId, { focused: true }).catch(err => {
        console.error('Error focusing floating window:', err);
      });
      return;
    }
  }

  await createFloatingWindow();
}

async function createFloatingWindow() {
  try {
    // Position the floating window at the right edge of the current display
    let left = 100;
    let top = 100;
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow && currentWindow.width && currentWindow.left !== undefined) {
        // Place to the right of the current window, or at right edge of screen
        left = Math.max(0, (currentWindow.left + currentWindow.width) - 440);
        top = currentWindow.top + 50;
      }
    } catch (e) {
      // Fall back to reasonable defaults
      left = 100;
      top = 100;
    }

    const windowInfo = await chrome.windows.create({
      url: chrome.runtime.getURL('pages/floating.html'),
      type: 'popup',
      width: 420,
      height: 600,
      left: left,
      top: top,
      focused: true
    });

    floatingWindowId = windowInfo.id;
    broadcastState();
  } catch (err) {
    console.error('Error creating floating window:', err);
  }
}

function closeFloatingWindow() {
  if (floatingWindowId) {
    chrome.windows.remove(floatingWindowId).catch(err => {
      console.error('Error closing floating window:', err);
    });
    floatingWindowId = null;
    broadcastState();
  }
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === floatingWindowId) {
    floatingWindowId = null;
    broadcastState();
  }
});

// --- Fix #4: Store numeric startMs for real SRT timestamps ---
function handleTranscriptUpdate(data) {
  const { text, isFinal, timestamp } = data;

  if (isFinal) {
    currentTranscript += (currentTranscript ? ' ' : '') + text;
    transcriptLines.push({
      text,
      timestamp: timestamp || new Date().toISOString(),
      startMs: Date.now()
    });
    persistTranscriptState();
  }

  broadcastTranscript();
}

// --- Fix #14: Broadcast transcript to both extension pages AND content scripts ---
function broadcastTranscript() {
  // Broadcast to extension pages (popup, floating, options)
  chrome.runtime.sendMessage({
    type: 'TRANSCRIPT_UPDATED',
    currentTranscript,
    transcriptLines
  }).catch(() => {});

  // Also broadcast to all content scripts
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TRANSCRIPT_BROADCAST',
          currentTranscript,
          transcriptLines
        }).catch(() => {});
      }
    }
  }).catch(() => {});
}

function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    floatingWindowId,
    isRecording,
    currentTranscript,
    transcriptLines,
    isMeetingMode,
    meetingTabId
  }).catch(() => {});
}

// --- Fix #7: Pass user language to meeting capture ---
async function handleMeetingTranscript(data) {
  const { text, isFinal, timestamp } = data;

  if (isFinal) {
    currentTranscript += (currentTranscript ? ' ' : '') + text;
    transcriptLines.push({
      text,
      timestamp: timestamp || new Date().toISOString(),
      startMs: Date.now()
    });
    persistTranscriptState();
  }

  const tabs = await chrome.tabs.query({}).catch(() => []);
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'MEETING_TRANSCRIPT_UPDATE',
      text,
      isFinal,
      timestamp
    }).catch(() => {});
  }

  broadcastTranscript();
}

async function exportTranscript(format) {
  if (!format || format === 'txt') {
    return exportAsText();
  } else if (format === 'json') {
    return exportAsJSON();
  } else if (format === 'srt') {
    return exportAsSRT();
  } else if (format === 'md') {
    return exportAsMarkdown();
  } else {
    throw new Error('Unsupported export format: ' + format);
  }
}

function exportAsText() {
  let output = '';
  for (const line of transcriptLines) {
    const time = formatTimestamp(line.timestamp);
    output += '[' + time + '] ' + line.text + '\n';
  }
  return output;
}

function exportAsJSON() {
  return JSON.stringify({
    transcript: currentTranscript,
    lines: transcriptLines,
    exportedAt: new Date().toISOString()
  }, null, 2);
}

// --- Fix #4: Use real timestamps for SRT export ---
function exportAsSRT() {
  let output = '';

  // Determine the recording start time from the first line
  const baseMs = transcriptLines.length > 0 ? transcriptLines[0].startMs : 0;

  for (let i = 0; i < transcriptLines.length; i++) {
    const line = transcriptLines[i];
    // Offset from the beginning of the recording
    const startOffset = (line.startMs || 0) - baseMs;
    // End time: use next line's start if available, otherwise add a reasonable duration
    let endOffset;
    if (i + 1 < transcriptLines.length) {
      endOffset = (transcriptLines[i + 1].startMs || 0) - baseMs;
    } else {
      // Estimate duration for last line: ~80ms per word, minimum 2 seconds
      const wordCount = line.text.split(/\s+/).length;
      endOffset = startOffset + Math.max(2000, wordCount * 80);
    }

    const entryNumber = i + 1;
    const startTimeFormatted = formatSRTTime(Math.max(0, startOffset));
    const endTimeFormatted = formatSRTTime(Math.max(0, endOffset));

    output += entryNumber + '\n';
    output += startTimeFormatted + ' --> ' + endTimeFormatted + '\n';
    output += line.text + '\n';
    output += '\n';
  }

  return output;
}

function exportAsMarkdown() {
  let output = '# Transcript\n\n';

  for (const line of transcriptLines) {
    const time = formatTimestamp(line.timestamp);
    output += '**[' + time + ']** ' + line.text + '\n\n';
  }

  const wordCount = currentTranscript.split(/\s+/).length;
  output += '---\n\n';
  output += '**Summary**\n\n';
  output += '- Total words: ' + wordCount + '\n';
  output += '- Total lines: ' + transcriptLines.length + '\n';
  output += '- Exported: ' + new Date().toLocaleString() + '\n';

  return output;
}

function formatTimestamp(isoString) {
  try {
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return hours + ':' + minutes + ':' + seconds;
  } catch (err) {
    return '00:00:00';
  }
}

function formatSRTTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ms = milliseconds % 1000;

  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  const ms_str = String(ms).padStart(3, '0');

  return h + ':' + m + ':' + s + ',' + ms_str;
}

async function toggleMeetingMode() {
  if (isMeetingMode) {
    await stopMeetingCapture();
  } else {
    await startMeetingModeForActiveTab();
  }
}

async function startMeetingModeForActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      throw new Error('No active tab found');
    }

    const tabId = tabs[0].id;
    await startMeetingCapture(tabId);
  } catch (err) {
    console.error('Error starting meeting mode:', err);
    throw err;
  }
}

// --- Deepgram Enhanced engine: start/stop via offscreen document ---
async function ensureOffscreenDocument() {
  if (offscreenCreated) {
    try {
      const hasDoc = await chrome.offscreen.hasDocument();
      if (!hasDoc) offscreenCreated = false;
    } catch (e) {
      offscreenCreated = false;
    }
  }
  if (!offscreenCreated) {
    await chrome.offscreen.createDocument({
      url: 'pages/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Audio capture for enhanced transcription'
    });
    offscreenCreated = true;
  }
}

async function startDeepgramCapture({ proxyUrl, licenseKey, language, diarize }) {
  await ensureOffscreenDocument();
  // Use _INTERNAL_ prefix so offscreen only handles messages routed through
  // the background, not duplicates from chrome.runtime.sendMessage broadcasts.
  chrome.runtime.sendMessage({
    type: '_INTERNAL_START_DEEPGRAM',
    proxyUrl: proxyUrl || 'ws://localhost:3001',
    licenseKey: licenseKey || '',
    language: language || 'en-US',
    diarize: diarize || false,
  }).catch(() => {});
}

async function stopDeepgramCapture() {
  if (offscreenCreated) {
    chrome.runtime.sendMessage({ type: '_INTERNAL_STOP_DEEPGRAM' }).catch(() => {});
  }
}

// --- Fix #7 & #16: Pass language to offscreen, add health check ---
async function startMeetingCapture(tabId) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    // Fix #16: Check if offscreen document actually exists before assuming
    if (offscreenCreated) {
      try {
        // Verify the document is still alive (Chrome 116+)
        const hasDoc = await chrome.offscreen.hasDocument();
        if (!hasDoc) {
          offscreenCreated = false;
        }
      } catch (e) {
        // hasDocument not available; try sending a ping
        offscreenCreated = false;
      }
    }

    if (!offscreenCreated) {
      await chrome.offscreen.createDocument({
        url: 'pages/offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Tab audio capture for meeting transcription'
      });
      offscreenCreated = true;
    }

    // Fix #7: Read user's language setting and pass it to the offscreen document
    const settingsData = await chrome.storage.local.get('settings').catch(() => ({}));
    const userSettings = settingsData.settings || SpeakScribeDefaults;
    const language = userSettings.language || 'en-US';

    chrome.runtime.sendMessage({
      type: 'START_MEETING_CAPTURE',
      streamId,
      tabId,
      language
    }).catch(err => {
      console.error('Error sending start capture message:', err);
    });

    isMeetingMode = true;
    meetingTabId = tabId;
    broadcastState();
  } catch (err) {
    console.error('Error starting meeting capture:', err);
    throw err;
  }
}

async function stopMeetingCapture() {
  try {
    chrome.runtime.sendMessage({
      type: 'STOP_MEETING_CAPTURE'
    }).catch(err => {
      console.error('Error sending stop capture message:', err);
    });

    if (offscreenCreated) {
      await chrome.offscreen.closeDocument().catch(err => {
        console.error('Error closing offscreen document:', err);
      });
      offscreenCreated = false;
    }

    isMeetingMode = false;
    meetingTabId = null;
    broadcastState();
  } catch (err) {
    console.error('Error stopping meeting capture:', err);
    throw err;
  }
}

async function setSiteSettings(hostname, settings) {
  try {
    const result = await chrome.storage.local.get('siteSettings');
    const siteSettings = result.siteSettings || {};
    siteSettings[hostname] = settings;
    await chrome.storage.local.set({ siteSettings });
  } catch (err) {
    console.error('Error setting site settings:', err);
    throw err;
  }
}

async function getSiteSettings(hostname) {
  try {
    const result = await chrome.storage.local.get('siteSettings');
    const siteSettings = result.siteSettings || {};
    return siteSettings[hostname] || null;
  } catch (err) {
    console.error('Error getting site settings:', err);
    throw err;
  }
}

// --- Fix #3: Use canonical 'settings' key with shared SpeakScribeDefaults ---
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    SpeakScribeLicense.ensureInstallDate().catch(() => {});

    chrome.storage.local.get(['settings'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error checking existing settings:', chrome.runtime.lastError);
        return;
      }

      if (result.settings) {
        console.log('[SpeakScribe] Extension reloaded, skipping first-install setup.');
        return;
      }

      chrome.storage.local.set({
        settings: { ...SpeakScribeDefaults },
        siteSettings: {},
        customCommands: [],
        customVocab: []
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error setting default settings:', chrome.runtime.lastError);
        }
      });
    });
  }

  // Migrate legacy 'defaultSettings' key to 'settings' on update
  if (details.reason === 'update') {
    chrome.storage.local.get(['defaultSettings', 'settings'], (result) => {
      if (chrome.runtime.lastError) return;
      if (result.defaultSettings && !result.settings) {
        chrome.storage.local.set({ settings: result.defaultSettings }, () => {
          chrome.storage.local.remove('defaultSettings').catch(() => {});
        });
      }
    });
  }
});

SpeakScribeLicense.ensureInstallDate().catch(() => {});
SpeakScribeLicense.validateLicense().then(result => {
  if (!result.valid && result.reason) {
    console.log('[SpeakScribe] License validation:', result.reason);
  }
}).catch(() => {});

// Ensure settings exist on every SW startup
chrome.storage.local.get(['settings'], (result) => {
  if (chrome.runtime.lastError) {
    console.error('Error during extension initialization:', chrome.runtime.lastError);
    return;
  }
  if (!result.settings) {
    chrome.storage.local.set({
      settings: { ...SpeakScribeDefaults },
      siteSettings: {},
      customCommands: [],
      customVocab: []
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error initializing extension settings:', chrome.runtime.lastError);
      }
    });
  }
});
