# Speech Detection Web Demo

A comprehensive Next.js 15 demonstration app showcasing the `@steelbrain/media-speech-detection-web` package capabilities with real-time speech detection, audio filtering, and playback functionality.

## Features

This demo showcases the complete speech detection pipeline:

### 🎤 **Real-time Speech Detection**
- Production-ready speech detection using Silero VAD ONNX model
- Zero-configuration setup with optimal defaults
- Real-time speech/silence classification with visual feedback

### 🔄 **Streaming Architecture**
- Modern Web Streams API pipeline: `microphone → speech detection → audio processor`
- Efficient processing with minimal latency (~160ms end-to-end)
- Automatic resource cleanup and error handling

### 🎧 **Audio Processing Pipeline**
- Automatic microphone access with optimal audio constraints
- 16kHz audio resampling via AudioWorklet
- Speech-only audio filtering (dramatic bandwidth reduction)
- Lookback buffer for smooth speech start capture

### 📊 **Interactive Testing**
- **Live Event Log**: Real-time speech start/end events with timestamps
- **Audio Playback**: Record and play back detected speech segments
- **Buffer Management**: Clear and manage captured speech chunks
- **Visual Indicators**: Recording status and speech buffer size

### 🛠️ **Production-Ready Features**
- **Error Handling**: Graceful microphone access failures and stream errors
- **Resource Management**: Proper cleanup of audio contexts and streams
- **Browser Compatibility**: Works across modern browsers with WASM support
- **Sample Rate Handling**: Automatic detection and handling of audio format mismatches

## Quick Start

### Prerequisites

- Node.js 22.0.0+ (see `.nvmrc`)
- Modern browser with WASM and Web Workers support

### Installation & Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm run start
```

## Usage Guide

### 1. **Start Speech Detection**
   - Click "🎤 Start Speech Detection" to request microphone access
   - Grant microphone permissions when prompted
   - The app will initialize the Silero VAD model automatically

### 2. **Test Speech Detection**
   - Speak naturally - you'll see "🎤 Speech started" events in real-time
   - Pause speaking - you'll see "🔇 Speech ended" events
   - Background noise and short sounds are automatically filtered out
   - Watch the speech buffer grow as chunks are captured

### 3. **Verify Results**
   - Click "🔊 Play Speech" to hear back only the detected speech segments
   - Notice that silence, background noise, and non-speech sounds are filtered out
   - Use "🗑️ Clear Buffer" to reset and start fresh

### 4. **Observe the Technology**
   - Check browser console for detailed technical logs
   - Monitor speech detection probabilities and state machine transitions
   - Observe automatic sample rate handling and audio format conversion

## Technical Implementation

### Architecture Overview

```typescript
// Complete pipeline implementation
const speechTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  onVadMisfire: () => console.log('⚠️ Speech too short'),

  // Optimal defaults (customizable)
  threshold: 0.5,                    // Speech detection sensitivity
  minSpeechDurationMs: 160,          // Minimum speech length
  redemptionDurationMs: 400,         // Grace period for pauses
  lookBackDurationMs: 384,           // Smooth speech start buffer
});

// Stream processing pipeline
await audioStream
  .pipeThrough(speechTransform)      // Filter for speech only
  .pipeTo(speechCollector);          // Collect speech chunks
```

### Key Technologies

- **Next.js 15** with React 19 and Turbopack for fast development
- **@steelbrain/media-ingest-audio** for microphone access and 16kHz conversion
- **@steelbrain/media-speech-detection-web** for speech detection filtering
- **Web Streams API** for efficient pipeline processing
- **Web Audio API** for audio playback and format handling
- **Silero VAD ONNX Model** for production-ready speech detection accuracy

### Performance Characteristics

- **Detection Latency**: ~160ms for speech confirmation
- **Ongoing Latency**: ~32ms per frame once speaking
- **Lookback Buffer**: ~384ms historical context (not latency)
- **CPU Usage**: <1-2ms per 32ms audio frame for inference
- **Memory Footprint**: ~8KB buffering per stream + 2.3MB model
- **Bandwidth Reduction**: Typically 80-90% reduction (speech-only output)

## Configuration Options

The demo uses optimal defaults, but all parameters are customizable:

```typescript
const speechTransform = speechFilter({
  // Event Handlers
  onSpeechStart: () => void,           // Speech detection start
  onSpeechEnd: (audio) => void,        // Speech detection end + audio data
  onVadMisfire: () => void,            // Short speech segment filtered
  onError: (error) => void,            // Error handling
  onDebugLog: (message) => void,       // Internal state logging

  // Detection Configuration (all optional)
  threshold: 0.5,                      // Speech probability threshold (0-1)
  minSpeechDurationMs: 160,            // Minimum speech duration (ms)
  redemptionDurationMs: 400,           // Grace period before speech end (ms)
  lookBackDurationMs: 384,             // Lookback buffer duration (ms)
});
```

## Browser Support

Requires modern browsers with WASM and Web Workers:
- ✅ Chrome 69+
- ✅ Firefox 79+
- ✅ Safari 14+
- ✅ Edge 79+

## Troubleshooting

### Common Issues

**Microphone Access Denied**
- Ensure HTTPS is used (required by browsers for microphone access)
- Check browser permissions and allow microphone access
- Refresh page and try again if permissions were recently changed

**Slow or No Speech Detection**
- Check console for ONNX model loading errors
- Ensure stable internet connection for model download
- Try speaking louder or closer to microphone

**Playback Issues**
- Sample rate mismatches are handled automatically
- Check browser console for audio context state warnings
- Try clicking in the page to allow audio playback (browser policy)

### Development Tips

**Enable Debug Logging**
```typescript
const speechTransform = speechFilter({
  onDebugLog: (message) => console.log('Debug:', message),
  // ... other options
});
```

**Monitor Speech Probabilities**
Enable debug logging to see frame-by-frame speech detection probabilities and state machine transitions.

**Test Different Scenarios**
- Try different background noise levels
- Test with multiple speakers
- Experiment with different speech patterns (fast/slow, loud/quiet)

## Architecture Notes

This demo illustrates best practices for integrating speech detection into web applications:

### Stream-First Design
Uses Web Streams API throughout for optimal performance and memory efficiency.

### Event-Driven Architecture
Clean separation of concerns with callback-based event handling.

### Resource Management
Proper cleanup of audio contexts, streams, and ONNX sessions.

### Error Resilience
Comprehensive error handling for production deployment.

### Zero Configuration
Works perfectly with defaults while remaining fully customizable.

## Production Deployment

This demo is production-ready and can be deployed to any modern hosting platform:

```bash
# Build and deploy
npm run build
npm run start

# Or deploy to Vercel, Netlify, etc.
```

The speech detection model and AudioWorklet files are automatically bundled - no additional configuration required.

## License

MIT License - See LICENSE file for details.
