# CrowTerminal Companion

> Free, open-source AI transcription for content creators. Your data never leaves your device.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/CrowTerminal/companion)](https://github.com/CrowTerminal/companion/releases)
[![Downloads](https://img.shields.io/github/downloads/CrowTerminal/companion/total)](https://github.com/CrowTerminal/companion/releases)

## Features

- **Local Transcription** - Transcribe any audio/video using Whisper AI locally
- **100% Private** - Your data never leaves your computer
- **Works Offline** - No internet required after initial setup
- **TikTok Analysis** - Analyze TikTok videos for performance insights
- **Cloud Sync** (Optional) - Sync transcripts to CrowTerminal cloud

## Download

### macOS
- [Download for Mac (Apple Silicon & Intel)](https://github.com/CrowTerminal/companion/releases/latest/download/CrowTerminal-Companion.dmg)
- Requires macOS 11.0 or later

### Windows
- [Download for Windows](https://github.com/CrowTerminal/companion/releases/latest/download/CrowTerminal-Companion-Setup.exe)
- Requires Windows 10 or later

### Linux
- [Download AppImage](https://github.com/CrowTerminal/companion/releases/latest/download/CrowTerminal-Companion.AppImage)

Or build from source (see below).

## Screenshots

![CrowTerminal Companion](https://crowterminal.com/screenshots/companion-main.png)

## Tech Stack

- **Electron** - Cross-platform desktop app
- **React** - UI framework
- **TypeScript** - Type safety
- **Whisper.cpp** - Local speech recognition
- **Vite** - Build tool

## Building from Source

### Prerequisites

- Node.js 18+
- npm or yarn
- Python 3.8+ (for some AI features)

### Setup

```bash
# Clone the repository
git clone https://github.com/CrowTerminal/companion.git
cd companion

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
# Build for current platform
npm run build

# Build for Mac
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | CrowTerminal API URL (for cloud sync) | `https://api.crowterminal.com` |

## Cloud Sync (Optional)

CrowTerminal Companion can optionally sync your transcripts to the cloud:

1. Create a free account at [crowterminal.com](https://crowterminal.com)
2. Log in within the app
3. Your transcripts will sync automatically

Cloud sync is completely optional - the app works fully offline.

## Privacy

- **All transcription happens locally** on your device
- Audio/video files are never uploaded
- Cloud sync only uploads transcript text (if enabled)
- You can use the app 100% offline

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Support

- [Report a bug](https://github.com/CrowTerminal/companion/issues)
- [Request a feature](https://github.com/CrowTerminal/companion/issues)
- [Documentation](https://crowterminal.com/docs/companion)

## License

MIT License - see [LICENSE](LICENSE) for details.

## About CrowTerminal

CrowTerminal Companion is made by [CrowTerminal](https://crowterminal.com), an AI-powered platform for influencer marketing agencies.

This desktop app is our gift to the creator community - free and open source forever.

---

**Made with love in Brazil**
