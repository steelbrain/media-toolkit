# 🎵 Media Toolkit

**High-performance media processing packages for web applications** - A TypeScript monorepo focused on audio streaming and speech detection with modern Web APIs.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.0+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

🎤 **Real-time Speech Detection** - Advanced speech/silence classification
📡 **Streaming Architecture** - Built on modern Web Streams API
🔄 **Zero Configuration** - Works perfectly with optimal defaults
⚡ **High Performance** - <1ms inference, ~256ms end-to-end latency
🛠️ **Production Ready** - Comprehensive error handling and resource management
🌐 **Modern Bundlers** - Works seamlessly with Webpack 5, Next.js, Vite, etc.

## 📦 Packages

### [@steelbrain/media-ingest-audio](./projects/media-ingest-audio)

Convert MediaStream audio to 16kHz ReadableStream for downstream processing.

```bash
npm install @steelbrain/media-ingest-audio
```

**Key Features:**
- 🎙️ Automatic microphone access with optimal constraints
- 🔄 16kHz resampling via AudioWorklet
- 📊 Preserves audio quality during conversion
- 🛡️ Handles sample rate conversion transparently

```typescript
import { ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '@steelbrain/media-ingest-audio';

const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: RECOMMENDED_AUDIO_CONSTRAINTS
});

const audioStream = await ingestAudioStream(mediaStream);
// Returns ReadableStream<Float32Array> of 16kHz audio samples
```

### [@steelbrain/media-speech-detection-web](./projects/media-speech-detection-web)

High-performance speech detection using Silero VAD ONNX model for web browsers.

```bash
npm install @steelbrain/media-speech-detection-web
```

**Key Features:**
- 🧠 Silero VAD ONNX model (MIT licensed, production-ready accuracy)
- 🔄 Modern streaming interface with Web Streams API
- 📦 Two interfaces: `speechFilter()` (TransformStream) and `speechEvents()` (WritableStream)
- ⚡ Optimized defaults: 160ms detection, 192ms lookback, 400ms redemption
- 🛠️ Comprehensive callbacks: `onSpeechStart`, `onSpeechEnd`, `onError`, `onDebugLog`

```typescript
import { speechFilter } from '@steelbrain/media-speech-detection-web';

// Create speech detection transform
const speechTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  threshold: 0.5,
  minSpeechDurationMs: 160
});

// Chain the pipeline: audio → speech detection → processor
await audioStream
  .pipeThrough(speechTransform)
  .pipeTo(speechProcessor);
```

## 🚀 Quick Start

### Complete Pipeline Example

```typescript
import { ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '@steelbrain/media-ingest-audio';
import { speechFilter } from '@steelbrain/media-speech-detection-web';

// 1. Get microphone access
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: RECOMMENDED_AUDIO_CONSTRAINTS
});

// 2. Convert to 16kHz stream
const audioStream = await ingestAudioStream(mediaStream);

// 3. Create speech detection filter
const speechTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  threshold: 0.5 // Optimal default
});

// 4. Process only speech audio
await audioStream
  .pipeThrough(speechTransform)
  .pipeTo(new WritableStream({
    write(speechChunk) {
      // Only receives audio chunks containing speech
      sendToTranscription(speechChunk);
    }
  }));
```

## 🛠️ Development

### Prerequisites

- **Node.js**: 22.0.0+ (see `.nvmrc`)
- **Package Manager**: yarn (workspaces enabled)
- **Browser**: Chrome 69+, Firefox 79+, Safari 14+, Edge 79+

### Setup

```bash
# Clone and install
git clone <repository-url>
cd media-toolkit
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Type checking
yarn typecheck
```

### Monorepo Structure

```
media-toolkit/
├── projects/
│   ├── media-ingest-audio/           # MediaStream → ReadableStream
│   ├── media-speech-detection-web/   # Speech detection with Silero VAD
│   └── example-nextjs/               # Complete demo application
├── package.json                      # Workspace configuration
├── tsconfig.json                     # Shared TypeScript config
└── CLAUDE.md                         # Development guidelines
```

### Development Commands

```bash
# Root level (all packages)
yarn build         # Build all packages using zshy
yarn test          # Run vitest across all packages
yarn lint          # Lint all packages
yarn typecheck     # TypeScript validation across workspace

# Package level (in any projects/* directory)
npm run build      # zshy transpilation to ESM with declarations
npm run test       # vitest test runner
npm run typecheck  # tsc --noEmit validation

# Next.js example app
cd projects/example-nextjs
npm run dev        # Development server
npm run build      # Production build
```

## 🎮 Live Demo

The `example-nextjs` project provides a comprehensive demonstration of the complete pipeline:

```bash
cd projects/example-nextjs
npm install
npm run dev
# Open http://localhost:3000
```

**Demo Features:**
- 🎤 Real-time speech detection with visual feedback
- 📊 Live event logging and speech probability monitoring
- 🔊 Audio playback of captured speech segments
- 🛠️ Interactive testing with different audio scenarios
- 📈 Performance metrics and technical details

## 🏗️ Architecture

### Streaming-First Design

Both packages are built around modern Web Streams API for optimal performance:

- **ReadableStream/WritableStream** patterns throughout
- **TransformStream** for audio pipeline processing
- **Minimal buffering** with automatic memory management
- **Backpressure handling** for stable streaming

### Performance Characteristics

| Metric | Value | Description |
|--------|-------|-------------|
| **Detection Latency** | ~160ms | Time to confirm speech detection |
| **Lookback Buffer** | ~192ms | Smooth speech start capture |
| **End-to-End Latency** | ~256ms | Complete pipeline processing |
| **CPU Usage** | <1-2ms/frame | ONNX inference per 32ms frame |
| **Memory Footprint** | ~8KB + 2.3MB | Buffers + ONNX model |
| **Bandwidth Reduction** | 80-90% | Speech-only audio filtering |

### Modern Bundler Support

All packages are fully compatible with modern build tools:
- ✅ **Webpack 5** with automatic asset detection
- ✅ **Next.js** with zero configuration
- ✅ **Vite** with native ESM support
- ✅ **Auto-bundling** of ONNX models and AudioWorklets

## 🎯 Use Cases

### Real-time Transcription
Filter audio streams to send only speech segments to ASR services, reducing costs and improving accuracy.

### Voice Commands
Eliminate background noise and focus processing on actual speech for voice control interfaces.

### Recording Optimization
Capture only spoken content, dramatically reducing file sizes and storage requirements.

### Streaming Applications
Reduce bandwidth usage by transmitting speech-only audio in real-time communication apps.

### Voice Analytics
Process speech segments for sentiment analysis, keyword detection, or conversation insights.

## 🧪 Technical Details

### Audio Processing
- **Input Format**: Any MediaStream (typically microphone)
- **Processing Rate**: 16kHz PCM mono (industry standard)
- **Frame Size**: 512 samples (32ms frames)
- **Context Window**: 64 samples for model accuracy

### Speech Detection Model
- **Model**: [Silero VAD v4.0](https://github.com/snakers4/silero-vad) (MIT License)
- **Format**: ONNX (~2.3MB)
- **Accuracy**: Production-ready performance across diverse conditions
- **Languages**: Optimized for multiple languages
- **Performance**: Real-time inference on modern browsers

### State Machine
Advanced speech detection logic with multiple states:
- **Silent** → **Detecting** → **Speaking** → **Intermediate** → **Silent**
- Smart buffering during detection phase
- Redemption period for natural speech pauses
- Automatic filtering of short non-speech sounds

## 📄 Documentation

- **[Media Ingest Audio](./projects/media-ingest-audio/README.md)** - MediaStream conversion
- **[Speech Detection](./projects/media-speech-detection-web/README.md)** - Silero VAD integration
- **[Example App](./projects/example-nextjs/README.md)** - Complete demo guide
- **[Development Guide](./CLAUDE.md)** - Architecture and implementation details

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Add tests for new functionality
- Update documentation for API changes
- Ensure all packages build successfully

## 🙏 Acknowledgments

- **[Silero Team](https://github.com/snakers4/silero-vad)** - For the excellent VAD ONNX model (MIT License)
- **ONNX Runtime Web** - For efficient in-browser ML inference
- **Web Audio API** - For high-performance audio processing
- **Web Streams API** - For modern streaming architecture

## 📝 License

MIT License - see [LICENSE](./LICENSE) file for details.

**Silero VAD Model**: MIT License (© Silero Team)

---

Built with ❤️ for modern web applications requiring advanced speech processing.
