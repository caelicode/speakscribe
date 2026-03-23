const audioState = {
    mediaStream: null,
    audioContext: null,
    scriptProcessor: null,
    recognition: null,
    isCapturing: false,
    currentTabId: null,
    currentStreamId: null,
};

// Whisper engine removed. Only meeting capture remains.

// Fix #7: Accept language parameter instead of hardcoding en-US
// Fix #6: Add auto-restart logic so meeting transcription survives pauses
function initializeSpeechRecognition(language) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error('Web Speech API not available in this context');
        return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language || 'en-US';

    recognition.onstart = () => {
        console.log('[SpeechRecognition] Started');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        if (finalTranscript) {
            console.log('[SpeechRecognition] Final:', finalTranscript);
            chrome.runtime.sendMessage({
                type: 'MEETING_TRANSCRIPT',
                text: finalTranscript.trim(),
                isFinal: true,
                timestamp: Date.now(),
            }).catch(err => {
                console.error('[SpeechRecognition] Failed to send final transcript:', err);
            });
        }

        if (interimTranscript) {
            console.log('[SpeechRecognition] Interim:', interimTranscript);
            chrome.runtime.sendMessage({
                type: 'MEETING_TRANSCRIPT',
                text: interimTranscript.trim(),
                isFinal: false,
            }).catch(err => {
                console.error('[SpeechRecognition] Failed to send interim transcript:', err);
            });
        }
    };

    recognition.onerror = (event) => {
        const silentErrors = ['no-speech', 'aborted'];
        if (!silentErrors.includes(event.error)) {
            console.error('[SpeechRecognition] Error:', event.error);
            chrome.runtime.sendMessage({
                type: 'MEETING_TRANSCRIPT_ERROR',
                error: event.error,
                timestamp: Date.now(),
            }).catch(err => {
                console.error('[SpeechRecognition] Failed to send error message:', err);
            });
        }

        // Auto-restart on recoverable errors
        if (event.error === 'no-speech' && audioState.isCapturing) {
            scheduleRecognitionRestart(300);
        } else if (event.error === 'network' && audioState.isCapturing) {
            scheduleRecognitionRestart(2000);
        }
    };

    // Fix #6: Auto-restart when recognition ends while still capturing
    recognition.onend = () => {
        console.log('[SpeechRecognition] Ended, isCapturing:', audioState.isCapturing);
        if (audioState.isCapturing) {
            // Recognition ended but we're still capturing; restart it
            scheduleRecognitionRestart(300);
        }
    };

    return recognition;
}

let _recognitionRestartTimer = null;
function scheduleRecognitionRestart(delayMs) {
    clearTimeout(_recognitionRestartTimer);
    _recognitionRestartTimer = setTimeout(() => {
        if (audioState.isCapturing && audioState.recognition) {
            try {
                audioState.recognition.start();
                console.log('[SpeechRecognition] Auto-restarted');
            } catch (e) {
                console.warn('[SpeechRecognition] Restart failed, recreating:', e.message);
                audioState.recognition = initializeSpeechRecognition(audioState.recognition.lang);
                if (audioState.recognition) {
                    try { audioState.recognition.start(); } catch (e2) {
                        console.error('[SpeechRecognition] Recreate+start also failed:', e2.message);
                    }
                }
            }
        }
    }, delayMs);
}

async function startMeetingCapture({ streamId, tabId, language }) {
    if (audioState.isCapturing) {
        console.warn('[MeetingCapture] Already capturing audio');
        return;
    }

    try {
        console.log('[MeetingCapture] Starting capture for tab:', tabId);


        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId,
                },
            },
        });

        audioState.mediaStream = stream;
        audioState.currentTabId = tabId;
        audioState.currentStreamId = streamId;
        audioState.isCapturing = true;


        if (!audioState.recognition) {
            audioState.recognition = initializeSpeechRecognition(language);
        }

        if (audioState.recognition) {
            audioState.recognition.start();
        }

        console.log('[MeetingCapture] Audio stream acquired and recognition started');


        chrome.runtime.sendMessage({
            type: 'MEETING_CAPTURE_STARTED',
            tabId,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[MeetingCapture] Failed to send start message:', err);
        });

    } catch (error) {
        console.error('[MeetingCapture] Error:', error.message);
        audioState.isCapturing = false;


        chrome.runtime.sendMessage({
            type: 'MEETING_CAPTURE_ERROR',
            error: error.message,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[MeetingCapture] Failed to send error message:', err);
        });
    }
}

function stopMeetingCapture() {
    console.log('[MeetingCapture] Stopping capture');

    // Clear any pending restart timer
    clearTimeout(_recognitionRestartTimer);

    // Set isCapturing false BEFORE stopping, so onend doesn't auto-restart
    audioState.isCapturing = false;

    if (audioState.recognition) {
        audioState.recognition.stop();
        audioState.recognition = null;
    }


    if (audioState.mediaStream) {
        audioState.mediaStream.getTracks().forEach(track => {
            track.stop();
        });
        audioState.mediaStream = null;
    }


    if (audioState.audioContext) {
        audioState.audioContext.close();
        audioState.audioContext = null;
    }

    audioState.currentTabId = null;
    audioState.currentStreamId = null;

    chrome.runtime.sendMessage({
        type: 'MEETING_CAPTURE_STOPPED',
        timestamp: Date.now(),
    }).catch(err => {
        console.error('[MeetingCapture] Failed to send stop message:', err);
    });
}

// ---------------------------------------------------------------------------
// Deepgram Enhanced Engine (runs in offscreen context for reliable mic access)
// ---------------------------------------------------------------------------
const dgState = {
    ws: null,
    mediaStream: null,
    audioContext: null,
    processor: null,
    isActive: false,
    keepAliveTimer: null,
};

async function startDeepgram({ proxyUrl, licenseKey, language, diarize }) {
    if (dgState.isActive) {
        console.warn('[Deepgram] Already active');
        return;
    }

    try {
        console.log('[Deepgram] Starting enhanced transcription');

        // 1. Connect to proxy WebSocket
        const lang = (language || 'en-US').split('-')[0];
        const params = new URLSearchParams({
            license: licenseKey || '',
            language: lang,
            diarize: diarize ? 'true' : 'false',
        });
        const wsUrl = `${proxyUrl}?${params.toString()}`;

        const ws = await new Promise((resolve, reject) => {
            const socket = new WebSocket(wsUrl);
            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error('Proxy connection timed out'));
            }, 10000);

            socket.onopen = () => {
                console.log('[Deepgram] WebSocket connected to proxy');
            };

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'connected') {
                        clearTimeout(timeout);
                        resolve(socket);
                        return;
                    }
                    if (msg.type === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(msg.message));
                        return;
                    }
                    // Forward transcript results to background/popup
                    if (msg.type === 'transcript' && msg.data) {
                        _handleDgTranscript(msg.data);
                    }
                } catch (e) {}
            };

            socket.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Cannot reach transcription server'));
            };

            socket.onclose = (ev) => {
                clearTimeout(timeout);
                if (!dgState.isActive) return;
                console.log('[Deepgram] WebSocket closed:', ev.code);
                stopDeepgram();
                chrome.runtime.sendMessage({ type: 'DEEPGRAM_STOPPED', reason: 'connection_lost' }).catch(() => {});
            };
        });

        dgState.ws = ws;

        // 2. Get mic access (offscreen document shares extension origin permissions).
        // If the extension origin hasn't been granted mic access yet (via the popup),
        // this will fail with "Permission dismissed". Send a specific error so the
        // UI can tell the user to grant permission via the popup first.
        try {
            dgState.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
            });
        } catch (micErr) {
            throw new Error('MIC_PERMISSION_NEEDED');
        }

        // 3. Set up audio pipeline (PCM16 at 16kHz)
        dgState.audioContext = new AudioContext({ sampleRate: 16000 });
        const source = dgState.audioContext.createMediaStreamSource(dgState.mediaStream);
        dgState.processor = dgState.audioContext.createScriptProcessor(4096, 1, 1);

        dgState.processor.onaudioprocess = (event) => {
            if (!dgState.isActive || !dgState.ws || dgState.ws.readyState !== WebSocket.OPEN) return;
            const input = event.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            dgState.ws.send(pcm16.buffer);
        };

        source.connect(dgState.processor);
        dgState.processor.connect(dgState.audioContext.destination);

        dgState.isActive = true;

        // 4. Keepalive
        dgState.keepAliveTimer = setInterval(() => {
            if (dgState.ws && dgState.ws.readyState === WebSocket.OPEN) {
                dgState.ws.send(JSON.stringify({ type: 'keepalive' }));
            }
        }, 8000);

        console.log('[Deepgram] Streaming active');
        chrome.runtime.sendMessage({ type: 'DEEPGRAM_STARTED' }).catch(() => {});

    } catch (err) {
        console.error('[Deepgram] Start failed:', err.message);
        stopDeepgram();
        chrome.runtime.sendMessage({
            type: 'DEEPGRAM_ERROR',
            error: err.message,
        }).catch(() => {});
    }
}

function stopDeepgram() {
    console.log('[Deepgram] Stopping');
    dgState.isActive = false;

    if (dgState.keepAliveTimer) { clearInterval(dgState.keepAliveTimer); dgState.keepAliveTimer = null; }
    if (dgState.processor) { try { dgState.processor.disconnect(); } catch (e) {} dgState.processor = null; }
    if (dgState.audioContext) { try { dgState.audioContext.close(); } catch (e) {} dgState.audioContext = null; }
    if (dgState.mediaStream) { dgState.mediaStream.getTracks().forEach(t => t.stop()); dgState.mediaStream = null; }
    if (dgState.ws) {
        try {
            if (dgState.ws.readyState === WebSocket.OPEN) {
                dgState.ws.send(JSON.stringify({ type: 'close' }));
            }
            dgState.ws.close();
        } catch (e) {}
        dgState.ws = null;
    }
}

function _handleDgTranscript(data) {
    if (!data.channel || !data.channel.alternatives || !data.channel.alternatives.length) return;
    const transcript = data.channel.alternatives[0].transcript || '';
    if (!transcript.trim()) return;

    const isFinal = data.is_final === true;
    chrome.runtime.sendMessage({
        type: 'DEEPGRAM_TRANSCRIPT',
        text: transcript,
        isFinal: isFinal,
        timestamp: isFinal ? Date.now() : undefined,
    }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] Received message:', message.type);

    // Only handle _INTERNAL_ prefixed messages from the background service worker
    // to avoid duplicates (chrome.runtime.sendMessage broadcasts to all contexts).
    if (message.type === '_INTERNAL_START_DEEPGRAM') {
        startDeepgram(message).catch(err => {
            console.error('[Offscreen] Error in START_DEEPGRAM:', err);
        });
        sendResponse({ status: 'processing' });
        return true;
    }

    if (message.type === '_INTERNAL_STOP_DEEPGRAM') {
        stopDeepgram();
        sendResponse({ status: 'stopped' });
        return true;
    }

    if (message.type === 'START_MEETING_CAPTURE') {
        startMeetingCapture(message).catch(err => {
            console.error('[Offscreen] Error in START_MEETING_CAPTURE:', err);
        });
        sendResponse({ status: 'processing' });
        return true;
    }

    if (message.type === 'STOP_MEETING_CAPTURE') {
        stopMeetingCapture();
        sendResponse({ status: 'stopped' });
        return true;
    }


    console.warn('[Offscreen] Unknown message type:', message.type);
    sendResponse({ status: 'unknown' });
});

window.addEventListener('beforeunload', () => {
    console.log('[Offscreen] Unloading, cleaning up resources');
    stopMeetingCapture();
});

console.log('[Offscreen] Document initialized and ready to receive messages');
