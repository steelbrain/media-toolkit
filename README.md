# Audio Toolkit

Audio Toolkit is a collection of tools for audio processing.

### Packages

- `audio-ingest-mediastream`

This package takes an incoming MediaStream and converts it into a
ReadableStream for downstream consumers.

- `audio-remaster-web`

This package consumes the ReadableStream and uses Audio Worklet to
remaster the stream to a specific kHz.

- `audio-vad-web`

This package consumes audio packets and performs voice-activity detection
and emits events for when speech starts and ends.

### License

The contents of this repository are licensed under the terms of the MIT License.
