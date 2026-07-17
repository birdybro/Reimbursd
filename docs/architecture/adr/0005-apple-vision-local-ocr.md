# ADR-0005: Apple Vision local OCR

- Status: Accepted
- Date: 2026-07-15

## Context

Milestone 3 requires a real offline-capable OCR provider where the platform supports it. The
provider must preserve source geometry, remain optional, and comply with `GPL-3.0-only` plus the
project's default rule against third-party analytics or external processing.

The evaluated `expo-mlkit-ocr` wrapper is MIT-licensed, but its Android implementation links
Google ML Kit. The published Maven artifact identifies the ML Kit Terms of Service rather than an
open-source license. Those terms permit periodic server contact for updates and transmission of
performance and utilization metrics. That behavior conflicts with Reimbursd's default privacy
requirements, regardless of the wrapper license, so the dependency was removed.

## Decision

Use a repository-owned GPL-licensed Expo local module on iOS. The native module invokes Apple's
Vision framework, returns ordered text observations with native confidence and normalized page
rectangles, and contains no application network integration. Expo local-module autolinking includes
it in iOS development and release builds without adding a native OCR SDK.

Keep the module optional at the JavaScript boundary. Android, web, and Expo Go return an unavailable
result without reading attachment bytes or attempting a remote fallback. For supported iOS builds,
copy validated image bytes to a uniquely named private cache file, run Vision, and remove the cache
file after both success and failure. Treat the native response as unknown and pass mapped output
through the shared OCR limits and schema validation.

Record every attempted supported-image run in processing history. Store only processor metadata,
times, lifecycle status, and a bounded failure code. Do not store OCR text in history or logs. OCR
failure must not remove the immutable original or prevent manual entry.

## Consequences

iOS receives real on-device OCR with confidence and bounding boxes. Android and web remain usable
without OCR while a mature, clearly GPL-compatible, telemetry-free engine is evaluated. The local
Swift module cannot be compiled or exercised in the current Linux environment, so autolinking,
TypeScript mapping, output validation, fallback behavior, and orchestration are automated here;
native execution still requires an Apple build environment.

References:

- <https://docs.expo.dev/modules/get-started/>
- <https://developers.google.com/ml-kit/terms>
- <https://dl.google.com/dl/android/maven2/com/google/mlkit/text-recognition/16.0.1/text-recognition-16.0.1.pom>
