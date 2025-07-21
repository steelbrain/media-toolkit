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

// Basic usage - convert to 16kHz audio stream
const audioStream = await ingestAudioStream(mediaStream);

// With volume gain - boost quiet microphones
const boostedAudioStream = await ingestAudioStream(mediaStream, { gain: 2.0 });

// With volume reduction - lower loud inputs
const quietAudioStream = await ingestAudioStream(mediaStream, { gain: 0.5 });

// Read audio data
const reader = audioStream.getReader();
const { value } = await reader.read(); // Float32Array of 16kHz samples

// Clean up when done
await reader.cancel();
```

## API

### `ingestAudioStream(mediaStream: MediaStream, options?: AudioIngestOptions): Promise<ReadableStream<Float32Array>>`

Converts a MediaStream into a ReadableStream of 16kHz audio data with optional volume gain.

- **mediaStream**: MediaStream containing audio tracks
- **options**: Optional configuration (see `AudioIngestOptions`)
- **Returns**: ReadableStream that yields Float32Array chunks of 16kHz audio samples

### `AudioIngestOptions`

Configuration options for audio ingestion:

```typescript
interface AudioIngestOptions {
  /** Volume gain multiplier. 1.0 = no change, 2.0 = double volume, 0.5 = half volume. Default: 1.0 */
  gain?: number;
}
```

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
2. Uses AudioWorklet for efficient audio processing with optional volume gain
3. Automatically handles sample rate conversion from input to 16kHz
4. Applies volume gain multiplier to audio samples when specified
5. Preserves all audio channels (mono/stereo) in the output stream

## Use Cases

### 🎤 **Microphone Normalization**
```typescript
// Boost quiet microphones (common for built-in laptop mics)
const audioStream = await ingestAudioStream(mediaStream, { gain: 1.5 });
```

### 🔉 **Volume Reduction**
```typescript
// Reduce loud inputs to prevent clipping in downstream processing
const audioStream = await ingestAudioStream(mediaStream, { gain: 0.7 });
```

### 🎚️ **Dynamic Range Adjustment**
```typescript
// Amplify weak signals for better speech detection accuracy
const audioStream = await ingestAudioStream(mediaStream, { gain: 2.5 });
```

### 🎧 **Device-Specific Optimization**
```typescript
// Different gain settings based on microphone characteristics
const micLabel = mediaStream.getAudioTracks()[0].label.toLowerCase();
const gain = micLabel.includes('built-in') ? 1.8 : // Built-in mics are usually quiet
             micLabel.includes('headset') ? 1.2 :   // Headsets need moderate boost
             1.0; // External mics are usually well-calibrated

const audioStream = await ingestAudioStream(mediaStream, { gain });
```

## Performance

- **Zero-copy optimization**: When `gain: 1.0` (default), no multiplication is performed
- **Efficient processing**: Gain is applied directly in the AudioWorklet thread
- **Low latency**: Processing happens in real-time without buffering delays
- **Memory efficient**: Only creates new arrays when gain is applied

## License

MIT
