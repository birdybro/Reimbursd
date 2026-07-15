# Contributing to Reimbursd

Reimbursd accepts contributions under `GPL-3.0-only`. By submitting a contribution, you
agree that it may be distributed under that license.

## Development workflow

1. Use Node.js 22 or newer and npm 10 or newer.
2. Run `npm install` from the repository root.
3. Run `npm run dev:mobile` to start the Expo application.
4. Add focused tests for behavior changes.
5. Run `npm run verify` before opening a pull request.

Use synthetic receipt data only. Do not commit credentials, real receipts, merchant details,
addresses, OCR text, filenames, or other personal information.

Keep changes scoped and use Conventional Commit messages, such as
`feat(receipts): add local manual expense storage`.
