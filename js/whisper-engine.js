export class WhisperEngine {
  constructor() {
    this.isReady = false;
    this.isListening = false;
    this.model = null;
    this.audioContext = null;
    this.mediaStream = null;


    this.onInterimResult = null;
    this.onFinalResult = null;
    this.onStatusChange = null;
    this.onError = null;
    this.onProgress = null;
  }



  async init(settings = {}) {
    const { whisperModel = 'tiny', language = 'en' } = settings;

    this._notifyStatus('loading', `Loading Whisper ${whisperModel} model...`);









    console.log(`[SpeakScribe/Whisper] Scaffold initialized with model: ${whisperModel}, language: ${language}`);
    console.log('[SpeakScribe/Whisper] Full implementation coming in v2.0');


    throw new Error(
      'Whisper AI engine is coming in SpeakScribe v2.0. ' +
      'For now, please use the Web Speech engine for real-time transcription.'
    );
  }



  async start() {
    if (!this.isReady) {
      this._notifyStatus('error', 'Whisper engine not initialized');
      return;
    }







    this.isListening = true;
    this._notifyStatus('listening');
  }



  stop() {
    this.isListening = false;


    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this._notifyStatus('stopped');
  }



  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
    return this.isListening;
  }



  static checkSupport() {
    const checks = {
      webAssembly: typeof WebAssembly !== 'undefined',
      wasmSIMD: false,
      audioWorklet: typeof AudioWorkletNode !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    };



    checks.wasmSIMD = checks.webAssembly;

    const isSupported = Object.values(checks).every(Boolean);

    return {
      supported: isSupported,
      details: checks,
    };
  }



  static getModelInfo() {
    return {
      tiny: {
        name: 'Tiny',
        size: '75 MB',
        sizeBytes: 78643200,
        description: 'Fastest, good for real-time. Best for English.',
        accuracy: 'Good',
        speed: 'Very Fast',
      },
      base: {
        name: 'Base',
        size: '142 MB',
        sizeBytes: 148897792,
        description: 'Balanced speed and accuracy. Recommended default.',
        accuracy: 'Better',
        speed: 'Fast',
      },
      small: {
        name: 'Small',
        size: '466 MB',
        sizeBytes: 488636416,
        description: 'High accuracy but needs more RAM. Best for difficult audio.',
        accuracy: 'Best',
        speed: 'Moderate',
      },
    };
  }

  _notifyStatus(status, message) {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  destroy() {
    this.stop();
    this.model = null;
    this.isReady = false;
  }
}
