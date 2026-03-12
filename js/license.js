const SpeakScribeLicense = (() => {
  const TIERS = {
    FREE: 'free',
    PRO: 'pro'
  };

  const FREE_FEATURES = {
    basicDictation: true,
    smartPunctuation: true,
    autoCapitalize: true,
    builtInVoiceCommands: true,
    copyTranscript: true,
    exportTxt: true,
    languageEnUS: true
  };

  const PRO_FEATURES = {
    ...FREE_FEATURES,
    allLanguages: true,
    whisperEngine: true,
    meetingMode: true,
    customVoiceCommands: true,
    perSiteSettings: true,
    customVocabulary: true,
    exportSrt: true,
    exportMarkdown: true,
    exportJson: true,
    floatingOverlay: true,
    continuousListening: true,
    timestamps: true
  };

  const FREE_LANGUAGES = ['en-US'];

  const STORAGE_KEYS = {
    LICENSE: 'speakscribe_license',
    LICENSE_KEY: 'speakscribe_license_key',
    INSTANCE_ID: 'speakscribe_instance_id',
    ACTIVATED_AT: 'speakscribe_activated_at',
    LAST_VALIDATED: 'speakscribe_last_validated',
    TRIAL_START: 'speakscribe_trial_start',
    INSTALL_DATE: 'speakscribe_install_date',
    CUSTOMER_EMAIL: 'speakscribe_customer_email',
    PRODUCT_NAME: 'speakscribe_product_name'
  };

  const TRIAL_DAYS = 7;
  const VALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
  // LemonSqueezy License API (no API key required, only the license key)
  const LS_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';
  const ACTIVATION_API = LS_API_BASE + '/activate';
  const VALIDATION_API = LS_API_BASE + '/validate';
  const DEACTIVATION_API = LS_API_BASE + '/deactivate';

  function getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (data) => {
        if (chrome.runtime.lastError) {
          console.warn('[SpeakScribe License] Storage read error:', chrome.runtime.lastError.message);
          resolve({});
          return;
        }
        resolve(data);
      });
    });
  }

  function setStorageData(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.warn('[SpeakScribe License] Storage write error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  function removeStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          console.warn('[SpeakScribe License] Storage remove error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  async function ensureInstallDate() {
    const data = await getStorageData([STORAGE_KEYS.INSTALL_DATE]);
    if (!data[STORAGE_KEYS.INSTALL_DATE]) {
      await setStorageData({ [STORAGE_KEYS.INSTALL_DATE]: Date.now() });
    }
  }

  async function getCurrentTier() {
    const data = await getStorageData([
      STORAGE_KEYS.LICENSE,
      STORAGE_KEYS.TRIAL_START,
      STORAGE_KEYS.LAST_VALIDATED
    ]);

    const license = data[STORAGE_KEYS.LICENSE];
    if (license === TIERS.PRO) {
      const lastValidated = data[STORAGE_KEYS.LAST_VALIDATED] || 0;
      const elapsed = Date.now() - lastValidated;
      if (elapsed > VALIDATION_INTERVAL_MS * 7) {
        return TIERS.FREE;
      }
      return TIERS.PRO;
    }

    const trialStart = data[STORAGE_KEYS.TRIAL_START];
    if (trialStart) {
      const elapsed = Date.now() - trialStart;
      const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
      if (elapsed < trialMs) {
        return TIERS.PRO;
      }
    }

    return TIERS.FREE;
  }

  async function isProUser() {
    const tier = await getCurrentTier();
    return tier === TIERS.PRO;
  }

  async function getTrialInfo() {
    const data = await getStorageData([STORAGE_KEYS.TRIAL_START]);
    const trialStart = data[STORAGE_KEYS.TRIAL_START];

    if (!trialStart) {
      return { active: false, started: false, daysRemaining: TRIAL_DAYS };
    }

    const elapsed = Date.now() - trialStart;
    const trialMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const remaining = trialMs - elapsed;

    if (remaining <= 0) {
      return { active: false, started: true, daysRemaining: 0, expired: true };
    }

    return {
      active: true,
      started: true,
      daysRemaining: Math.ceil(remaining / (24 * 60 * 60 * 1000)),
      startDate: new Date(trialStart).toISOString()
    };
  }

  async function startTrial() {
    const data = await getStorageData([STORAGE_KEYS.TRIAL_START]);
    if (data[STORAGE_KEYS.TRIAL_START]) {
      return { success: false, reason: 'Trial already used' };
    }

    await setStorageData({ [STORAGE_KEYS.TRIAL_START]: Date.now() });
    return { success: true, daysRemaining: TRIAL_DAYS };
  }

  async function hasFeature(featureName) {
    const tier = await getCurrentTier();
    if (tier === TIERS.PRO) {
      return PRO_FEATURES[featureName] === true;
    }
    return FREE_FEATURES[featureName] === true;
  }

  async function isLanguageAllowed(langCode) {
    const tier = await getCurrentTier();
    if (tier === TIERS.PRO) return true;
    return FREE_LANGUAGES.includes(langCode);
  }

  async function isExportFormatAllowed(format) {
    if (format === 'txt') return true;
    const tier = await getCurrentTier();
    return tier === TIERS.PRO;
  }

  async function activateLicense(licenseKey) {
    if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim().length < 8) {
      return { success: false, error: 'Invalid license key format' };
    }

    const key = licenseKey.trim();

    try {
      const body = new URLSearchParams();
      body.append('license_key', key);
      body.append('instance_name', 'SpeakScribe Chrome Extension');

      const response = await fetch(ACTIVATION_API, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: body
      });

      const result = await response.json();

      if (result.activated) {
        const storagePayload = {
          [STORAGE_KEYS.LICENSE]: TIERS.PRO,
          [STORAGE_KEYS.LICENSE_KEY]: key,
          [STORAGE_KEYS.ACTIVATED_AT]: Date.now(),
          [STORAGE_KEYS.LAST_VALIDATED]: Date.now()
        };

        // Store instance ID for future deactivation
        if (result.instance && result.instance.id) {
          storagePayload[STORAGE_KEYS.INSTANCE_ID] = result.instance.id;
        }

        // Store customer info from meta
        if (result.meta) {
          if (result.meta.customer_email) {
            storagePayload[STORAGE_KEYS.CUSTOMER_EMAIL] = result.meta.customer_email;
          }
          if (result.meta.product_name) {
            storagePayload[STORAGE_KEYS.PRODUCT_NAME] = result.meta.product_name;
          }
        }

        await setStorageData(storagePayload);
        return { success: true, tier: TIERS.PRO };
      }

      // LemonSqueezy returns error string when activation fails
      return {
        success: false,
        error: result.error || 'Activation failed. Please check your license key.'
      };
    } catch (err) {
      return {
        success: false,
        error: 'Could not connect to license server. Check your internet connection.'
      };
    }
  }

  async function deactivateLicense() {
    const data = await getStorageData([STORAGE_KEYS.LICENSE_KEY, STORAGE_KEYS.INSTANCE_ID]);
    const key = data[STORAGE_KEYS.LICENSE_KEY];
    const instanceId = data[STORAGE_KEYS.INSTANCE_ID];

    if (key && instanceId) {
      try {
        const body = new URLSearchParams();
        body.append('license_key', key);
        body.append('instance_id', instanceId);

        await fetch(DEACTIVATION_API, {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: body
        });
      } catch (err) {
        console.warn('[SpeakScribe License] Deactivation API call failed:', err.message);
      }
    }

    await removeStorageData([
      STORAGE_KEYS.LICENSE,
      STORAGE_KEYS.LICENSE_KEY,
      STORAGE_KEYS.INSTANCE_ID,
      STORAGE_KEYS.ACTIVATED_AT,
      STORAGE_KEYS.LAST_VALIDATED,
      STORAGE_KEYS.CUSTOMER_EMAIL,
      STORAGE_KEYS.PRODUCT_NAME
    ]);

    return { success: true };
  }

  async function validateLicense() {
    const data = await getStorageData([
      STORAGE_KEYS.LICENSE,
      STORAGE_KEYS.LICENSE_KEY,
      STORAGE_KEYS.INSTANCE_ID,
      STORAGE_KEYS.LAST_VALIDATED
    ]);

    if (data[STORAGE_KEYS.LICENSE] !== TIERS.PRO || !data[STORAGE_KEYS.LICENSE_KEY]) {
      return { valid: false, reason: 'No active license' };
    }

    const lastValidated = data[STORAGE_KEYS.LAST_VALIDATED] || 0;
    const elapsed = Date.now() - lastValidated;
    if (elapsed < VALIDATION_INTERVAL_MS) {
      return { valid: true, cached: true };
    }

    try {
      const body = new URLSearchParams();
      body.append('license_key', data[STORAGE_KEYS.LICENSE_KEY]);
      // Include instance_id if available for instance-level validation
      if (data[STORAGE_KEYS.INSTANCE_ID]) {
        body.append('instance_id', data[STORAGE_KEYS.INSTANCE_ID]);
      }

      const response = await fetch(VALIDATION_API, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: body
      });

      const result = await response.json();

      if (result.valid) {
        await setStorageData({ [STORAGE_KEYS.LAST_VALIDATED]: Date.now() });
        return { valid: true, cached: false };
      }

      // License no longer valid (expired, disabled, refunded, etc.)
      const status = result.license_key ? result.license_key.status : 'unknown';
      await removeStorageData([
        STORAGE_KEYS.LICENSE,
        STORAGE_KEYS.LICENSE_KEY,
        STORAGE_KEYS.INSTANCE_ID,
        STORAGE_KEYS.ACTIVATED_AT,
        STORAGE_KEYS.LAST_VALIDATED,
        STORAGE_KEYS.CUSTOMER_EMAIL,
        STORAGE_KEYS.PRODUCT_NAME
      ]);

      return { valid: false, reason: 'License is no longer valid (status: ' + status + ')' };
    } catch (err) {
      // Network error: be lenient, allow cached validation for up to 7 days
      const gracePeriod = VALIDATION_INTERVAL_MS * 7;
      if ((Date.now() - lastValidated) < gracePeriod) {
        return { valid: true, cached: true, offline: true };
      }
      return { valid: false, reason: 'License validation failed (offline too long)' };
    }
  }

  async function getLicenseInfo() {
    const data = await getStorageData([
      STORAGE_KEYS.LICENSE,
      STORAGE_KEYS.LICENSE_KEY,
      STORAGE_KEYS.INSTANCE_ID,
      STORAGE_KEYS.ACTIVATED_AT,
      STORAGE_KEYS.LAST_VALIDATED,
      STORAGE_KEYS.TRIAL_START,
      STORAGE_KEYS.INSTALL_DATE,
      STORAGE_KEYS.CUSTOMER_EMAIL,
      STORAGE_KEYS.PRODUCT_NAME
    ]);

    const tier = await getCurrentTier();
    const trialInfo = await getTrialInfo();

    const maskedKey = data[STORAGE_KEYS.LICENSE_KEY]
      ? data[STORAGE_KEYS.LICENSE_KEY].substring(0, 8) + '...'
      : null;

    return {
      tier,
      isPro: tier === TIERS.PRO,
      licenseKey: maskedKey,
      customerEmail: data[STORAGE_KEYS.CUSTOMER_EMAIL] || null,
      productName: data[STORAGE_KEYS.PRODUCT_NAME] || null,
      activatedAt: data[STORAGE_KEYS.ACTIVATED_AT]
        ? new Date(data[STORAGE_KEYS.ACTIVATED_AT]).toISOString()
        : null,
      lastValidated: data[STORAGE_KEYS.LAST_VALIDATED]
        ? new Date(data[STORAGE_KEYS.LAST_VALIDATED]).toISOString()
        : null,
      trial: trialInfo,
      installDate: data[STORAGE_KEYS.INSTALL_DATE]
        ? new Date(data[STORAGE_KEYS.INSTALL_DATE]).toISOString()
        : null,
      features: tier === TIERS.PRO ? PRO_FEATURES : FREE_FEATURES
    };
  }

  return {
    TIERS,
    FREE_FEATURES,
    PRO_FEATURES,
    FREE_LANGUAGES,
    TRIAL_DAYS,
    ensureInstallDate,
    getCurrentTier,
    isProUser,
    getTrialInfo,
    startTrial,
    hasFeature,
    isLanguageAllowed,
    isExportFormatAllowed,
    activateLicense,
    deactivateLicense,
    validateLicense,
    getLicenseInfo
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeakScribeLicense;
}
