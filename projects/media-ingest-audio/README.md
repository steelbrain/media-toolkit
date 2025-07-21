# @steelbrain/media-ingest-audio

Convert MediaStream audio to 16kHz ReadableStream for downstream processing.

## Installation

```bash
npm install @steelbrain/media-ingest-audio
```

**Modern Bundler Support**: This package is fully compatible with modern bundlers (Webpack 5, Next.js, Vite, etc.). The AudioWorklet file is automatically detected and bundled - no manual setup or public folder configuration required.

## Usage

```typescript
import { ingestAudioStream, RECOMMENDED_AUDIO_CONSTRAINTS } from '@steelbrain/media-ingest-audio';

// Get microphone access
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: RECOMMENDED_AUDIO_CONSTRAINTS
});

// Convert to 16kHz audio stream
const audioStream = await ingestAudioStream(mediaStream);

// Read audio data
const reader = audioStream.getReader();
const { value } = await reader.read(); // Float32Array of 16kHz samples

// Clean up when done
await reader.cancel();
```

## API

### `ingestAudioStream(mediaStream: MediaStream): Promise<ReadableStream<Float32Array>>`

Converts a MediaStream into a ReadableStream of 16kHz audio data.

- **mediaStream**: MediaStream containing audio tracks
- **Returns**: ReadableStream that yields Float32Array chunks of 16kHz audio samples

### `RECOMMENDED_AUDIO_CONSTRAINTS`

Optimal audio constraints for voice processing:

```typescript
{
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true
}
```

## How it Works

1. Creates an AudioContext with 16kHz sample rate
2. Uses AudioWorklet for efficient audio processing
3. Automatically handles sample rate conversion from input to 16kHz
4. Preserves all audio channels (mono/stereo) in the output stream

## License

MIT
