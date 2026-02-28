const PURCHASE_URL_YEARLY = 'https://speakscribe.lemonsqueezy.com/checkout/buy/speakscribe-pro-yearly';
const PURCHASE_URL_LIFETIME = 'https://speakscribe.lemonsqueezy.com/checkout/buy/speakscribe-pro-lifetime';

const upgradeYearlyBtn = document.getElementById('upgradeYearlyBtn');
const upgradeLifetimeBtn = document.getElementById('upgradeLifetimeBtn');
const startTrialBtn = document.getElementById('startTrialBtn');
const activateBtn = document.getElementById('activateBtn');
const deactivateBtn = document.getElementById('deactivateBtn');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const activateStatus = document.getElementById('activateStatus');
const licenseStatus = document.getElementById('licenseStatus');
const trialSection = document.getElementById('trialSection');
const deactivateSection = document.getElementById('deactivateSection');
const freeLabel = document.getElementById('freeLabel');

document.addEventListener('DOMContentLoaded', async () => {
  await refreshUI();
});

async function refreshUI() {
  const info = await SpeakScribeLicense.getLicenseInfo();

  if (info.isPro) {
    let statusMsg = 'You have SpeakScribe Pro';

    if (info.trial.active) {
      statusMsg = 'Pro Trial: ' + info.trial.daysRemaining + ' day(s) remaining';
      licenseStatus.className = 'license-status trial-active';
    } else if (info.licenseKey) {
      statusMsg = 'Pro license active (key: ' + info.licenseKey + ')';
      licenseStatus.className = 'license-status pro-active';
    }

    licenseStatus.textContent = statusMsg;
    licenseStatus.style.display = 'block';

    upgradeYearlyBtn.textContent = 'Current Plan';
    upgradeYearlyBtn.disabled = true;
    upgradeYearlyBtn.classList.add('disabled');

    freeLabel.textContent = '';
    freeLabel.style.display = 'none';

    if (info.licenseKey) {
      deactivateSection.style.display = 'block';
    }

    if (info.trial.active && !info.licenseKey) {
      trialSection.style.display = 'none';
    } else if (info.licenseKey) {
      trialSection.style.display = 'none';
    }
  } else {
    licenseStatus.style.display = 'none';
    deactivateSection.style.display = 'none';

    if (info.trial.expired) {
      licenseStatus.textContent = 'Your free trial has ended. Upgrade to keep Pro features.';
      licenseStatus.className = 'license-status trial-expired';
      licenseStatus.style.display = 'block';
      trialSection.style.display = 'none';
    } else if (info.trial.started) {
      trialSection.style.display = 'none';
    }
  }
}

upgradeYearlyBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: PURCHASE_URL_YEARLY });
});

upgradeLifetimeBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: PURCHASE_URL_LIFETIME });
});

startTrialBtn.addEventListener('click', async () => {
  const result = await SpeakScribeLicense.startTrial();
  if (result.success) {
    activateStatus.textContent = 'Trial started! Enjoy ' + result.daysRemaining + ' days of Pro.';
    activateStatus.className = 'activate-status success';
    await refreshUI();
  } else {
    activateStatus.textContent = result.reason || 'Could not start trial.';
    activateStatus.className = 'activate-status error';
  }
});

activateBtn.addEventListener('click', async () => {
  const key = licenseKeyInput.value.trim();
  if (!key) {
    activateStatus.textContent = 'Please enter a license key.';
    activateStatus.className = 'activate-status error';
    return;
  }

  activateBtn.disabled = true;
  activateBtn.textContent = 'Activating...';
  activateStatus.textContent = '';

  const result = await SpeakScribeLicense.activateLicense(key);

  activateBtn.disabled = false;
  activateBtn.textContent = 'Activate';

  if (result.success) {
    activateStatus.textContent = 'License activated! Welcome to SpeakScribe Pro.';
    activateStatus.className = 'activate-status success';
    licenseKeyInput.value = '';
    await refreshUI();
  } else {
    activateStatus.textContent = result.error || 'Activation failed.';
    activateStatus.className = 'activate-status error';
  }
});

deactivateBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to deactivate your license? You can reactivate it later.')) {
    return;
  }

  const result = await SpeakScribeLicense.deactivateLicense();
  if (result.success) {
    activateStatus.textContent = 'License deactivated.';
    activateStatus.className = 'activate-status info';
    await refreshUI();
  }
});

licenseKeyInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') activateBtn.click();
});
