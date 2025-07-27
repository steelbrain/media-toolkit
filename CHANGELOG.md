# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **@steelbrain/media-ingest-audio**: Add `channelId` option to select specific audio channel from multi-channel streams
  - Enables processing of individual channels from stereo/multi-channel audio sources
  - Useful for stereo interview recordings, multi-channel audio interfaces, and professional audio setups
  - Defaults to channel 0 (first channel) for backward compatibility

- **@steelbrain/media-ingest-audio**: Add `sampleRate` option to configure AudioContext sample rate
  - Allows custom sample rates from 8kHz to 96kHz+ for different use cases
  - Supports telephony (8kHz), voice (16kHz default), music (44.1kHz), and professional audio (48kHz+)
  - Automatically handles sample rate conversion from input to target rate
  - Useful for optimizing quality vs. bandwidth based on application needs

### Fixed

- **@steelbrain/media-ingest-audio**: Fix audio worker continuing to send messages after stream closure
  - Added try/catch around controller.enqueue to handle closed stream errors
  - Properly cleanup resources when stream is cancelled while audio worker is still processing

## [1.0.0] - 2025-01-23

### Added

- **@steelbrain/media-ingest-audio**: Convert MediaStream to 16kHz ReadableStream with configurable volume gain
  - AudioWorklet-based processing for efficient real-time audio streaming
  - Configurable gain parameter for volume normalization
  - Zero-copy optimization when gain is 1.0 (default)
  - Full support for modern bundlers (Webpack 5, Next.js, Vite)

- **@steelbrain/media-speech-detection-web**: Production-ready voice activity detection using Silero VAD
  - Official Silero VAD ONNX model implementation
  - Zero-configuration defaults optimized for real-world usage
  - Smooth speech transitions with lookback buffer
  - Three-tier threshold system for robust detection
  - Event-driven callbacks for speech start/end
  - Support for .tee() patterns with noEmit option

- **@steelbrain/media-buffer-speech**: Speech buffering with natural pause detection
  - Accumulates audio chunks and releases after configurable pause duration
  - Perfect for turn detection in conversations
  - Buffer overflow protection with configurable limits
  - Support for .tee() patterns with noEmit and onBuffered options

- **Example Next.js Application**: Complete demonstration of all three packages
  - Real-time speech detection visualization
  - Audio recording and playback for VAD verification
  - Sample rate debugging and compatibility checks
  - Proper resource cleanup patterns

### Technical Details

- Monorepo structure with yarn workspaces
- TypeScript with strict mode enabled
- Build system using zshy for automatic package.json management
- Minimum Node.js version: 22.0.0
- Comprehensive test suites using Vitest
- Production-ready error handling and resource management
