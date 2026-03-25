# Releasing

## Prerequisites

- The npm org `@deotio` must have a [trusted publisher](https://docs.npmjs.com/generating-provenance-statements#publishing-packages-with-provenance-via-a-trusted-publisher) configured for the `deotio/cdk-grafana` GitHub repository.
- No npm token is needed — the release workflow uses OIDC trusted publishing.

## First-time publish

The first publish must be done manually from the CLI to establish the package on npm:

```bash
npm login
npm publish --access public
```

The `prepublishOnly` script will automatically run `build` and `test` before publishing.

After the package exists on npm, configure the trusted publisher in the [npm package settings](https://www.npmjs.com/package/@deotio/cdk-grafana/access) for the `deotio/cdk-grafana` GitHub repository. All subsequent releases will use the automated workflow below.

## Publishing a release

1. Update the version in `package.json` and `CHANGELOG.md`.
2. Commit the version bump:
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "Release v0.2.0"
   ```
3. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin main v0.2.0
   ```

The [release workflow](../../.github/workflows/release.yml) runs automatically on `v*` tags and will:

1. Install dependencies (`npm ci`)
2. Run `npm audit --audit-level=high`
3. Lint, build, and test
4. Publish to npm with `--provenance --access public`

## Verifying

After the workflow completes, confirm the package is live:

```bash
npm view @deotio/cdk-grafana
```
