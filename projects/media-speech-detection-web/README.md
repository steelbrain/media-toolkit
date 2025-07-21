# @steelbrain/media-speech-detection-web

Speech Detection using Silero VAD ONNX model for web browsers.

## Installation

```bash
npm install @steelbrain/media-speech-detection-web
```

**Modern Bundler Support**: This package is fully compatible with modern bundlers (Webpack 5, Next.js, Vite, etc.). The ONNX model file is automatically detected and bundled - no manual setup or public folder configuration required.

## Quick Start

```typescript
import { speechFilter } from '@steelbrain/media-speech-detection-web';
import { ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '@steelbrain/media-ingest-audio';

// Get microphone access
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: RECOMMENDED_AUDIO_CONSTRAINTS
});

// Create 16kHz audio stream
const audioStream = await ingestAudioStream(mediaStream);

// Filter audio to only speech chunks
const vadTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  threshold: 0.5
});

await audioStream
  .pipeThrough(vadTransform)
  .pipeTo(speechProcessor);

// Events-only (no audio output) using .tee() pattern
const [processStream, eventsStream] = audioStream.tee();

// Process audio on one branch
processStream.pipeTo(speechProcessor);

// Handle events on another branch without outputting audio
eventsStream.pipeThrough(speechFilter({
  noEmit: true,  // Don't emit audio chunks
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  onVadMisfire: () => console.log('⚠️ Short speech segment filtered')
}));
```

## API Reference

### `speechFilter(options): TransformStream<Float32Array, Float32Array>`

Creates a TransformStream that filters audio, outputting only speech chunks. Use the `noEmit` option for events-only processing.

**Usage**: `audioStream.pipeThrough(speechFilter(options)).pipeTo(processor)`

### Configuration Options

```typescript
interface VADOptions {
  // Event Handlers
  onSpeechStart?: () => void;
  onSpeechEnd?: (speechAudio: Float32Array) => void;
  onVadMisfire?: () => void;
  onError?: (error: Error) => void;
  onDebugLog?: (message: string) => void;

  // Detection Configuration
  threshold?: number;              // Speech detection threshold (0-1). Default: 0.5
  minSpeechDurationMs?: number;    // Minimum speech duration in ms. Default: 160ms
  redemptionDurationMs?: number;   // Grace period before confirming speech end. Default: 400ms
  lookBackDurationMs?: number;     // Lookback buffer for smooth speech start. Default: 384ms
  
  // Stream Control
  noEmit?: boolean;               // Don't emit chunks, only trigger callbacks. Default: false
}
```

### Optimal Defaults

The package provides carefully tuned defaults that work well for most use cases:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `threshold` | `0.5` | Balanced speech detection |
| `minSpeechDurationMs` | `160ms` | Filters out very short sounds |
| `redemptionDurationMs` | `400ms` | Handles natural speech pauses |
| `lookBackDurationMs` | `384ms` | Captures natural audio context before speech |

## Advanced Usage

### Error Handling & Debugging

```typescript
const vadTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  onError: (error) => console.error('VAD Error:', error),
  onDebugLog: (message) => console.log('VAD Debug:', message),
  threshold: 0.6
});
```

### Real-time Speech Transcription Pipeline

```typescript
// Complete pipeline: microphone → VAD → transcription
await audioStream
  .pipeThrough(speechFilter({
    onSpeechStart: () => showRecordingIndicator(),
    onSpeechEnd: () => hideRecordingIndicator(),
    threshold: 0.5
  }))
  .pipeThrough(transcriptionTransform)
  .pipeTo(displayResults);
```

## How It Works

1. **Silero VAD Model**: Uses the pre-trained Silero VAD ONNX model for production-ready accuracy
2. **Audio Processing**: Processes 16kHz mono audio in 512-sample windows (32ms frames)
3. **State Machine**: Implements a sophisticated state machine with speech/intermediate/silent states
4. **Lookback Buffer**: Maintains a buffer to capture speech starts smoothly
5. **Temporal Smoothing**: Uses configurable timing thresholds to prevent false triggers
6. **Web Streams**: Built on modern Web Streams API for optimal performance and composability

## Model Details

- **Model**: [Silero VAD v4.0](https://github.com/snakers4/silero-vad) (MIT License)
- **Input**: 16kHz mono audio, 512 samples per inference (32ms windows)
- **Output**: Speech probability (0-1) per window + internal LSTM state
- **Model Size**: ~2.3MB ONNX format
- **Performance**: <1ms inference time per chunk on modern browsers
- **Accuracy**: Enterprise-grade performance across diverse acoustic conditions

## Credits

This package uses the [Silero VAD](https://github.com/snakers4/silero-vad) model developed by Silero Team, licensed under MIT License. The model provides state-of-the-art speech detection with excellent performance across various languages and acoustic conditions.

## License

MIT License - See LICENSE file for details.

**Silero VAD Model**: MIT License (© Silero Team)
