# ADR-0006: Deterministic receipt parser

- Status: Accepted
- Date: 2026-07-17

## Context

Validated OCR output is still untrusted receipt content. Milestone 3 needs useful field suggestions
without generative AI, while keeping parsing distinct from OCR, saved receipt values, and user
review. Dates and currencies require explicit locale context, and a failed parser run must not turn
a successful OCR attempt into a failure or leave a partial candidate set.

## Decision

Put the framework-independent parser port and deterministic implementation in
`packages/extraction`. Pass validated OCR output plus an explicit default currency, date order, and
timezone offset. Treat the parser's return as `unknown` and validate field uniqueness, bounded text,
confidence, page references, and normalized source rectangles before typed use.

Use deterministic rules for merchant, purchase date, currency, subtotal, tax, tip, and total. Parse
money through the domain's integer minor-unit functions, support common decimal/thousands formats,
and exclude instruction-like text and URLs from merchant candidates. Receipt text is data only; the
parser does not execute commands, follow URLs, or interpret instructions.

Record OCR and parser lifecycle outcomes separately. After OCR succeeds, persist the complete
candidate set atomically as unaccepted `field_evidence`. Parser validation or persistence failure
records a bounded parser failure code but does not alter the successful OCR result or the preserved
original. Display suggestions separately from saved values with confidence and execution
provenance. Map normalized page rectangles onto local image previews only when dimensions are
available.

## Consequences

Basic extraction remains offline, deterministic, testable, and independent of an AI provider.
Candidate evidence survives restart without silently replacing confirmed values. Locale context is
explicit but current rules will not cover every receipt layout or language. Accepting and correcting
suggestions remains a separate workflow, and later automated runs must continue to rank stored user
corrections above unreviewed output.
