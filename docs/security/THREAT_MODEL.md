# Threat Model

## Current assets and boundaries

Milestone 0 contains source code, build configuration, a mobile UI shell, and pure domain utilities.
It does not yet accept or persist receipt contents. The npm registry is a build-time trust boundary;
the Expo runtime is an application boundary.

## Current threats

- Malicious or compromised dependencies entering through installation.
- Accidental inclusion of secrets or personal receipt data in source, fixtures, or logs.
- Incorrect money conversion causing later data-integrity failures.
- Unsupported privacy or encryption claims creating user risk.

## Current mitigations

- Lockfile-based reproducible installation and automated high-severity advisory checks.
- Dependency license validation and reviewed direct dependencies.
- Synthetic-only fixture policy and no telemetry integration.
- Integer minor-unit domain rules with unit tests.
- Documentation that distinguishes implemented and planned controls.

## Future review triggers

Revisit this model before adding persistence, file import, OCR, networking, authentication,
attachments, cryptography, synchronization, location, or billing. Receipt images and OCR text must
always be treated as untrusted data and never as executable instructions.
