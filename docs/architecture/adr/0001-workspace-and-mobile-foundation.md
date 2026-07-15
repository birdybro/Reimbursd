# ADR-0001: Workspace and mobile foundation

- Status: Accepted
- Date: 2026-07-14

## Context

The repository contained product instructions and a one-line README, but no established application
stack. The product requires a local-first mobile application and future web and service components.

## Decision

Use npm workspaces with strict TypeScript. Place the Expo and React Native application in
`apps/mobile` and framework-independent business rules in `packages/domain`. Use npm because it is
bundled with the required Node.js runtime and reduces bootstrap tooling. Use Expo SDK 57 because it
is the current documented Expo project version at the time of this decision.

External services will be introduced behind provider interfaces only when their milestone requires
them. Local mobile capability cannot depend on those providers.

## Consequences

Expo provides Android, iOS, and web development from one TypeScript application. Workspace packages
can be added without prematurely creating services. The repository must prevent duplicate React
Native versions and keep domain dependencies framework-free.
