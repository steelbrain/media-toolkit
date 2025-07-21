# @steelbrain/media-buffer-speech

Speech buffering that accumulates audio chunks and releases them after natural pause periods - perfect for detecting conversation turns and complete utterances.

## Installation

```bash
npm install @steelbrain/media-buffer-speech
```

**Modern Bundler Support**: This package is fully compatible with modern bundlers (Webpack 5, Next.js, Vite, etc.) - no manual setup required.

## Quick Start

```typescript
import { bufferSpeech } from '@steelbrain/media-buffer-speech';
import { speechFilter } from '@steelbrain/media-speech-detection-web';

// Create speech buffer that waits 2 seconds after last speech
const speechBuffer = bufferSpeech({
  durationSeconds: 2.0,
  maxBufferSeconds: 60.0,
  onError: (error) => console.error('Buffer overflow:', error),
  onDebugLog: (message) => console.log('Debug:', message)
});

// Complete pipeline: speech detection → speech buffering → processing
await audioStream
  .pipeThrough(speechFilter())     // Filter for speech only
  .pipeThrough(speechBuffer)       // Buffer speech until pauses
  .pipeTo(new WritableStream({
    write(speechSegments) {
      // Receives arrays of chunks after each pause
      console.log(`Processing ${speechSegments.length} speech chunks`);
      processCompleteSegment(speechSegments);
    }
  }));
```

## API Reference

### `bufferSpeech<T>(options): TransformStream<T, T[]>`

Creates a TransformStream that buffers incoming chunks and releases them as arrays after pause periods.

**Parameters:**
- `options`: `BufferSpeechOptions` - Configuration object

**Returns:** `TransformStream<T, T[]>` - Buffers individual chunks, outputs arrays after pauses

### `createSpeechBuffer(options): TransformStream<Float32Array, Float32Array[]>`

Convenience function for audio processing - same as `bufferSpeech<Float32Array>()`.

### Configuration Options

```typescript
interface BufferSpeechOptions {
  durationSeconds?: number;    // Pause duration to wait. Default: 2.0
  maxBufferSeconds?: number;   // Max buffer time before error. Default: 60.0
  onError?: (error: Error) => void;          // Buffer overflow/error handler
  onDebugLog?: (message: string) => void;    // Internal state logging
  noEmit?: boolean;            // Don't emit chunks, only trigger callback. Default: false
  onBuffered?: () => void;     // Called when buffer is ready after pause detected
}
```

## Use Cases

### 🗣️ **Natural Speech Processing**
Buffer complete thoughts or sentences:

```typescript
const sentenceBuffer = bufferSpeech({
  durationSeconds: 1.5,  // Typical sentence pause
  maxBufferSeconds: 15   // Reasonable sentence length
});

speechStream
  .pipeThrough(sentenceBuffer)
  .pipeTo(sentenceTranscriber);
```

### 📞 **Conversation Turn Detection**
Detect when speakers finish their turns in conversations:

```typescript
const turnBuffer = bufferSpeech({
  durationSeconds: 3.0,  // Longer pause indicates turn completion
  maxBufferSeconds: 60,  // Allow for longer responses
  onError: (err) => handleLongMonologue(err)
});

conversationStream
  .pipeThrough(speechFilter())
  .pipeThrough(turnBuffer)
  .pipeTo(conversationAnalyzer);
```

### 🎙️ **Recording Segmentation**
Create natural break points in continuous recordings:

```typescript
const segmentBuffer = bufferSpeech({
  durationSeconds: 2.5,
  maxBufferSeconds: 120,  // Allow for longer segments
  onDebugLog: (msg) => recordingUI.updateStatus(msg)
});

recordingStream
  .pipeThrough(segmentBuffer)
  .pipeTo(fileSegmentWriter);
```

### 🤖 **Voice Command Processing**
Buffer complete voice commands before processing:

```typescript
const commandBuffer = bufferSpeech({
  durationSeconds: 1.0,   // Quick response for commands
  maxBufferSeconds: 10,   // Commands should be short
  onError: () => voiceUI.showError('Command too long')
});

microphoneStream
  .pipeThrough(speechFilter())
  .pipeThrough(commandBuffer)
  .pipeTo(commandProcessor);
```

### 🎙️ **Live Transcription with Turn Detection**
Use `.tee()` to split streams for real-time transcription and conversation turn detection:

```typescript
const [liveStream, turnStream] = audioStream.tee();

// Branch 1: Live transcription for immediate feedback
liveStream
  .pipeThrough(speechFilter())
  .pipeTo(new WritableStream({
    write(audioChunk) {
      // Send individual chunks for live transcription
      sendToLiveTranscription(audioChunk);
    }
  }));

// Branch 2: Turn detection signaling
const turnDetector = bufferSpeech({
  durationSeconds: 3.0,
  noEmit: true,                    // Don't emit chunks downstream
  onBuffered: () => {              // Signal when complete turn is ready
    console.log('Turn complete - process accumulated transcript');
    finalizeTranscriptionSegment();
    notifyConversationTurnComplete();
  }
});

turnStream
  .pipeThrough(speechFilter())
  .pipeThrough(turnDetector)
  .pipeTo(new WritableStream({ write() {} })); // Dummy sink since noEmit=true
```

## How It Works

### Buffering Strategy
1. **Accumulation**: Incoming chunks are buffered in memory
2. **Timer Reset**: Each new chunk resets the pause timer
3. **Release**: After `durationSeconds` of silence, buffer is released as an array
4. **Overflow Protection**: Warns if buffer exceeds `maxBufferSeconds`

### Memory Management
- **Lightweight**: Only stores references to chunks, no copying
- **Automatic Cleanup**: Buffer is cleared after each release
- **Overflow Detection**: Prevents runaway memory usage

### Error Handling
- **Buffer Overflow**: Detects continuous input without pauses
- **Graceful Degradation**: Continues processing even after errors
- **Debug Logging**: Comprehensive internal state visibility

## Performance Characteristics

| Metric | Value | Description |
|--------|-------|-------------|
| **Latency** | `durationSeconds` | Minimum delay before output |
| **Memory Usage** | ~1KB per chunk | Lightweight buffering |
| **CPU Overhead** | <0.1ms per chunk | Simple timer management |
| **Throughput** | Unlimited | No processing bottlenecks |

## Advanced Usage

### Custom Speech Buffering Logic

```typescript
// Different pause durations for different content types
const adaptiveBuffer = bufferSpeech({
  durationSeconds: 2.0,
  onDebugLog: (message) => {
    if (message.includes('chunks')) {
      const chunkCount = extractChunkCount(message);
      // Adjust future processing based on chunk patterns
      adaptProcessingStrategy(chunkCount);
    }
  }
});
```

### Error Recovery Strategies

```typescript
const robustBuffer = bufferSpeech({
  durationSeconds: 3.0,
  maxBufferSeconds: 60,
  onError: (error) => {
    if (error.message.includes('overflow')) {
      // Handle long continuous speech
      notifyUserOfLongSpeech();
      // Buffer is automatically released after error
    }
  }
});
```

### Pipeline Composition

```typescript
// Complex processing pipeline
await audioStream
  .pipeThrough(speechFilter({
    threshold: 0.4,
    minSpeechDurationMs: 200
  }))
  .pipeThrough(bufferSpeech({
    durationSeconds: 2.0,
    maxBufferSeconds: 60
  }))
  .pipeThrough(new TransformStream({
    transform(segments, controller) {
      // Process each segment array
      for (const segment of segments) {
        const processed = processSegment(segment);
        controller.enqueue(processed);
      }
    }
  }))
  .pipeTo(finalProcessor);
```

## Integration Examples

### With Speech Detection

```typescript
import { speechFilter } from '@steelbrain/media-speech-detection-web';
import { bufferSpeech } from '@steelbrain/media-buffer-speech';

// Complete voice processing pipeline
const voicePipeline = audioStream
  .pipeThrough(speechFilter({
    onSpeechStart: () => ui.showRecording(),
    onSpeechEnd: () => ui.showProcessing()
  }))
  .pipeThrough(bufferSpeech({
    durationSeconds: 2.0,
    onError: (err) => ui.showError(err.message)
  }))
  .pipeTo(transcriptionService);
```

### With Audio Ingestion

```typescript
import { ingestAudioStream } from '@steelbrain/media-ingest-audio';
import { bufferSpeech } from '@steelbrain/media-buffer-speech';

// End-to-end audio processing
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioStream = await ingestAudioStream(mediaStream);

await audioStream
  .pipeThrough(bufferSpeech({ durationSeconds: 1.5 }))
  .pipeTo(audioSegmentProcessor);
```

## Browser Support

Requires browsers with Web Streams API support:
- ✅ Chrome 67+
- ✅ Firefox 102+
- ✅ Safari 14.5+
- ✅ Edge 79+

## License

MIT License - See LICENSE file for details.