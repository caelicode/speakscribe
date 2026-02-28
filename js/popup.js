import { SpeechEngine } from './speech-engine.js';

const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('statusText');
const transcriptBox = document.getElementById('transcriptBox');
const settingsBtn = document.getElementById('settingsBtn');
const overlayBtn = document.getElementById('overlayBtn');
const copyBtn = document.getElementById('copyBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const languageSelect = document.getElementById('languageSelect');
const meetingBtn = document.getElementById('meetingBtn');
const exportMenu = document.getElementById('exportMenu');
const formatIndicator = document.getElementById('formatIndicator');
const engineBtns = document.querySelectorAll('.engine-btn');

let engine = null;
let isRecording = false;
let currentEngine = 'web-speech';
let fullTranscript = '';
let engineReady = false;
let useContentScript = false;
let isMeetingMode = false;
let currentExportFormat = 'txt';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[SpeakScribe] Popup loaded, initializing...');


  const data = await chrome.storage.local.get(['settings', 'language', 'isMeetingMode']);
  const settings = data.settings || {};
  currentEngine = settings.engine || 'web-speech';
  const savedLanguage = data.language || 'en-US';
  isMeetingMode = data.isMeetingMode || false;


  languageSelect.value = savedLanguage;


  updateEngineUI(currentEngine);


  updateMeetingModeUI();


  try {
    engine = new SpeechEngine();
    await engine.init(settings);


    engine.onInterimResult = (text) => {
      updateTranscriptDisplay(fullTranscript, text);
      sendToBackground({ type: 'TRANSCRIPT_UPDATE', text, isFinal: false });
    };

    engine.onFinalResult = (text, timestamp) => {
      fullTranscript += (fullTranscript ? ' ' : '') + text;
      updateTranscriptDisplay(fullTranscript, '');
      sendToBackground({
        type: 'TRANSCRIPT_UPDATE',
        text,
        isFinal: true,
        timestamp,
      });
    };

    engine.onStatusChange = (status, message) => {
      console.log(`[SpeakScribe] Status change: ${status}`, message || '');
      updateStatusUI(status, message);
    };

    engine.onError = (error) => {
      console.error('[SpeakScribe] Engine error:', error);
      statusText.textContent = `Error: ${error}`;
    };

    engineReady = true;
    console.log('[SpeakScribe] Speech engine ready (popup context)');

  } catch (err) {
    console.warn('[SpeakScribe] Speech engine failed in popup context:', err.message);
    console.log('[SpeakScribe] Will use content script fallback');
    useContentScript = true;
    engineReady = false;
  }


  try {
    const state = await sendToBackground({ type: 'GET_STATE' });
    if (state) {
      isRecording = state.isRecording;
      fullTranscript = state.currentTranscript || '';
      isMeetingMode = state.isMeetingMode || false;
      if (fullTranscript) {
        updateTranscriptDisplay(fullTranscript, '');
      }
      updateMeetingModeUI();
      if (isRecording) {
        recordBtn.classList.add('recording');
        statusText.textContent = 'Listening...';
        statusText.classList.add('active');
        if (engineReady && engine) {
          engine.start();
        }
      }
    }
  } catch (err) {
    console.warn('[SpeakScribe] Could not restore state:', err);
  }


  setupEventListeners();
  await initLicenseUI();
});

function setupEventListeners() {

  recordBtn.addEventListener('click', async () => {
    console.log('[SpeakScribe] Record button clicked, isRecording:', isRecording);
    isRecording = !isRecording;

    if (isRecording) {
      recordBtn.classList.add('recording');
      statusText.textContent = 'Starting...';
      statusText.classList.add('active');

      if (engineReady && engine && !useContentScript) {

        try {
          engine.start();
        } catch (err) {
          console.error('[SpeakScribe] Direct start failed, trying content script:', err);
          useContentScript = true;
          startViaContentScript();
        }
      } else {

        startViaContentScript();
      }
    } else {
      recordBtn.classList.remove('recording');
      statusText.textContent = 'Ready to transcribe';
      statusText.classList.remove('active');

      if (engine && engine.isListening) {
        engine.stop();
      }


      sendToActiveTab({ type: 'STOP_RECOGNITION' });
    }

    await sendToBackground({ type: 'SET_RECORDING', value: isRecording });
  });


  engineBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const selectedEngine = btn.dataset.engine;
      if (selectedEngine === currentEngine) return;

      if (selectedEngine === 'whisper') {
        const allowed = await checkProFeature('whisperEngine', 'Whisper AI');
        if (!allowed) return;
      }

      currentEngine = selectedEngine;
      updateEngineUI(currentEngine);


      const data = await chrome.storage.local.get('settings');
      const settings = data.settings || {};
      settings.engine = currentEngine;
      await chrome.storage.local.set({ settings });

      if (currentEngine === 'whisper') {
        statusText.textContent = 'Whisper AI: coming in v2.0 (uses Web Speech for now)';
      } else {
        statusText.textContent = isRecording ? 'Listening...' : 'Ready to transcribe';
      }
    });
  });


  languageSelect.addEventListener('change', async () => {
    const selectedLanguage = languageSelect.value;
    await chrome.storage.local.set({ language: selectedLanguage });


    if (isRecording && engine && engine.isListening) {
      try {
        engine.stop();
        const data = await chrome.storage.local.get('settings');
        const settings = data.settings || {};
        settings.language = selectedLanguage;
        engine.start(settings);
      } catch (err) {
        console.warn('[SpeakScribe] Failed to restart with new language:', err);
      }
    }
  });


  meetingBtn.addEventListener('click', async () => {
    if (!isMeetingMode) {
      const allowed = await checkProFeature('meetingMode', 'Meeting mode');
      if (!allowed) return;
    }
    isMeetingMode = !isMeetingMode;
    await chrome.storage.local.set({ isMeetingMode });
    updateMeetingModeUI();
    await sendToBackground({ type: 'TOGGLE_MEETING_MODE', value: isMeetingMode });
  });


  overlayBtn.addEventListener('click', () => {
    sendToBackground({ type: 'OPEN_FLOATING' });
  });


  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = exportMenu.classList.toggle('open');
    if (isOpen) {
      document.addEventListener('click', closeExportMenu);
    } else {
      document.removeEventListener('click', closeExportMenu);
    }
  });


  const exportFormatBtns = document.querySelectorAll('.export-format');
  exportFormatBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fmt = btn.dataset.format;
      if (fmt !== 'txt') {
        const result = await sendToBackground({ type: 'CHECK_EXPORT_FORMAT', format: fmt });
        if (!result || !result.allowed) {
          const licenseLabel = document.getElementById('licenseLabel');
          if (licenseLabel) {
            licenseLabel.textContent = fmt.toUpperCase() + ' export needs Pro';
            licenseLabel.classList.add('flash');
            setTimeout(() => licenseLabel.classList.remove('flash'), 2000);
          }
          return;
        }
      }
      currentExportFormat = btn.dataset.format;
      formatIndicator.textContent = currentExportFormat.toUpperCase();
      exportMenu.classList.remove('open');
      document.removeEventListener('click', closeExportMenu);


      await sendToBackground({
        type: 'EXPORT_TRANSCRIPT',
        format: currentExportFormat,
      });
    });
  });


  copyBtn.addEventListener('click', async () => {
    if (fullTranscript.trim()) {
      await navigator.clipboard.writeText(fullTranscript);
      copyBtn.querySelector('.icon').textContent = '\u2713';
      setTimeout(() => {
        copyBtn.querySelector('.icon').textContent = '\uD83D\uDCCB';
      }, 1500);
    }
  });


  clearBtn.addEventListener('click', async () => {
    fullTranscript = '';
    updateTranscriptDisplay('', '');
    await sendToBackground({ type: 'CLEAR_TRANSCRIPT' });
  });


  settingsBtn.addEventListener('click', () => {
    sendToBackground({ type: 'OPEN_OPTIONS' });
  });


  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      isRecording = message.isRecording;
      isMeetingMode = message.isMeetingMode || false;
      updateMeetingModeUI();
      if (isRecording) {
        recordBtn.classList.add('recording');
        statusText.textContent = 'Listening...';
        statusText.classList.add('active');
      } else {
        recordBtn.classList.remove('recording');
        statusText.textContent = 'Ready to transcribe';
        statusText.classList.remove('active');
      }
    }

    if (message.type === 'TRANSCRIPT_BROADCAST' || message.type === 'CONTENT_TRANSCRIPT') {
      if (message.isFinal && message.text) {
        fullTranscript += (fullTranscript ? ' ' : '') + message.text;
        updateTranscriptDisplay(fullTranscript, '');
      } else if (!message.isFinal && message.text) {
        updateTranscriptDisplay(fullTranscript, message.text);
      }
    }

    if (message.type === 'MEETING_TRANSCRIPT') {
      if (message.isFinal && message.text) {
        fullTranscript += (fullTranscript ? ' ' : '') + message.text;
        updateTranscriptDisplay(fullTranscript, '');
      } else if (!message.isFinal && message.text) {
        updateTranscriptDisplay(fullTranscript, message.text);
      }
    }
  });


  const donateLink = document.querySelector('.donate-link');
  if (donateLink) {
    donateLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://buymeacoffee.com/speakscribe' });
    });
  }
}

async function startViaContentScript() {
  console.log('[SpeakScribe] Starting recognition via content script');
  statusText.textContent = 'Starting (via page)...';

  try {
    const settings = (await chrome.storage.local.get('settings')).settings || {};
    await sendToActiveTab({
      type: 'START_RECOGNITION',
      settings: {
        language: settings.language || 'en-US',
        continuous: settings.continuousListening !== false,
        smartPunctuation: settings.smartPunctuation !== false,
        autoCapitalize: settings.autoCapitalize !== false,
        customVocab: settings.customVocab || [],
      },
    });
  } catch (err) {
    console.error('[SpeakScribe] Content script start failed:', err);
    statusText.textContent = 'Error: Could not start. Try refreshing the page.';
    statusText.classList.remove('active');
    isRecording = false;
    recordBtn.classList.remove('recording');
  }
}

function closeExportMenu(e) {
  if (!e.target.closest('.export-container')) {
    exportMenu.classList.remove('open');
    document.removeEventListener('click', closeExportMenu);
  }
}

function updateEngineUI(engineName) {
  engineBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.engine === engineName);
  });
}

function updateMeetingModeUI() {
  if (isMeetingMode) {
    meetingBtn.classList.add('active');
    statusText.textContent = 'Meeting Active';
  } else {
    meetingBtn.classList.remove('active');
    statusText.textContent = isRecording ? 'Listening...' : 'Ready to transcribe';
  }
}

function updateStatusUI(status, message) {
  if (isMeetingMode) {
    statusText.textContent = 'Meeting Active';
    return;
  }

  switch (status) {
    case 'listening':
      statusText.textContent = 'Listening...';
      statusText.classList.add('active');
      break;
    case 'stopped':
      statusText.textContent = 'Ready to transcribe';
      statusText.classList.remove('active');
      break;
    case 'error':
      statusText.textContent = message || 'Error occurred';
      statusText.classList.remove('active');
      break;
  }
}

function updateTranscriptDisplay(finalText, interimText) {
  if (!finalText && !interimText) {
    transcriptBox.innerHTML = '<span class="placeholder">Your transcription will appear here</span>';
    return;
  }

  let html = '';
  if (finalText) {
    html += escapeHtml(finalText);
  }
  if (interimText) {
    html += `<span class="interim"> ${escapeHtml(interimText)}</span>`;
  }
  transcriptBox.innerHTML = html;


  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[SpeakScribe] Background message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      console.warn('[SpeakScribe] sendToBackground failed:', err);
      resolve(null);
    }
  });
}

function sendToActiveTab(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        reject(new Error('No active tab found'));
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  });
}

async function initLicenseUI() {
  const licenseBar = document.getElementById('licenseBar');
  const licenseLabel = document.getElementById('licenseLabel');
  const upgradeBtn = document.getElementById('upgradeBtn');

  if (!licenseBar || !licenseLabel || !upgradeBtn) return;

  const info = await sendToBackground({ type: 'GET_LICENSE_INFO' });
  if (!info) return;

  if (info.isPro) {
    licenseLabel.textContent = 'Pro';
    licenseLabel.classList.add('pro');
    upgradeBtn.style.display = 'none';

    if (info.trial && info.trial.active) {
      licenseLabel.textContent = 'Trial (' + info.trial.daysRemaining + 'd)';
      licenseLabel.classList.add('trial');
      upgradeBtn.style.display = 'inline-block';
      upgradeBtn.textContent = 'Buy Pro';
    }
  } else {
    licenseLabel.textContent = 'Free';
    upgradeBtn.style.display = 'inline-block';

    const whisperBtn = document.getElementById('whisperBtn');
    if (whisperBtn) {
      whisperBtn.classList.add('pro-locked');
      whisperBtn.title = 'Whisper AI requires SpeakScribe Pro';
    }

    if (meetingBtn) {
      meetingBtn.classList.add('pro-locked');
      meetingBtn.title = 'Meeting mode requires SpeakScribe Pro';
    }

    const nonTxtFormats = document.querySelectorAll('.export-format:not([data-format="txt"])');
    nonTxtFormats.forEach((btn) => {
      btn.classList.add('pro-locked');
      btn.title = 'This format requires SpeakScribe Pro';
    });

    const nonFreeLanguages = languageSelect.querySelectorAll('option:not([value="en-US"])');
    nonFreeLanguages.forEach((opt) => {
      opt.textContent = opt.textContent + ' (Pro)';
    });
  }

  upgradeBtn.addEventListener('click', () => {
    sendToBackground({ type: 'OPEN_UPGRADE' });
  });
}

async function checkProFeature(featureName, displayName) {
  const result = await sendToBackground({ type: 'CHECK_FEATURE', feature: featureName });
  if (result && result.allowed) return true;

  const licenseLabel = document.getElementById('licenseLabel');
  if (licenseLabel) {
    licenseLabel.textContent = displayName + ' needs Pro';
    licenseLabel.classList.add('flash');
    setTimeout(() => licenseLabel.classList.remove('flash'), 2000);
  }
  return false;
}
