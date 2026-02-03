# CrowTerminal Companion

> Free, open-source AI toolkit for content creators. Transcription, voice cloning, TTS, and video analysis - all local, all private.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/CrowTerminal/companion-)](https://github.com/CrowTerminal/companion-/releases)
[![Downloads](https://img.shields.io/github/downloads/CrowTerminal/companion-/total)](https://github.com/CrowTerminal/companion-/releases)

## Features

### Transcription
- **Whisper AI** - Transcribe any audio or video file locally
- **Multiple Languages** - Support for 99+ languages
- **Model Selection** - Choose from tiny to large models based on your hardware

### Voice Studio
- **Voice Cloning** - Clone any voice from a short audio sample
- **Text-to-Speech** - Generate natural speech from text using cloned voices
- **Local Processing** - All voice synthesis happens on your device

### Content Analysis
- **TikTok Score** - Analyze TikTok videos and get performance predictions
- **AI Content Analyst** - Get content suggestions powered by local LLM (Ollama)
- **Trend Insights** - Understand what makes content perform

### Privacy First
- **100% Local** - All AI processing happens on your computer
- **Works Offline** - No internet required after initial setup
- **Your Data Stays Yours** - Nothing is uploaded unless you choose cloud sync

## Download

### macOS
| Chip | Download |
|------|----------|
| Apple Silicon (M1/M2/M3) | [Download DMG](https://github.com/CrowTerminal/companion-/releases/latest/download/CrowTerminal-Companion-1.0.0-arm64.dmg) |
| Intel | [Download DMG](https://github.com/CrowTerminal/companion-/releases/latest/download/CrowTerminal-Companion-1.0.0.dmg) |

Requires macOS 11.0 or later. On first launch, right-click the app and select "Open".

### Windows
[Download Installer](https://github.com/CrowTerminal/companion-/releases/latest/download/CrowTerminal-Companion-Setup-1.0.0.exe)

Requires Windows 10 or later. Click "More info" > "Run anyway" if Windows Defender shows a warning.

### Linux
Coming soon. Build from source for now.

## Tech Stack

- **Electron** - Cross-platform desktop app
- **React** - UI framework
- **TypeScript** - Type safety
- **Whisper.cpp** - Local speech recognition
- **Ollama** - Local LLM for content analysis
- **Coqui TTS** - Voice cloning and text-to-speech
- **Vite** - Build tool

## Building from Source

### Prerequisites

- Node.js 18+
- npm or yarn
- Python 3.8+ (for voice cloning and TikTok analysis)
- [Ollama](https://ollama.ai) (optional, for AI content analysis)

### Setup

```bash
# Clone the repository
git clone https://github.com/CrowTerminal/companion-.git
cd companion-

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
# Build for Mac
npm run package:mac

# Build for Windows
npm run package:win

# Build for Linux
npm run package:linux
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

CrowTerminal Companion can optionally sync your work to the cloud:

1. Create a free account at [crowterminal.com](https://crowterminal.com)
2. Log in within the app
3. Your transcripts and projects will sync automatically

Cloud sync is completely optional - the app works fully offline.

## System Requirements

| Feature | Minimum | Recommended |
|---------|---------|-------------|
| RAM | 4GB | 8GB+ |
| Storage | 2GB | 10GB (for models) |
| CPU | Any 64-bit | Apple Silicon / Modern Intel/AMD |
| GPU | Not required | NVIDIA/Apple GPU for faster processing |

### Model Sizes

| Whisper Model | Size | Quality | Speed |
|---------------|------|---------|-------|
| tiny | 75MB | Basic | Fastest |
| base | 142MB | Good | Fast |
| small | 466MB | Better | Medium |
| medium | 1.5GB | Great | Slower |
| large-v3 | 3GB | Best | Slowest |

## Privacy

- **All AI processing happens locally** on your device
- Audio/video files are never uploaded
- Voice clones stay on your computer
- Cloud sync only uploads text data (if enabled)
- You can use the app 100% offline

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

```bash
# Run in development mode
npm run dev

# Lint code
npm run lint

# Type check
npm run typecheck
```

## Support

- [Report a bug](https://github.com/CrowTerminal/companion-/issues)
- [Request a feature](https://github.com/CrowTerminal/companion-/issues)
- [Documentation](https://crowterminal.com/docs/companion)

## License

MIT License - see [LICENSE](LICENSE) for details.

## About CrowTerminal

CrowTerminal Companion is made by [CrowTerminal](https://crowterminal.com), an AI-powered platform for influencer marketing agencies.

This desktop app is our gift to the creator community - free and open source forever.

---

**Made with love in Brazil**
