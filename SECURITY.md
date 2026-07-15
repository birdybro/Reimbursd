# Security Policy

## Supported versions

Reimbursd is pre-release software. Security updates currently target the latest commit on `main`.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, receipt contents, or personal
data. Contact the repository owner through GitHub's private vulnerability reporting feature when
it is enabled. If private reporting is unavailable, open a minimal public issue requesting a
private contact channel without including sensitive details.

## Current scope

Milestone 2 contains a local-only Expo client, SQLite repositories, validated receipt ingestion,
and private platform attachment storage. Authentication, remote APIs, encryption, secure deletion,
and synchronization are not implemented and must not be treated as security controls. See
[the security model](docs/security/SECURITY_MODEL.md) for an explicit implemented/planned inventory.
