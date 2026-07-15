# Privacy

Reimbursd is designed to keep its core mobile experience local and usable without an account.

## Current implementation

The Milestone 0 application does not collect receipt data, request location, use analytics,
display advertising, or transmit data to a Reimbursd service. It has no account system and no
external AI integration. The repository does not yet implement receipt persistence, exports,
backups, synchronization, or hosted processing.

## Product commitments

Future local receipt features will work without a hosted account. External AI, synchronization,
and location enrichment will be optional, explicit, and documented with the data transmitted and
retention behavior. Receipt contents and identifying expense details must not appear in telemetry
or logs.

Privacy issues can be reported using the private process in [SECURITY.md](SECURITY.md).
