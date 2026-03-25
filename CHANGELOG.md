# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-03-25

### Added

- README, CONTRIBUTING, SECURITY, and CHANGELOG documentation
- Releasing guide with first-time publish instructions

### Changed

- Pinned GitHub Actions to commit SHAs for supply-chain security
- Added least-privilege permissions to CI workflow
- Gated Dependabot auto-merge to minor/patch only

## [0.1.0] - 2026-03-25

### Added

- `GrafanaWorkspace` L3 construct with service role, service account, and token management
- `GrafanaInfraStack` with Secrets Manager, SSM parameters, GitHub Actions OIDC, and cross-account access
- `RemovalPolicyAspect` for applying removal policies across construct trees
- cdk-nag suppressions with documented justifications
- CI workflow with lint, build, test, and npm audit
- Release workflow with OIDC trusted publishing and provenance
- Dependabot with auto-merge for minor/patch updates
