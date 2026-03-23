#!/usr/bin/env node
/**
 * SpeakScribe Proxy Server
 *
 * Sits between the Chrome extension and Deepgram's streaming API.
 * 1. Accepts WebSocket connections from the extension
 * 2. Validates the user's LemonSqueezy Pro license key
 * 3. Opens a Deepgram Nova-3 streaming session
 * 4. Pipes audio from the extension to Deepgram, results back
 *
 * Environment variables (see .env.example):
 *   DEEPGRAM_API_KEY   - Your Deepgram API key
 *   PORT               - WebSocket server port (default 3001)
 *   LEMONSQUEEZY_API_KEY - For server-side license validation (optional)
 *   ALLOWED_ORIGINS    - Comma-separated allowed origins (optional)
 *
 * Usage:
 *   npm install
 *   DEEPGRAM_API_KEY="..." node index.js
 */

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const url = require('url');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3001', 10);
const DG_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY || '';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [];

if (!DG_API_KEY) {
  console.error('[SpeakScribe Proxy] ERROR: DEEPGRAM_API_KEY is not set.');
  console.error('Get a free key at https://console.deepgram.com/signup');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// License validation cache (avoid hitting LemonSqueezy on every connection)
// ---------------------------------------------------------------------------
const licenseCache = new Map(); // key -> { valid: bool, expiresAt: number }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function validateLicense(licenseKey) {
  // If no LS API key is configured, skip ALL server-side validation (dev mode).
  // The extension already validates client-side; this is defense in depth.
  if (!LS_API_KEY) {
    console.log('[License] No LEMONSQUEEZY_API_KEY set (dev mode), allowing connection');
    return true;
  }

  if (!licenseKey) return false;

  // Check cache first
  const cached = licenseCache.get(licenseKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.valid;
  }

  try {
    const resp = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
    });
    const data = await resp.json();
    const valid = data.valid === true;
    licenseCache.set(licenseKey, { valid, expiresAt: Date.now() + CACHE_TTL_MS });
    console.log(`[License] Validated key ...${licenseKey.slice(-6)}: ${valid ? 'VALID' : 'INVALID'}`);
    return valid;
  } catch (err) {
    console.error('[License] Validation request failed:', err.message);
    // On network failure, allow the connection (fail open) but with short cache
    licenseCache.set(licenseKey, { valid: true, expiresAt: Date.now() + 30000 });
    return true;
  }
}

// ---------------------------------------------------------------------------
// HTTP server (health check endpoint)
// ---------------------------------------------------------------------------
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', async (clientWs, req) => {
  const parsed = url.parse(req.url || '', true);
  const licenseKey = parsed.query.license || '';
  const language = parsed.query.language || 'en';
  const diarize = parsed.query.diarize === 'true';

  const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[${clientId}] New connection. Language: ${language}, Diarize: ${diarize}`);

  // Origin check
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    if (!origin.startsWith('chrome-extension://')) {
      console.warn(`[${clientId}] Rejected: origin "${origin}" not allowed`);
      clientWs.close(4003, 'Origin not allowed');
      return;
    }
  }

  // Validate license
  const valid = await validateLicense(licenseKey);
  if (!valid) {
    console.warn(`[${clientId}] Rejected: invalid license key`);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Invalid or expired Pro license' }));
    clientWs.close(4001, 'Invalid license');
    return;
  }

  // Build Deepgram streaming URL
  const dgParams = new URLSearchParams({
    model: 'nova-3',
    language: language,
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    utterance_end_ms: '1000',
    vad_events: 'true',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
  });
  if (diarize) {
    dgParams.set('diarize', 'true');
  }

  const dgUrl = `wss://api.deepgram.com/v1/listen?${dgParams.toString()}`;

  // Connect to Deepgram
  let dgWs;
  try {
    dgWs = new WebSocket(dgUrl, {
      headers: { Authorization: `Token ${DG_API_KEY}` },
    });
  } catch (err) {
    console.error(`[${clientId}] Failed to create Deepgram connection:`, err.message);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to connect to transcription service' }));
    clientWs.close(4002, 'Deepgram connection failed');
    return;
  }

  let dgReady = false;
  let bufferedChunks = [];

  dgWs.on('open', () => {
    dgReady = true;
    console.log(`[${clientId}] Deepgram connected`);
    clientWs.send(JSON.stringify({ type: 'connected', message: 'Transcription service ready' }));

    // Flush any audio chunks that arrived before Deepgram was ready
    for (const chunk of bufferedChunks) {
      if (dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(chunk);
      }
    }
    bufferedChunks = [];
  });

  dgWs.on('message', (data) => {
    // Forward Deepgram results to the extension
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        const parsed = JSON.parse(data.toString());
        // Wrap in our message format so the extension can distinguish message types
        clientWs.send(JSON.stringify({
          type: 'transcript',
          data: parsed,
        }));
      } catch (e) {
        // Forward raw if JSON parse fails
        clientWs.send(data);
      }
    }
  });

  dgWs.on('error', (err) => {
    console.error(`[${clientId}] Deepgram error:`, err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'Transcription service error' }));
    }
  });

  dgWs.on('close', (code, reason) => {
    console.log(`[${clientId}] Deepgram disconnected: ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1000, 'Transcription session ended');
    }
  });

  // Handle audio from the extension
  clientWs.on('message', (data, isBinary) => {
    if (isBinary) {
      // Binary = audio data, forward to Deepgram
      if (dgReady && dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(data);
      } else {
        // Buffer until Deepgram is ready (keep max 20 chunks to prevent memory issues)
        if (bufferedChunks.length < 20) {
          bufferedChunks.push(data);
        }
      }
    } else {
      // Text = control message from extension
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'finalize') {
          // Tell Deepgram to finalize current utterance
          if (dgWs.readyState === WebSocket.OPEN) {
            dgWs.send(JSON.stringify({ type: 'Finalize' }));
          }
        } else if (msg.type === 'close') {
          // Graceful close
          if (dgWs.readyState === WebSocket.OPEN) {
            dgWs.send(JSON.stringify({ type: 'CloseStream' }));
          }
        } else if (msg.type === 'keepalive') {
          if (dgWs.readyState === WebSocket.OPEN) {
            dgWs.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
  });

  clientWs.on('close', () => {
    console.log(`[${clientId}] Client disconnected`);
    bufferedChunks = [];
    if (dgWs.readyState === WebSocket.OPEN || dgWs.readyState === WebSocket.CONNECTING) {
      try {
        dgWs.send(JSON.stringify({ type: 'CloseStream' }));
      } catch (e) {}
      dgWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.error(`[${clientId}] Client error:`, err.message);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
// Bind to 0.0.0.0 so Railway/Render/Fly.io can reach the server
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[SpeakScribe Proxy] Running on port ${PORT}`);
  console.log(`[SpeakScribe Proxy] Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`[SpeakScribe Proxy] WebSocket endpoint: ws://0.0.0.0:${PORT}`);
  console.log(`[SpeakScribe Proxy] Deepgram model: nova-3`);
});
