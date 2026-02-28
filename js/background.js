importScripts('license.js');

let floatingWindowId = null;
let isRecording = false;
let currentTranscript = '';
let transcriptLines = [];
let isMeetingMode = false;
let meetingTabId = null;
let offscreenCreated = false;

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
      sendResponse({ success: true });
      break;

    case 'OPEN_FLOATING':
      openFloatingWindow().catch(err => {
        console.error('Error opening floating window:', err);
      });
      sendResponse({ success: true });
      break;

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

    case 'OPEN_UPGRADE':
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/upgrade.html') });
      sendResponse({ success: true });
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

async function handleToggleTranscription() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (tabs.length === 0) return;

  const activeTab = tabs[0];
  const result = await chrome.storage.local.get('defaultSettings').catch(() => ({}));
  const defaultSettings = result.defaultSettings || {};

  if (isRecording) {
    chrome.tabs.sendMessage(activeTab.id, {
      type: 'STOP_RECOGNITION'
    }).catch(err => {
      console.error('Error sending stop recognition:', err);
    });
  } else {
    chrome.tabs.sendMessage(activeTab.id, {
      type: 'START_RECOGNITION',
      settings: defaultSettings
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
    const windowInfo = await chrome.windows.create({
      url: 'pages/floating.html',
      type: 'popup',
      width: 420,
      height: 600,
      left: 1400,
      top: 100
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

function handleTranscriptUpdate(data) {
  const { text, isFinal, timestamp } = data;

  if (isFinal) {
    currentTranscript += (currentTranscript ? ' ' : '') + text;
    transcriptLines.push({
      text,
      timestamp: timestamp || new Date().toISOString(),
      duration: 3000
    });
  }

  broadcastTranscript();
}

function broadcastTranscript() {
  chrome.runtime.sendMessage({
    type: 'TRANSCRIPT_UPDATED',
    currentTranscript,
    transcriptLines
  }).catch(err => {

  });
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
  }).catch(err => {

  });
}

async function handleMeetingTranscript(data) {
  const { text, isFinal, timestamp } = data;

  if (isFinal) {
    currentTranscript += (currentTranscript ? ' ' : '') + text;
    transcriptLines.push({
      text,
      timestamp: timestamp || new Date().toISOString(),
      duration: 3000
    });
  }

  const tabs = await chrome.tabs.query({}).catch(() => []);
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'MEETING_TRANSCRIPT_UPDATE',
      text,
      isFinal,
      timestamp
    }).catch(err => {

    });
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

function exportAsSRT() {
  let output = '';
  let startTime = 0;

  for (let i = 0; i < transcriptLines.length; i++) {
    const line = transcriptLines[i];
    const duration = line.duration || 3000;
    const endTime = startTime + duration;

    const entryNumber = i + 1;
    const startTimeFormatted = formatSRTTime(startTime);
    const endTimeFormatted = formatSRTTime(endTime);

    output += entryNumber + '\n';
    output += startTimeFormatted + ' --> ' + endTimeFormatted + '\n';
    output += line.text + '\n';
    output += '\n';

    startTime = endTime;
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

async function startMeetingCapture(tabId) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    if (!offscreenCreated) {
      await chrome.offscreen.createDocument({
        url: 'pages/offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Tab audio capture for meeting transcription'
      });
      offscreenCreated = true;
    }

    chrome.runtime.sendMessage({
      type: 'START_MEETING_CAPTURE',
      streamId,
      tabId
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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    SpeakScribeLicense.ensureInstallDate().catch(() => {});

    chrome.storage.local.get(['defaultSettings'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error checking existing settings:', chrome.runtime.lastError);
        return;
      }


      if (result.defaultSettings) {
        console.log('[SpeakScribe] Extension reloaded, skipping first-install setup.');
        return;
      }

      const defaultSettings = {
        customCommands: [],
        showCommandPalette: true,
        meetingAutoTranscribe: false,
        exportFormat: 'txt',
        perSiteEnabled: false,
        language: 'en-US',
        autoCapitalize: true,
        autoScroll: false,
        engine: 'webspeech',
        whisperModel: 'base',
        smartPunctuation: true,
        showTimestamps: false,
        continuousListening: true,
        autoOpenOverlay: false
      };

      chrome.storage.local.set({ defaultSettings, siteSettings: {} }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error setting default settings:', chrome.runtime.lastError);
        }

      });
    });
  }
});

SpeakScribeLicense.ensureInstallDate().catch(() => {});
SpeakScribeLicense.validateLicense().then(result => {
  if (!result.valid && result.reason) {
    console.log('[SpeakScribe] License validation:', result.reason);
  }
}).catch(() => {});

chrome.storage.local.get(['defaultSettings'], (result) => {
  if (chrome.runtime.lastError) {
    console.error('Error during extension initialization:', chrome.runtime.lastError);
    return;
  }
  if (!result.defaultSettings) {
    const defaultSettings = {
      customCommands: [],
      showCommandPalette: true,
      meetingAutoTranscribe: false,
      exportFormat: 'txt',
      perSiteEnabled: false,
      language: 'en-US',
      autoCapitalize: true,
      autoScroll: false,
      engine: 'webspeech',
      whisperModel: 'base',
      smartPunctuation: true,
      showTimestamps: false,
      continuousListening: true,
      autoOpenOverlay: false
    };

    chrome.storage.local.set({ defaultSettings, siteSettings: {} }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error initializing extension settings:', chrome.runtime.lastError);
      }
    });
  }
});
