const audioState = {
    mediaStream: null,
    audioContext: null,
    scriptProcessor: null,
    recognition: null,
    isCapturing: false,
    currentTabId: null,
    currentStreamId: null,
};

const whisperState = {
    isInitialized: false,
    model: null,
    pipeline: null,
    isLoading: false,
};

function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error('Web Speech API not available in this context');
        return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

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
        console.error('[SpeechRecognition] Error:', event.error);
        chrome.runtime.sendMessage({
            type: 'MEETING_TRANSCRIPT_ERROR',
            error: event.error,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[SpeechRecognition] Failed to send error message:', err);
        });
    };

    recognition.onend = () => {
        console.log('[SpeechRecognition] Ended');
        audioState.isCapturing = false;
    };

    return recognition;
}

async function startMeetingCapture({ streamId, tabId }) {
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
            audioState.recognition = initializeSpeechRecognition();
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

    audioState.isCapturing = false;
    audioState.currentTabId = null;
    audioState.currentStreamId = null;

    chrome.runtime.sendMessage({
        type: 'MEETING_CAPTURE_STOPPED',
        timestamp: Date.now(),
    }).catch(err => {
        console.error('[MeetingCapture] Failed to send stop message:', err);
    });
}

async function initializeWhisper({ model = 'Xenova/whisper-tiny.en' }) {
    if (whisperState.isInitialized) {
        console.log('[Whisper] Already initialized');
        chrome.runtime.sendMessage({
            type: 'WHISPER_INITIALIZED',
            model,
        }).catch(err => {
            console.error('[Whisper] Failed to send initialized message:', err);
        });
        return;
    }

    if (whisperState.isLoading) {
        console.log('[Whisper] Already loading');
        return;
    }

    whisperState.isLoading = true;

    try {
        console.log('[Whisper] Initializing with model:', model);


        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');


        env.allowLocalModels = true;
        env.allowRemoteModels = true;


        env.onProgress = (progress) => {
            console.log('[Whisper] Progress:', progress);
            chrome.runtime.sendMessage({
                type: 'WHISPER_PROGRESS',
                progress,
            }).catch(err => {
                console.error('[Whisper] Failed to send progress message:', err);
            });
        };

        console.log('[Whisper] Loading speech recognition pipeline');


        whisperState.pipeline = await pipeline('automatic-speech-recognition', model);

        whisperState.model = model;
        whisperState.isInitialized = true;
        whisperState.isLoading = false;

        console.log('[Whisper] Pipeline loaded successfully');

        chrome.runtime.sendMessage({
            type: 'WHISPER_INITIALIZED',
            model,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[Whisper] Failed to send initialized message:', err);
        });

    } catch (error) {
        console.error('[Whisper] Initialization error:', error.message);
        whisperState.isLoading = false;

        chrome.runtime.sendMessage({
            type: 'WHISPER_ERROR',
            error: error.message,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[Whisper] Failed to send error message:', err);
        });
    }
}

async function processAudioWithWhisper(audioData) {
    if (!whisperState.isInitialized || !whisperState.pipeline) {
        console.warn('[Whisper] Not yet initialized');
        chrome.runtime.sendMessage({
            type: 'WHISPER_PROCESS_ERROR',
            error: 'Whisper model not yet loaded. Please call WHISPER_INIT first.',
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[Whisper] Failed to send process error:', err);
        });
        return;
    }

    try {
        console.log('[Whisper] Processing audio chunk');


        const result = await whisperState.pipeline(audioData);

        console.log('[Whisper] Result:', result);

        chrome.runtime.sendMessage({
            type: 'WHISPER_RESULT',
            text: result.text,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[Whisper] Failed to send result message:', err);
        });

    } catch (error) {
        console.error('[Whisper] Processing error:', error.message);

        chrome.runtime.sendMessage({
            type: 'WHISPER_PROCESS_ERROR',
            error: error.message,
            timestamp: Date.now(),
        }).catch(err => {
            console.error('[Whisper] Failed to send error message:', err);
        });
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] Received message:', message.type);


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


    if (message.type === 'WHISPER_INIT') {
        initializeWhisper(message).catch(err => {
            console.error('[Offscreen] Error in WHISPER_INIT:', err);
        });
        sendResponse({ status: 'initializing' });
        return true;
    }

    if (message.type === 'WHISPER_PROCESS_AUDIO') {
        processAudioWithWhisper(message.audioData).catch(err => {
            console.error('[Offscreen] Error in WHISPER_PROCESS_AUDIO:', err);
        });
        sendResponse({ status: 'processing' });
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
