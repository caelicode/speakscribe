const defaultEngineSelect = document.getElementById('defaultEngine');
const languageSelect = document.getElementById('language');
const whisperModelSizeSelect = document.getElementById('whisperModelSize');
const smartPunctuationCheckbox = document.getElementById('smartPunctuation');
const autoCapitalizeCheckbox = document.getElementById('autoCapitalize');
const showTimestampsCheckbox = document.getElementById('showTimestamps');
const continuousListeningCheckbox = document.getElementById('continuousListening');
const showCommandPaletteCheckbox = document.getElementById('showCommandPalette');
const perSiteEnabledCheckbox = document.getElementById('perSiteEnabled');
const autoOpenOverlayCheckbox = document.getElementById('autoOpenOverlay');
const meetingAutoTranscribeCheckbox = document.getElementById('meetingAutoTranscribe');
const overlayOpacitySelect = document.getElementById('overlayOpacity');
const fontSizeSelect = document.getElementById('fontSize');
const exportFormatSelect = document.getElementById('exportFormat');

const cmdTriggerInput = document.getElementById('cmdTrigger');
const cmdActionInput = document.getElementById('cmdAction');
const cmdAddBtn = document.getElementById('cmdAddBtn');
const commandsContainer = document.getElementById('commandsContainer');

const siteHostnameInput = document.getElementById('siteHostname');
const siteLanguageSelect = document.getElementById('siteLanguage');
const siteAddBtn = document.getElementById('siteAddBtn');
const siteSettingsContainer = document.getElementById('siteSettingsContainer');

const vocabInput = document.getElementById('vocabInput');
const vocabAddBtn = document.getElementById('vocabAddBtn');
const vocabContainer = document.getElementById('vocabContainer');

const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  attachEventListeners();
  initOptionsLicenseUI();
});

function loadSettings() {
  chrome.storage.local.get(['settings', 'customCommands', 'siteSettings', 'customVocab'], function(data) {
    const settings = data.settings || getDefaultSettings();


    defaultEngineSelect.value = settings.defaultEngine || 'web-speech';
    languageSelect.value = settings.language || 'en-US';
    whisperModelSizeSelect.value = settings.whisperModelSize || 'base';
    smartPunctuationCheckbox.checked = settings.smartPunctuation !== false;
    autoCapitalizeCheckbox.checked = settings.autoCapitalize !== false;
    showTimestampsCheckbox.checked = settings.showTimestamps || false;
    continuousListeningCheckbox.checked = settings.continuousListening || false;
    showCommandPaletteCheckbox.checked = settings.showCommandPalette !== false;
    perSiteEnabledCheckbox.checked = settings.perSiteEnabled || false;
    autoOpenOverlayCheckbox.checked = settings.autoOpenOverlay !== false;
    meetingAutoTranscribeCheckbox.checked = settings.meetingAutoTranscribe || false;
    overlayOpacitySelect.value = settings.overlayOpacity || '0.9';
    fontSizeSelect.value = settings.fontSize || 'medium';
    exportFormatSelect.value = settings.exportFormat || 'txt';


    const customCommands = data.customCommands || [];
    renderCommands(customCommands);


    const customVocab = data.customVocab || [];
    renderVocabulary(customVocab);


    const siteSettings = data.siteSettings || {};
    renderSiteSettings(siteSettings);
  });
}

function getDefaultSettings() {
  return {
    defaultEngine: 'web-speech',
    language: 'en-US',
    whisperModelSize: 'base',
    smartPunctuation: true,
    autoCapitalize: true,
    showTimestamps: false,
    continuousListening: false,
    showCommandPalette: true,
    perSiteEnabled: false,
    autoOpenOverlay: true,
    meetingAutoTranscribe: false,
    overlayOpacity: '0.9',
    fontSize: 'medium',
    exportFormat: 'txt'
  };
}

function saveSettings() {
  const settings = {
    defaultEngine: defaultEngineSelect.value,
    language: languageSelect.value,
    whisperModelSize: whisperModelSizeSelect.value,
    smartPunctuation: smartPunctuationCheckbox.checked,
    autoCapitalize: autoCapitalizeCheckbox.checked,
    showTimestamps: showTimestampsCheckbox.checked,
    continuousListening: continuousListeningCheckbox.checked,
    showCommandPalette: showCommandPaletteCheckbox.checked,
    perSiteEnabled: perSiteEnabledCheckbox.checked,
    autoOpenOverlay: autoOpenOverlayCheckbox.checked,
    meetingAutoTranscribe: meetingAutoTranscribeCheckbox.checked,
    overlayOpacity: overlayOpacitySelect.value,
    fontSize: fontSizeSelect.value,
    exportFormat: exportFormatSelect.value
  };

  chrome.storage.local.set({ settings: settings }, function() {
    showSaveConfirmation();
  });
}

function showSaveConfirmation() {
  saveStatus.textContent = 'Settings saved successfully!';
  saveStatus.style.opacity = '1';
  saveStatus.style.display = 'block';

  setTimeout(function() {
    saveStatus.style.opacity = '0';
    setTimeout(function() {
      saveStatus.style.display = 'none';
    }, 300);
  }, 2000);
}

function renderCommands(commands) {
  commandsContainer.innerHTML = '';

  commands.forEach(function(command, index) {
    const tag = document.createElement('div');
    tag.className = 'command-tag';
    tag.innerHTML = `
      <span class="command-text">"${escapeHtml(command.trigger)}" -> "${escapeHtml(command.action)}"</span>
      <button class="remove-btn" data-index="${index}">Remove</button>
    `;

    const removeBtn = tag.querySelector('.remove-btn');
    removeBtn.addEventListener('click', function() {
      removeCommand(index, commands);
    });

    commandsContainer.appendChild(tag);
  });
}

function addCommand() {
  const trigger = cmdTriggerInput.value.trim();
  const action = cmdActionInput.value.trim();

  if (!trigger || !action) {
    alert('Please fill in both trigger and action fields');
    return;
  }

  chrome.storage.local.get(['customCommands'], function(data) {
    const commands = data.customCommands || [];
    commands.push({ trigger: trigger, action: action });

    chrome.storage.local.set({ customCommands: commands }, function() {
      renderCommands(commands);
      cmdTriggerInput.value = '';
      cmdActionInput.value = '';
      cmdTriggerInput.focus();
    });
  });
}

function removeCommand(index, commands) {
  const newCommands = commands.filter(function(_, i) {
    return i !== index;
  });

  chrome.storage.local.set({ customCommands: newCommands }, function() {
    renderCommands(newCommands);
  });
}

function renderSiteSettings(siteSettings) {
  siteSettingsContainer.innerHTML = '';

  Object.keys(siteSettings).forEach(function(hostname) {
    const setting = siteSettings[hostname];
    const rule = document.createElement('div');
    rule.className = 'site-rule-tag';
    rule.innerHTML = `
      <span class="rule-text">${escapeHtml(hostname)} -> ${escapeHtml(setting.language)}</span>
      <button class="remove-btn" data-hostname="${hostname}">Remove</button>
    `;

    const removeBtn = rule.querySelector('.remove-btn');
    removeBtn.addEventListener('click', function() {
      removeSiteRule(hostname, siteSettings);
    });

    siteSettingsContainer.appendChild(rule);
  });
}

function addSiteRule() {
  const hostname = siteHostnameInput.value.trim();
  const language = siteLanguageSelect.value;

  if (!hostname) {
    alert('Please enter a hostname');
    return;
  }

  chrome.storage.local.get(['siteSettings'], function(data) {
    const siteSettings = data.siteSettings || {};
    siteSettings[hostname] = { language: language };

    chrome.storage.local.set({ siteSettings: siteSettings }, function() {
      renderSiteSettings(siteSettings);
      siteHostnameInput.value = '';
      siteLanguageSelect.value = 'en-US';
      siteHostnameInput.focus();
    });
  });
}

function removeSiteRule(hostname, siteSettings) {
  delete siteSettings[hostname];

  chrome.storage.local.set({ siteSettings: siteSettings }, function() {
    renderSiteSettings(siteSettings);
  });
}

function renderVocabulary(vocabList) {
  vocabContainer.innerHTML = '';

  vocabList.forEach(function(term, index) {
    const tag = document.createElement('div');
    tag.className = 'vocab-tag';
    tag.innerHTML = `
      <span class="vocab-text">${escapeHtml(term)}</span>
      <button class="remove-btn" data-index="${index}">Remove</button>
    `;

    const removeBtn = tag.querySelector('.remove-btn');
    removeBtn.addEventListener('click', function() {
      removeVocabTerm(index, vocabList);
    });

    vocabContainer.appendChild(tag);
  });
}

function addVocabTerm() {
  const term = vocabInput.value.trim();

  if (!term) {
    alert('Please enter a term');
    return;
  }

  chrome.storage.local.get(['customVocab'], function(data) {
    const vocabList = data.customVocab || [];

    if (vocabList.includes(term)) {
      alert('This term is already in your vocabulary');
      return;
    }

    vocabList.push(term);

    chrome.storage.local.set({ customVocab: vocabList }, function() {
      renderVocabulary(vocabList);
      vocabInput.value = '';
      vocabInput.focus();
    });
  });
}

function removeVocabTerm(index, vocabList) {
  const newVocabList = vocabList.filter(function(_, i) {
    return i !== index;
  });

  chrome.storage.local.set({ customVocab: newVocabList }, function() {
    renderVocabulary(newVocabList);
  });
}

function attachEventListeners() {

  saveBtn.addEventListener('click', saveSettings);


  cmdAddBtn.addEventListener('click', addCommand);
  cmdTriggerInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') addCommand();
  });
  cmdActionInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') addCommand();
  });


  siteAddBtn.addEventListener('click', addSiteRule);
  siteHostnameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') addSiteRule();
  });


  vocabAddBtn.addEventListener('click', addVocabTerm);
  vocabInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') addVocabTerm();
  });


  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });
}

async function initOptionsLicenseUI() {
  if (typeof SpeakScribeLicense === 'undefined') return;

  const badge = document.getElementById('optionsLicenseBadge');
  const upgradeBar = document.getElementById('optionsUpgradeBar');
  const upgradeBtn = document.getElementById('optionsUpgradeBtn');

  let info;
  try {
    info = await SpeakScribeLicense.getLicenseInfo();
  } catch (e) {
    return;
  }

  if (!info) return;

  const proTags = document.querySelectorAll('.pro-tag');

  if (info.isPro) {
    if (badge) {
      badge.textContent = 'Pro';
      badge.classList.add('pro');
    }
    if (upgradeBar) upgradeBar.style.display = 'none';

    proTags.forEach(function(tag) {
      tag.style.display = 'none';
    });
  } else {
    if (badge) {
      badge.textContent = 'Free';
      badge.classList.remove('pro');
    }
    if (upgradeBar) upgradeBar.style.display = 'flex';

    proTags.forEach(function(tag) {
      tag.style.display = 'inline-block';
      const feature = tag.getAttribute('data-pro');
      const section = tag.closest('.settings-section');
      if (section) {
        section.classList.add('pro-gated');
        const inputs = section.querySelectorAll('input, select, button:not(.options-upgrade-btn)');
        inputs.forEach(function(input) {
          if (!input.classList.contains('options-upgrade-btn')) {
            input.disabled = true;
            input.classList.add('pro-disabled');
          }
        });
      }
    });
  }

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', function() {
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/upgrade.html') });
    });
  }
}
