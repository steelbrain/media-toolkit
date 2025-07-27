# @steelbrain/media-ingest-audio

Convert MediaStream audio to ReadableStream with configurable sample rate for downstream processing.

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

// Basic usage - convert to 16kHz audio stream (default)
const audioStream = await ingestAudioStream(mediaStream);

// With volume gain - boost quiet microphones
const boostedAudioStream = await ingestAudioStream(mediaStream, { gain: 2.0 });

// With volume reduction - lower loud inputs
const quietAudioStream = await ingestAudioStream(mediaStream, { gain: 0.5 });

// Use custom sample rate (e.g., 48kHz for high quality)
const highQualityStream = await ingestAudioStream(mediaStream, { sampleRate: 48000 });

// Process specific channel from stereo audio
const leftChannelStream = await ingestAudioStream(mediaStream, { channelId: 0 });  // Left channel
const rightChannelStream = await ingestAudioStream(mediaStream, { channelId: 1 }); // Right channel

// Combine options: boost right channel with custom sample rate
const boostedRightChannel = await ingestAudioStream(mediaStream, {
  gain: 2.0,
  channelId: 1,
  sampleRate: 44100
});

// Read audio data
const reader = audioStream.getReader();
const { value } = await reader.read(); // Float32Array of audio samples at configured sample rate

// Clean up when done
await reader.cancel();
```

## API

### `ingestAudioStream(mediaStream: MediaStream, options?: AudioIngestOptions): Promise<ReadableStream<Float32Array>>`

Converts a MediaStream into a ReadableStream of audio data with configurable sample rate and optional volume gain.

- **mediaStream**: MediaStream containing audio tracks
- **options**: Optional configuration (see `AudioIngestOptions`)
- **Returns**: ReadableStream that yields Float32Array chunks of audio samples at the configured sample rate

### `AudioIngestOptions`

Configuration options for audio ingestion:

```typescript
interface AudioIngestOptions {
  /** Volume gain multiplier. 1.0 = no change, 2.0 = double volume, 0.5 = half volume. Default: 1.0 */
  gain?: number;
  /** Audio channel index to use (0-based). Default: 0 (first channel) */
  channelId?: number;
  /** Sample rate for the AudioContext. Default: 16000 */
  sampleRate?: number;
}
```

### `RECOMMENDED_AUDIO_CONSTRAINTS`

Optimal audio constraints for raw voice capture:

```typescript
{
  sampleRate: 16000,
  channelCount: 1
}
```

## How it Works

1. Creates an AudioContext with configurable sample rate (default: 16kHz)
2. Uses AudioWorklet for efficient audio processing with optional volume gain
3. Automatically handles sample rate conversion from input to target rate
4. Applies volume gain multiplier to audio samples when specified
5. Selects specific audio channel from multi-channel streams when channelId is specified
6. Defaults to first channel (index 0) for consistent mono output

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

### 🎛️ **Stereo Channel Selection**
```typescript
// Process specific channels from stereo microphones
const leftChannel = await ingestAudioStream(mediaStream, { channelId: 0 });
const rightChannel = await ingestAudioStream(mediaStream, { channelId: 1 });

// Useful for stereo interview recordings where each person has their own channel
const interviewer = await ingestAudioStream(mediaStream, { channelId: 0, gain: 1.2 });
const interviewee = await ingestAudioStream(mediaStream, { channelId: 1, gain: 1.5 });
```

### 🎪 **Multi-Channel Audio Interfaces**
```typescript
// Professional audio interfaces may have many channels
const channel3 = await ingestAudioStream(mediaStream, { channelId: 2 }); // Third input
const channel4 = await ingestAudioStream(mediaStream, { channelId: 3 }); // Fourth input

// Process each band member's microphone separately
const vocals = await ingestAudioStream(mediaStream, { channelId: 0, gain: 1.3 });
const guitar = await ingestAudioStream(mediaStream, { channelId: 1, gain: 0.9 });
const bass = await ingestAudioStream(mediaStream, { channelId: 2, gain: 1.1 });
const drums = await ingestAudioStream(mediaStream, { channelId: 3, gain: 0.8 });
```

### 🎵 **Sample Rate Configuration**
```typescript
// Default 16kHz for voice applications (VAD, speech recognition)
const voiceStream = await ingestAudioStream(mediaStream);

// 44.1kHz for music quality
const musicStream = await ingestAudioStream(mediaStream, { sampleRate: 44100 });

// 48kHz for professional audio
const studioStream = await ingestAudioStream(mediaStream, { sampleRate: 48000 });

// 8kHz for telephony applications
const phoneStream = await ingestAudioStream(mediaStream, { sampleRate: 8000 });

// High sample rate with specific channel and gain
const highQualityVocals = await ingestAudioStream(mediaStream, {
  sampleRate: 96000,
  channelId: 0,
  gain: 1.2
});
```

## Performance

- **Zero-copy optimization**: When `gain: 1.0` (default), no multiplication is performed
- **Efficient processing**: Gain is applied directly in the AudioWorklet thread
- **Low latency**: Processing happens in real-time without buffering delays
- **Memory efficient**: Only creates new arrays when gain is applied

## License

MIT
