const btn = document.getElementById('grantBtn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = 'Requesting access...';
  status.className = 'status';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Permission granted! Stop the stream immediately.
    stream.getTracks().forEach(t => t.stop());

    status.textContent = 'Microphone access granted! This tab will close shortly.';
    status.className = 'status success';

    // Notify the extension that permission was granted
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' }).catch(() => {});

    // Close this tab after a short delay
    setTimeout(() => { window.close(); }, 1500);
  } catch (err) {
    status.textContent = 'Access denied. Click the lock icon in the address bar to allow microphone access, then try again.';
    status.className = 'status error';
    btn.disabled = false;
  }
});
