/**
 * DeepgramEngine - Enhanced Pro transcription via Deepgram Nova-3
 *
 * Captures mic audio, streams it through the SpeakScribe proxy server
 * to Deepgram's Nova-3 model, and returns real-time transcription results
 * with higher accuracy than the Web Speech API.
 *
 * Architecture:
 *   Browser mic -> AudioWorklet (PCM 16-bit) -> WebSocket -> Proxy -> Deepgram
 *   Deepgram -> Proxy -> WebSocket -> this engine -> callbacks
 */
export class DeepgramEngine {
  constructor() {
    this.isListening = false;
    this.settings = {};

    // Callbacks (set by popup.js)
    this.onInterimResult = null;
    this.onFinalResult = null;
    this.onStatusChange = null;
    this.onError = null;

    // Internal state
    this._ws = null;
    this._mediaStream = null;
    this._audioContext = null;
    this._workletNode = null;
    this._keepAliveTimer = null;
  }

  /**
   * Initialize the engine with settings.
   * Does not start listening; call start() for that.
   */
  async init(settings = {}) {
    this.settings = {
      language: 'en-US',
      proxyUrl: 'ws://localhost:3001',
      licenseKey: '',
      diarize: false,
      ...settings,
    };
  }

  /**
   * Start capturing audio and streaming to Deepgram via proxy.
   */
  async start(overrideSettings) {
    if (this.isListening) {
      console.warn('[DeepgramEngine] Already listening');
      return;
    }

    if (overrideSettings) {
      Object.assign(this.settings, overrideSettings);
    }

    this._notifyStatus('starting', 'Connecting to Enhanced transcription...');

    try {
      // 1. Connect to proxy server FIRST (no mic needed yet, fails fast if server is down)
      await this._connectWebSocket();

      // 2. Get mic access (after proxy is confirmed reachable)
      try {
        this._mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (micErr) {
        throw new Error('Microphone access denied. Allow mic access and try again.');
      }

      // 3. Set up audio capture pipeline
      await this._setupAudioPipeline();

      this.isListening = true;
      this._notifyStatus('listening', 'Listening (Enhanced)...');

      // 4. Send keepalives every 8 seconds to prevent timeout
      this._keepAliveTimer = setInterval(() => {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify({ type: 'keepalive' }));
        }
      }, 8000);

    } catch (err) {
      console.error('[DeepgramEngine] Start failed:', err);
      this.stop();
      const friendlyMsg = err.message && err.message.includes('WebSocket')
        ? 'Cannot reach Enhanced transcription server. Make sure the proxy is running.'
        : (err.message || 'Failed to start Enhanced transcription');
      this._notifyError(friendlyMsg);
      throw new Error(friendlyMsg);
    }
  }

  /**
   * Stop capturing and disconnect.
   */
  stop() {
    this.isListening = false;

    // Stop keepalive
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }

    // Close audio pipeline
    if (this._workletNode) {
      try { this._workletNode.disconnect(); } catch (e) {}
      this._workletNode = null;
    }
    if (this._audioContext) {
      try { this._audioContext.close(); } catch (e) {}
      this._audioContext = null;
    }

    // Release mic
    if (this._mediaStream) {
      this._mediaStream.getTracks().forEach((t) => t.stop());
      this._mediaStream = null;
    }

    // Close WebSocket
    if (this._ws) {
      try {
        if (this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify({ type: 'close' }));
        }
        this._ws.close();
      } catch (e) {}
      this._ws = null;
    }

    this._notifyStatus('stopped');
  }

  /**
   * Connect to the SpeakScribe proxy WebSocket server.
   */
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      // Map full language code (en-US) to Deepgram short code (en)
      const lang = (this.settings.language || 'en-US').split('-')[0];

      const params = new URLSearchParams({
        license: this.settings.licenseKey || '',
        language: lang,
        diarize: this.settings.diarize ? 'true' : 'false',
      });

      const wsUrl = `${this.settings.proxyUrl}?${params.toString()}`;
      console.log('[DeepgramEngine] Connecting to proxy:', wsUrl.replace(/license=[^&]+/, 'license=***'));

      const ws = new WebSocket(wsUrl);
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error('Connection to transcription server timed out'));
        }
      }, 10000);

      ws.onopen = () => {
        console.log('[DeepgramEngine] WebSocket connected to proxy');
        // Wait for the 'connected' message from proxy before resolving
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'connected' && !resolved) {
            // Proxy confirmed Deepgram is ready
            resolved = true;
            clearTimeout(timeout);
            this._ws = ws;
            resolve();
            return;
          }

          if (msg.type === 'error') {
            console.error('[DeepgramEngine] Server error:', msg.message);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(new Error(msg.message));
            } else {
              this._notifyError(msg.message);
            }
            return;
          }

          if (msg.type === 'transcript' && msg.data) {
            this._handleTranscriptResult(msg.data);
          }
        } catch (e) {
          console.warn('[DeepgramEngine] Failed to parse message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('[DeepgramEngine] WebSocket error');
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed. Is the proxy server running?'));
        }
      };

      ws.onclose = (event) => {
        console.log('[DeepgramEngine] WebSocket closed:', event.code, event.reason);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('Connection closed: ' + (event.reason || 'unknown')));
        }
        if (this.isListening) {
          this.stop();
          this._notifyStatus('stopped', 'Connection lost');
        }
      };
    });
  }

  /**
   * Set up AudioContext + ScriptProcessor to capture raw PCM audio
   * and send it to the WebSocket.
   *
   * We use ScriptProcessorNode (deprecated but universally supported)
   * instead of AudioWorklet because AudioWorklet requires a separate
   * file and has CSP complications in extension contexts.
   */
  async _setupAudioPipeline() {
    this._audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this._audioContext.createMediaStreamSource(this._mediaStream);

    // ScriptProcessor with 4096 buffer size, 1 input channel, 1 output channel
    const processor = this._audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (!this.isListening || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Convert Float32 samples to Int16 PCM (linear16 encoding)
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this._ws.send(pcm16.buffer);
    };

    source.connect(processor);
    processor.connect(this._audioContext.destination);
    this._workletNode = processor;

    console.log('[DeepgramEngine] Audio pipeline ready (16kHz PCM16)');
  }

  /**
   * Handle a transcript result from Deepgram (via proxy).
   */
  _handleTranscriptResult(data) {
    // Deepgram result structure:
    // { type: 'Results', channel: { alternatives: [{ transcript, confidence, words }] }, is_final, speech_final }
    if (!data.channel || !data.channel.alternatives || data.channel.alternatives.length === 0) {
      return;
    }

    const alt = data.channel.alternatives[0];
    const transcript = alt.transcript || '';

    if (!transcript.trim()) return;

    const isFinal = data.is_final === true;

    if (isFinal) {
      const timestamp = new Date().toLocaleTimeString();
      console.log('[DeepgramEngine] Final:', transcript);
      if (this.onFinalResult) {
        this.onFinalResult(transcript, timestamp);
      }
    } else {
      if (this.onInterimResult) {
        this.onInterimResult(transcript);
      }
    }
  }

  _notifyStatus(status, message) {
    if (this.onStatusChange) {
      this.onStatusChange(status, message);
    }
  }

  _notifyError(message) {
    if (this.onError) {
      this.onError(message);
    }
  }

  /**
   * Clean up everything.
   */
  destroy() {
    this.stop();
  }
}
