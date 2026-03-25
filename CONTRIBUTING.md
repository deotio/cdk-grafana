# Contributing

Contributions are welcome! This document explains how to get started.

## Development setup

```bash
git clone https://github.com/deotio/cdk-grafana.git
cd cdk-grafana
npm ci
```

## Build, test, and lint

```bash
npm run build   # compile TypeScript
npm test        # run Jest tests (90% coverage required)
npm run lint    # run ESLint
```

All three must pass before a PR can be merged.

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Make your changes and add or update tests as needed.
3. Ensure `npm run build`, `npm test`, and `npm run lint` all pass.
4. Open a pull request against `main`.

## Project structure

```
lib/
  constructs/    # Reusable CDK L3 constructs
  aspects/       # CDK aspects
  index.ts       # Public API barrel export
test/            # Jest tests
```

## Code style

- TypeScript strict mode is enabled.
- Formatting follows Prettier (single quotes, trailing commas, 100 char width).
- Linting is enforced by ESLint with `@typescript-eslint`.

## Releasing

Releases are triggered by pushing a version tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The release workflow publishes to npm automatically.
