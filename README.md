# SpeakScribe - Live Speech to Text Chrome Extension

Real-time speech-to-text transcription with a draggable floating widget, screen-share safe overlay, smart punctuation, custom vocabulary, and offline Whisper AI support (coming in v2.0).

## Features

- **Draggable Floating Widget**: A mic icon that floats on every page; drag it anywhere on your screen
- **Live Transcription**: See text appear word-by-word as you speak in real-time
- **Screen-Share Safe**: Floating overlay window that is NOT captured when sharing a specific tab or window
- **Smart Punctuation**: Say "comma", "period", "question mark" and get actual symbols
- **Custom Vocabulary**: Add technical terms, names, and jargon for better recognition
- **Hotkey Toggle**: Ctrl+Shift+T to start/stop, Ctrl+Shift+O to toggle overlay
- **Export**: Copy or save transcripts as TXT or JSON
- **Privacy First**: Web Speech API processes audio locally; Whisper AI (v2.0) runs entirely in-browser
- **Donation Support**: Built-in Buy Me a Coffee, Ko-fi, and GitHub Sponsors links

## Installation (Local Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `speakscribe-extension` folder
5. The SpeakScribe icon should appear in your extensions toolbar
6. Visit any webpage; you'll see the floating mic widget in the bottom-right corner

## Usage

1. **On any webpage**: Click the floating mic widget (bottom-right) to start transcribing
2. Speak naturally; your words appear in a bubble above the widget in real-time
3. **Drag the widget** anywhere on the screen by clicking and dragging
4. Hover over the widget to see quick action buttons (copy, clear, overlay)
5. **From the popup**: Click the SpeakScribe icon in the toolbar for the full control panel
6. Use **Ctrl+Shift+T** to toggle transcription on/off from any tab
7. Use **Ctrl+Shift+O** to toggle the screen-share safe floating overlay

## Draggable Widget

The floating mic icon appears on every page and can be:
- **Clicked** to start/stop transcription
- **Dragged** anywhere on the screen (position is saved across sessions)
- **Hovered** to reveal quick actions and the transcript bubble
- The widget remembers its position so it stays where you put it

## Screen-Share Safety

The floating transcript overlay opens as a separate Chrome popup window. When you share a **specific tab** or **specific application window** in Zoom, Google Meet, or Teams, this popup is NOT included in the capture. This covers the majority of screen-sharing scenarios.

For full-screen (entire monitor) sharing, use **Ctrl+Shift+O** to instantly hide the overlay.

## Architecture

```
speakscribe-extension/
  manifest.json          # Manifest V3 configuration
  pages/
    popup.html           # Extension popup UI
    floating.html        # Screen-share safe overlay window
    options.html         # Settings page
    offscreen.html       # Offscreen document for tab capture
    upgrade.html         # Pro upgrade/pricing page
  css/
    popup.css            # Popup styles (dark theme)
    floating.css         # Floating window styles
    options.css          # Options page styles
    content.css          # Draggable widget styles
  js/
    background.js        # Service worker (state, messaging, commands)
    popup.js             # Popup controller
    floating.js          # Floating window controller
    options.js           # Settings controller
    speech-engine.js     # Web Speech API wrapper with auto-restart
    punctuation.js       # Smart punctuation post-processor
    whisper-engine.js    # Whisper WASM scaffold (v2.0)
    content.js           # Content script (draggable widget + speech recognition)
  icons/
    icon16.png
    icon48.png
    icon128.png
```

## Roadmap

- [x] v1.0: Web Speech API real-time transcription
- [x] v1.0: Draggable floating widget on every page
- [x] v1.0: Screen-share safe floating overlay
- [x] v1.0: Smart punctuation post-processing
- [x] v1.0: Custom vocabulary support
- [x] v1.0: Hotkey controls
- [x] v1.0: Donation integration
- [ ] v2.0: Whisper WASM for offline, high-accuracy transcription
- [ ] v2.0: Speaker diarization (who said what)
- [ ] v2.0: Auto-summary of transcripts
- [ ] v2.0: Direct paste into active text field

## Publishing to Chrome Web Store

1. Zip the `speakscribe-extension` folder
2. Go to https://chrome.google.com/webstore/devconsole
3. Pay the one-time $5 developer registration fee
4. Upload the zip file
5. Fill in listing details (description, screenshots, category)
6. Submit for review (typically 1-3 business days)

## License

MIT
