# @steelbrain/media-speech-detection-web

Enterprise-grade Speech Detection using Silero VAD ONNX model for web browsers.

## Installation

```bash
npm install @steelbrain/media-speech-detection-web
```

**Modern Bundler Support**: This package is fully compatible with modern bundlers (Webpack 5, Next.js, Vite, etc.). The ONNX model file is automatically detected and bundled - no manual setup or public folder configuration required.

## Quick Start

```typescript
import { speechFilter, speechEvents } from '@steelbrain/media-speech-detection-web';
import { ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '@steelbrain/media-ingest-audio';

// Get microphone access
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: RECOMMENDED_AUDIO_CONSTRAINTS
});

// Create 16kHz audio stream
const audioStream = await ingestAudioStream(mediaStream);

// Option 1: Filter audio to only speech chunks
const vadTransform = speechFilter({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: () => console.log('🔇 Speech ended'),
  threshold: 0.5
});

await audioStream
  .pipeThrough(vadTransform)
  .pipeTo(speechProcessor);

// Option 2: Events-only (no audio output)
const vadSink = speechEvents({
  onSpeechStart: () => console.log('🎤 Speech started'),
  onSpeechEnd: (speechAudio) => console.log('🔇 Speech ended'),
  onVadMisfire: () => console.log('⚠️ Short speech segment filtered'),
  threshold: 0.5,
  minSpeechDurationMs: 160
});

await audioStream.pipeTo(vadSink);
```

## API Reference

### `speechFilter(options): TransformStream<Float32Array, Float32Array>`

Creates a TransformStream that filters audio, outputting only speech chunks.

**Usage**: `audioStream.pipeThrough(speechFilter(options)).pipeTo(processor)`

### `speechEvents(options): WritableStream<Float32Array>`

Creates a WritableStream that processes audio and emits speech detection events.

**Usage**: `audioStream.pipeTo(speechEvents(options))`

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
  lookBackDurationMs?: number;     // Lookback buffer for smooth speech start. Default: 192ms
  speechPadMs?: number;           // Padding around speech segments. Default: 64ms
}
```

### Optimal Defaults

The package provides carefully tuned defaults that work well for most use cases:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `threshold` | `0.5` | Balanced speech detection |
| `minSpeechDurationMs` | `160ms` | Filters out very short sounds |
| `redemptionDurationMs` | `400ms` | Handles natural speech pauses |
| `lookBackDurationMs` | `192ms` | Captures speech start smoothly |
| `speechPadMs` | `64ms` | Adds silence padding around speech |

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
