# ADR 0012: Authenticated Encrypted Backup

- Status: Accepted
- Date: 2026-07-18

## Context

Milestone 5 requires an encrypted local backup option without inventing cryptographic algorithms or
depending on an account. Backups must be portable to a clean installation, detect wrong keys and any
content or metadata modification, preserve the strict structured-archive restore boundary, and state
recovery limits honestly. A device-only key cannot restore after uninstall or device loss, while a
user password requires a deliberately selected and tuned password KDF that the current universal
Expo stack does not provide.

## Decision

Wrap a complete structured ZIP in a versioned binary envelope using AES-256-GCM from the platform
implementation exposed by Expo Crypto. Use a generated 256-bit random backup key, a fresh generated
12-byte nonce for every encryption, and a full 16-byte authentication tag. Authenticate the exact
bounded JSON header as GCM additional authenticated data. The header identifies the format,
algorithm, key ID/version, creation time, plaintext size, and fixed nonce/tag sizes. Reject malformed,
oversized, truncated, unsupported, or internally inconsistent envelopes before decryption.

Represent the key as a versioned recovery string for portable offline restoration. On Android and
iOS, store the small active key record through an abstract key-store port backed by Expo SecureStore
with unlocked-device accessibility and no biometric requirement. SecureStore is a convenience, not
the only recovery mechanism: the user must be able to retain the recovery key separately. Do not
persist a backup key in browser local storage or origin file storage as though that were equivalent
to a platform keystore; web backup must use an explicitly supplied recovery key until a suitable
secure platform facility exists.

Keep encryption behind a provider interface. Production uses Expo Crypto; tests use the operating
system's standard AES-GCM implementation and deterministic invalid providers for boundary cases.
After authenticated decryption, pass the recovered bytes through the existing strict structured ZIP
parser and clean-install restore coordinator. Never treat a decrypted payload as trusted merely
because GCM authentication succeeded.

## Consequences

- Receipt contents, filenames, and structured records are encrypted; bounded envelope metadata such
  as creation time, sizes, format, algorithm, and opaque key ID remains visible.
- Wrong keys, header changes, ciphertext changes, and tag changes fail authentication before ZIP
  parsing or local writes.
- Random nonce uniqueness depends on the platform CSPRNG and responsible key lifecycle. Backup
  creation remains a user-driven low-frequency operation; future key rotation must retain old keys
  or require their recovery strings.
- Losing both SecureStore state and the separate recovery key makes the encrypted backup
  unrecoverable. The interface and documentation must say so before backup creation.
- Android uninstall removes Keystore-protected data, while iOS Keychain persistence across uninstall
  is platform behavior and not a recovery guarantee.
- This feature protects exported backup contents at rest; it does not encrypt the live SQLite
  database or attachment store and is not end-to-end encryption.
