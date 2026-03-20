# Changelog

## [2.4.0] - 2026-03-18

### Features

- rename engine labels from technical to user-friendly names

### Bug Fixes

- replace emojis with SVG icons, fix text injection into active fields
- overlay button not opening floating window

### Other Changes

- Merge pull request #8 from caelicode/feature/v2.2.0-redesign-and-session-limit


## [2.3.0] - 2026-03-16

### Features

- redesign UI with teal/cyan theme, add dark/light mode, session limit, and owner bypass

### Bug Fixes

- **ci:** correct workflow configs for branch protection and zip contents

### Other Changes

- Merge pull request #7 from caelicode/feature/v2.2.0-redesign-and-session-limit
- Merge pull request #2 from caelicode/renovate/major-github-actions
- Merge pull request #6 from caelicode/fix/workflow-updates
- **deps:** update github-actions


## [2.1.2] - 2026-02-28

### Other Changes

- Add LemonSqueezy license API integration and widget hide/show button


## [2.1.1] - 2026-02-28

### Other Changes

- Initial commit: SpeakScribe v2.1.0 - Live Speech to Text Chrome Extension


## [2.1.0] - 2026-02-28

### Features

- add freemium licensing system with feature gating


## [2.0.1] - 2026-02-28

### Bug Fixes

- **options:** align CSS class names with HTML structure


All notable changes to SpeakScribe are documented in this file.
This project follows [Semantic Versioning](https://semver.org/) and
uses [Conventional Commits](https://www.conventionalcommits.org/) for
automated release management.

## [2.0.0] - 2026-02-28

### Features

- Voice commands engine (undo, delete word, clear, select all, caps mode, bold)
- Smart punctuation with automatic capitalization
- Multi-language support with per-site language overrides
- Meeting transcription mode with tab audio capture
- Export transcripts in TXT, SRT, Markdown, and JSON formats
- Keyboard shortcuts (Ctrl+Shift+T, Ctrl+Shift+O, Ctrl+Shift+M)
- Draggable floating widget with position persistence
- Per-site settings management
- Whisper AI offline engine scaffold (via Transformers.js)
- Direct text injection into ChatGPT, Gemini, and all contenteditable fields
- Custom vocabulary and word replacement rules
- Injection history with undo support
- Command palette for discovering voice commands

### Other Changes

- Initial public release
