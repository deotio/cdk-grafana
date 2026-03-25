import * as cdk from 'aws-cdk-lib';
import { Aspects, CfnOutput, RemovalPolicy, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

import { RemovalPolicyAspect } from './aspects/removal-policy-aspect';
import { GrafanaWorkspace } from './constructs/grafana-workspace';

export interface GrafanaInfraStackProps extends cdk.StackProps {
  /** Name of the Grafana workspace. */
  readonly workspaceName: string;
  /** Grafana version (default: '10.4'). */
  readonly grafanaVersion?: string;
  /** Environment label (e.g., 'prod'). Used in secret path, tags, etc. */
  readonly environment: string;
  /** AWS Organizations ID for cross-account role assumption. */
  readonly orgId: string;
  /** OU paths granted cross-account read access to the service account token secret. */
  readonly secretAccessOuPaths: string[];
  /** SSM parameter prefix (e.g., '/grafana/prod'). */
  readonly ssmPrefix: string;
  /** GitHub repository slug (e.g., 'deotio/dot-grafana') for OIDC federation. */
  readonly githubRepo: string;
  /** Optional: ARN of existing GitHub OIDC provider. If omitted, a new one is created. */
  readonly existingGitHubOidcArn?: string;
  /** Optional: name for the GitHub Actions IAM role (default: 'github-actions-grafana'). */
  readonly githubActionsRoleName?: string;
}

export class GrafanaInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GrafanaInfraStackProps) {
    super(scope, id, props);

    // -------------------------------------------------------
    // Grafana Workspace (L3 construct)
    // -------------------------------------------------------
    const grafanaWorkspace = new GrafanaWorkspace(this, 'GrafanaWorkspace', {
      workspaceName: props.workspaceName,
      grafanaVersion: props.grafanaVersion,
      orgId: props.orgId,
    });

    // -------------------------------------------------------
    // Secrets Manager — store service account token
    // -------------------------------------------------------
    const secret = new secretsmanager.Secret(this, 'ServiceAccountTokenSecret', {
      secretName: `grafana/${props.environment}/service-account-token`,
      description: 'Grafana workspace service account token',
      removalPolicy: RemovalPolicy.DESTROY,
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          token: grafanaWorkspace.serviceAccountTokenKey,
          site_url: `https://${grafanaWorkspace.endpoint}`,
          workspace_id: grafanaWorkspace.workspaceId,
        }),
      ),
    });

    // Cross-account read access — grant to all accounts in the configured OUs
    secret.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        principals: [new iam.StarPrincipal()],
        resources: ['*'], // Self-referencing in resource policy — scoped to this secret
        conditions: {
          'ForAnyValue:StringLike': {
            'aws:PrincipalOrgPaths': props.secretAccessOuPaths,
          },
        },
      }),
    );

    NagSuppressions.addResourceSuppressions(secret, [
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'This secret stores a Grafana service account token with a fixed TTL managed by the Grafana API — automatic rotation is not applicable',
      },
    ]);

    // cdk-nag: stack-level suppressions for CDK-managed resources
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'AWSLambdaBasicExecutionRole managed policy is used by CDK-managed custom resource Lambda — cannot be changed',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
      {
        id: 'AwsSolutions-L1',
        reason:
          'Singleton Lambda runtime for AwsCustomResource is managed by CDK framework — cannot be changed',
      },
    ]);

    // -------------------------------------------------------
    // GitHub Actions OIDC provider (conditional)
    // -------------------------------------------------------
    const oidcProvider = props.existingGitHubOidcArn
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidc',
          props.existingGitHubOidcArn,
        )
      : new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
          thumbprints: [
            '6938fd4d98bab03faadb97b34396831e3780aea1',
            '1c58a3a8518e8759bf075b76b750d4f2df264fcd',
          ],
        });

    // -------------------------------------------------------
    // GitHub Actions IAM role
    // -------------------------------------------------------
    const githubActionsRole = new iam.Role(this, 'GitHubActionsRole', {
      roleName: props.githubActionsRoleName ?? 'github-actions-grafana',
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:*`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Role assumed by GitHub Actions for CDK deployments',
    });

    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    NagSuppressions.addResourceSuppressions(
      githubActionsRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'GitHub Actions role needs to assume any CDK bootstrap role (cdk-*) for deployments — these are created by CDK bootstrap and follow a naming convention',
        },
      ],
      true,
    );

    // -------------------------------------------------------
    // Stack-level tags
    // -------------------------------------------------------
    Tags.of(this).add('Environment', props.environment);
    Tags.of(this).add('ManagedBy', 'CDK');
    Tags.of(this).add('Project', 'Grafana');

    // -------------------------------------------------------
    // Removal policy aspect
    // -------------------------------------------------------
    Aspects.of(this).add(new RemovalPolicyAspect(RemovalPolicy.DESTROY));

    // -------------------------------------------------------
    // SSM Parameters — discoverable outputs for other stacks
    // -------------------------------------------------------
    new ssm.StringParameter(this, 'SsmEndpoint', {
      parameterName: `${props.ssmPrefix}/endpoint`,
      stringValue: grafanaWorkspace.endpoint,
      description: 'Grafana workspace endpoint URL',
    });

    new ssm.StringParameter(this, 'SsmWorkspaceId', {
      parameterName: `${props.ssmPrefix}/workspace-id`,
      stringValue: grafanaWorkspace.workspaceId,
      description: 'Grafana workspace ID',
    });

    new ssm.StringParameter(this, 'SsmSecretArn', {
      parameterName: `${props.ssmPrefix}/secret-arn`,
      stringValue: secret.secretArn,
      description: 'ARN of the Secrets Manager secret containing the service account token',
    });

    new ssm.StringParameter(this, 'SsmServiceRoleArn', {
      parameterName: `${props.ssmPrefix}/service-role-arn`,
      stringValue: grafanaWorkspace.serviceRole.roleArn,
      description: 'ARN of the Grafana service role (for cross-account trust policies)',
    });

    // -------------------------------------------------------
    // Stack outputs (console convenience)
    // -------------------------------------------------------
    new CfnOutput(this, 'GrafanaEndpoint', {
      value: grafanaWorkspace.endpoint,
      description: 'Grafana workspace URL',
    });

    new CfnOutput(this, 'WorkspaceId', {
      value: grafanaWorkspace.workspaceId,
    });

    new CfnOutput(this, 'ServiceAccountTokenSecretArn', {
      value: secret.secretArn,
    });

    new CfnOutput(this, 'GitHubActionsRoleArn', {
      value: githubActionsRole.roleArn,
      description: 'Add as AWS_ROLE_ARN secret in GitHub repository',
    });
  }
}
