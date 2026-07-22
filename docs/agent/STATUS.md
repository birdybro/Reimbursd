# Agent Status

- Current milestone: Milestone 6 - Self-hosted backend and web foundation
- Current task: Add containerized local email capture and deterministic mock provider services.
- Last completed task: Added a separate responsive Vite/React hosted-web client with same-origin
  development authentication, owner-scoped receipt listing/search/manual entry, strict response and
  money validation, accessible interaction coverage, and desktop/mobile Firefox validation.
- Commands executed: Installed and license-reviewed the web workspace dependencies; ran focused web
  tests and the 51-test API suite against real PostgreSQL and MinIO. Repaired an Expo partial-install
  development bundle without restarting its server. Browser smoke testing exposed and fixed Vite
  development CSP styling, native `fetch` receiver binding, and a Node ESM `pdf-lib` import failure;
  added a direct API runtime import check. Started loopback API/web servers, completed real Firefox
  sign-in/create/search at 1440x900 and 390x844 with no horizontal control overflow, reviewed both
  screenshots, and ran `npm run verify` successfully.
- Test and build status: `npm run verify` passes. Two hundred thirty-five Vitest tests and fifty-one
  React Native/Jest interaction tests pass. The direct Node API import probe, formatting, linting,
  strict type checking, license validation, the high-severity audit threshold, Expo Doctor 20/20,
  all workspace builds, and both Expo and Vite production web builds pass. Real Firefox exercised
  hosted development sign-in, owner listing, manual creation, search, and responsive layouts.
- Current assumptions: The API, web, and worker bind/connect only through operator configuration;
  local mobile functionality remains independent. The hosted web slice is development-only, uses a
  same-origin Vite proxy, and keeps the synthetic token only in memory. The worker requires
  PostgreSQL and still handles only a versioned synthetic readiness job. Process-memory API storage,
  synthetic identity, and local MinIO root credentials remain non-production infrastructure.
- Known defects: Android/web OCR, PDF page previews, and category/tag rename/delete UI are not
  implemented. Restored derivative previews are not regenerated immediately. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion supports JPEG and PNG, not HEIC
  or WebP. Native Android/iOS launch, native sharing/restore/key storage, and Apple Vision execution
  were not exercised in this Linux environment. The hosted system has no receipt-processing worker
  jobs, hosted attachment deletion or orphan reconciliation, hosted backup, production
  authentication, revocable sessions, deployment reverse proxy/TLS guidance, paginated lists, or
  hosted receipt edit/delete UI. Expo SDK 57 carries eleven moderate build-tool advisories; there are
  no high or critical advisories, and npm's suggested fix is incompatible with the current Expo
  stack.
- Current blockers: None.
- Next task: Define provider health/data boundaries, then add local email capture plus deterministic
  mock AI, geocoding, and billing services to Compose without creating receipt-processing claims.
