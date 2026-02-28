const transcriptArea = document.getElementById('transcriptArea');
const emptyState = document.getElementById('emptyState');
const statusDot = document.getElementById('statusDot');
const wordCount = document.getElementById('wordCount');
const copyAllBtn = document.getElementById('copyAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const opacityBtn = document.getElementById('opacityBtn');
const minimizeBtn = document.getElementById('minimizeBtn');

let lines = [];
let opacityLevel = 0;

document.addEventListener('DOMContentLoaded', async () => {

  const data = await chrome.storage.local.get('settings');
  const settings = data.settings || {};

  if (settings.overlayFontSize) {
    transcriptArea.style.fontSize = settings.overlayFontSize + 'px';
  }

  if (settings.overlayOpacity === 'semi') {
    opacityLevel = 1;
    document.body.classList.add('semi-transparent');
  } else if (settings.overlayOpacity === 'very') {
    opacityLevel = 2;
    document.body.classList.add('very-transparent');
  }


  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.transcriptLines) {
      lines = response.transcriptLines;
      renderLines();
      updateStatusDot(response.isRecording);
    }
  });

  setupEventListeners();
});

function setupEventListeners() {

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRANSCRIPT_BROADCAST') {
      handleTranscriptUpdate(message);
    }

    if (message.type === 'STATE_UPDATE') {
      updateStatusDot(message.isRecording);
      if (message.transcriptLines) {
        lines = message.transcriptLines;
        renderLines();
      }
    }
  });


  copyAllBtn.addEventListener('click', async () => {
    const text = lines.map((l) => l.text).join('\n');
    if (text.trim()) {
      await navigator.clipboard.writeText(text);
      copyAllBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyAllBtn.textContent = 'Copy All';
      }, 1500);
    }
  });


  clearAllBtn.addEventListener('click', () => {
    lines = [];
    renderLines();
    chrome.runtime.sendMessage({ type: 'CLEAR_TRANSCRIPT' });
  });


  opacityBtn.addEventListener('click', () => {
    opacityLevel = (opacityLevel + 1) % 3;
    document.body.classList.remove('semi-transparent', 'very-transparent');
    if (opacityLevel === 1) {
      document.body.classList.add('semi-transparent');
    } else if (opacityLevel === 2) {
      document.body.classList.add('very-transparent');
    }
  });


  minimizeBtn.addEventListener('click', () => {
    window.close();
  });
}

function handleTranscriptUpdate(message) {
  const { text, isFinal, timestamp } = message;

  if (isFinal && text.trim()) {
    lines.push({
      text: text.trim(),
      timestamp: timestamp || new Date().toLocaleTimeString(),
      isFinal: true,
    });
    renderLines();
  } else if (!isFinal && text) {

    renderLines(text);
  }
}

function renderLines(interimText) {

  if (lines.length === 0 && !interimText) {
    emptyState.style.display = 'flex';
    transcriptArea.querySelectorAll('.transcript-line').forEach((el) => el.remove());
    wordCount.textContent = '0 words';
    return;
  }

  emptyState.style.display = 'none';


  let html = '';


  chrome.storage.local.get('settings', (data) => {
    const showTimestamps = data.settings?.showTimestamps || false;

    for (const line of lines) {
      const tsHtml = showTimestamps
        ? `<span class="timestamp">${line.timestamp}</span>`
        : '';
      html += `<div class="transcript-line final">${tsHtml}${escapeHtml(line.text)}</div>`;
    }

    if (interimText) {
      html += `<div class="transcript-line interim">${escapeHtml(interimText)}</div>`;
    }


    const existingLines = transcriptArea.querySelectorAll('.transcript-line');
    existingLines.forEach((el) => el.remove());


    transcriptArea.insertAdjacentHTML('beforeend', html);


    transcriptArea.scrollTop = transcriptArea.scrollHeight;


    const totalWords = lines.reduce((count, l) => count + l.text.split(/\s+/).length, 0);
    wordCount.textContent = `${totalWords} word${totalWords !== 1 ? 's' : ''}`;
  });
}

function updateStatusDot(isRecording) {
  if (isRecording) {
    statusDot.classList.remove('idle');
  } else {
    statusDot.classList.add('idle');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
