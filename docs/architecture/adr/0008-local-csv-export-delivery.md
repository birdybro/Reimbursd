# ADR 0008: Local CSV Export Delivery

- Status: Accepted
- Date: 2026-07-17

## Context

Milestone 4 requires expense CSV export without an account or hosted service. Exported merchant and
note text is untrusted, money must remain exact, and native delivery needs a user-controlled
destination without leaving an unmanaged application copy.

## Decision

Serialize CSV in the framework-independent domain package from validated receipt records. Export
only active records, derive decimal strings from integer minor units, quote CSV metacharacters, and
prefix formula-like user text with an apostrophe.

On web, create a Blob and trigger a browser download. On native platforms, write a validated filename
to private cache, invoke the operating-system share sheet through Expo Sharing, and delete the cache
file in a `finally` path. Do not transmit the file to a Reimbursd service and do not describe CSV as
encrypted.

## Consequences

- The same deterministic serializer is testable outside React Native.
- Users explicitly choose the final export destination.
- Native share targets and browser download locations are outside Reimbursd's retention control.
- Complete structured export, attachment inclusion, checksums, and restore remain separate work.
