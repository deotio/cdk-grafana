# @deotio/cdk-grafana

AWS CDK constructs for deploying and managing [AWS Managed Grafana](https://aws.amazon.com/grafana/) workspaces.

## Features

- **GrafanaWorkspace** — L3 construct that provisions a Managed Grafana workspace with a service role, service account, and service account token
- **GrafanaInfraStack** — ready-to-deploy stack with Secrets Manager storage, SSM parameter discovery, GitHub Actions OIDC federation, and cross-account access
- **RemovalPolicyAspect** — CDK aspect to set removal policies across all resources in a construct tree
- Built-in [cdk-nag](https://github.com/cdklabs/cdk-nag) suppressions with documented justifications

## Installation

```bash
npm install @deotio/cdk-grafana
```

### Peer dependencies

```bash
npm install aws-cdk-lib constructs cdk-nag
```

## Quick start

```ts
import { App } from 'aws-cdk-lib';
import { GrafanaInfraStack } from '@deotio/cdk-grafana';

const app = new App();

new GrafanaInfraStack(app, 'GrafanaInfra', {
  workspaceName: 'my-grafana',
  environment: 'prod',
  orgId: 'o-abc123',
  secretAccessOuPaths: ['o-abc123/r-root/ou-xxxx/*'],
  ssmPrefix: '/grafana/prod',
  githubRepo: 'my-org/my-repo',
});
```

### Using the L3 construct directly

```ts
import { GrafanaWorkspace } from '@deotio/cdk-grafana';

const workspace = new GrafanaWorkspace(this, 'Grafana', {
  workspaceName: 'my-grafana',
  orgId: 'o-abc123',
});

// workspace.endpoint — the workspace URL
// workspace.workspaceId — the workspace ID
// workspace.serviceAccountTokenKey — the service account token
```

## API reference

### GrafanaWorkspaceProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceName` | `string` | Yes | Name of the Grafana workspace |
| `grafanaVersion` | `string` | No | Grafana version (default: `10.4`) |
| `orgId` | `string` | Yes | AWS Organizations ID for cross-account role assumption |

### GrafanaInfraStackProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `workspaceName` | `string` | Yes | Name of the Grafana workspace |
| `grafanaVersion` | `string` | No | Grafana version (default: `10.4`) |
| `environment` | `string` | Yes | Environment label (e.g., `prod`) |
| `orgId` | `string` | Yes | AWS Organizations ID |
| `secretAccessOuPaths` | `string[]` | Yes | OU paths granted cross-account read access to the token secret |
| `ssmPrefix` | `string` | Yes | SSM parameter prefix (e.g., `/grafana/prod`) |
| `githubRepo` | `string` | Yes | GitHub repository slug for OIDC federation (e.g., `org/repo`) |
| `existingGitHubOidcArn` | `string` | No | ARN of existing GitHub OIDC provider |
| `githubActionsRoleName` | `string` | No | Name for the GitHub Actions IAM role (default: `github-actions-grafana`) |

## Development

```bash
npm ci          # install dependencies
npm run build   # compile TypeScript
npm test        # run tests
npm run lint    # lint source and tests
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[Apache-2.0](LICENSE)
