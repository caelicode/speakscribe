import { processTranscription, parseVocabulary } from './punctuation.js';

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.settings = {};
    this.vocabData = { words: [], replacements: {} };


    this.onInterimResult = null;
    this.onFinalResult = null;
    this.onStatusChange = null;
    this.onError = null;


    this._restartTimer = null;
    this._isManualStop = false;
  }



  async init(settings = {}) {
    this.settings = {
      language: 'en-US',
      continuousListening: true,
      smartPunctuation: true,
      autoCapitalize: true,
      customVocab: [],
      ...settings,
    };


    this.vocabData = parseVocabulary(this.settings.customVocab || []);


    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Web Speech API is not supported in this browser.');
    }

    this._createRecognition(SpeechRecognition);
  }



  _createRecognition(SpeechRecognition) {
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.settings.language;
    this.recognition.maxAlternatives = 1;


    this.recognition.onresult = (event) => {
      this._handleResults(event);
    };


    this.recognition.onerror = (event) => {
      console.warn('[SpeakScribe] Speech recognition error:', event.error);

      switch (event.error) {
        case 'no-speech':

          if (this.settings.continuousListening && this.isListening) {
            this._scheduleRestart(500);
          }
          break;

        case 'audio-capture':
          this._notifyStatus('error', 'No microphone detected. Please check your audio input.');
          this.stop();
          break;

        case 'not-allowed':
          this._notifyStatus('error', 'Microphone access denied. Please allow microphone permission.');
          this.stop();
          break;

        case 'network':
          this._notifyStatus('error', 'Network error. Web Speech API requires internet connectivity.');
          if (this.settings.continuousListening && this.isListening) {
            this._scheduleRestart(2000);
          }
          break;

        case 'aborted':

          break;

        default:
          if (this.onError) {
            this.onError(event.error);
          }
          if (this.settings.continuousListening && this.isListening) {
            this._scheduleRestart(1000);
          }
      }
    };


    this.recognition.onend = () => {
      if (this.isListening && this.settings.continuousListening && !this._isManualStop) {
        this._scheduleRestart(300);
      } else {
        this.isListening = false;
        this._notifyStatus('stopped');
      }
    };

    this.recognition.onstart = () => {
      this._notifyStatus('listening');
    };
  }



  _handleResults(event) {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;

      if (result.isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }


    if (interimTranscript && this.onInterimResult) {
      const processed = this._processText(interimTranscript);
      this.onInterimResult(processed);
    }


    if (finalTranscript && this.onFinalResult) {
      const processed = this._processText(finalTranscript);
      const timestamp = new Date().toLocaleTimeString();
      this.onFinalResult(processed, timestamp);
    }
  }



  _processText(text) {
    return processTranscription(text, {
      smartPunctuation: this.settings.smartPunctuation,
      autoCapitalize: this.settings.autoCapitalize,
      customVocab: this.vocabData.words,
      vocabReplacements: this.vocabData.replacements,
    });
  }



  start() {
    if (this.isListening) return;

    this._isManualStop = false;
    this.isListening = true;

    try {
      this.recognition.start();
    } catch (err) {

      this.recognition.stop();
      setTimeout(() => {
        try {
          this.recognition.start();
        } catch (e) {
          console.error('[SpeakScribe] Failed to start recognition:', e);
          this.isListening = false;
          this._notifyStatus('error', 'Failed to start speech recognition.');
        }
      }, 200);
    }
  }



  stop() {
    this._isManualStop = true;
    this.isListening = false;
    clearTimeout(this._restartTimer);

    try {
      this.recognition.stop();
    } catch (err) {

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



  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    this.vocabData = parseVocabulary(this.settings.customVocab || []);

    if (this.recognition) {
      this.recognition.lang = this.settings.language;
    }
  }



  _scheduleRestart(delayMs) {
    clearTimeout(this._restartTimer);
    this._restartTimer = setTimeout(() => {
      if (this.isListening && !this._isManualStop) {
        try {
          this.recognition.start();
        } catch (err) {

        }
      }
    }, delayMs);
  }



  _notifyStatus(status, message) {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }



  destroy() {
    this.stop();
    clearTimeout(this._restartTimer);
    this.recognition = null;
  }
}
