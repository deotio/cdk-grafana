import { Stack } from 'aws-cdk-lib';
import * as grafana from 'aws-cdk-lib/aws-grafana';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface GrafanaWorkspaceProps {
  readonly workspaceName: string;
  readonly grafanaVersion?: string;
  /** AWS Organizations ID for cross-account CloudWatch role assumption. */
  readonly orgId: string;
}

/**
 * L3 construct encapsulating a Grafana workspace, its service role,
 * a service account, and a service account token (via AwsCustomResource).
 */
export class GrafanaWorkspace extends Construct {
  public readonly workspace: grafana.CfnWorkspace;
  public readonly serviceRole: iam.Role;
  public readonly workspaceId: string;
  public readonly endpoint: string;
  public readonly serviceAccountTokenKey: string;

  constructor(scope: Construct, id: string, props: GrafanaWorkspaceProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const version = props.grafanaVersion ?? '10.4';

    // Service role for the Grafana workspace
    this.serviceRole = new iam.Role(this, 'ServiceRole', {
      assumedBy: new iam.ServicePrincipal('grafana.amazonaws.com'),
      description: 'Service role for AWS Managed Grafana workspace',
    });

    // CloudWatch, Logs, and Tags read-only inline policy
    const servicePolicy = new iam.Policy(this, 'ServicePolicy', {
      statements: [
        new iam.PolicyStatement({
          sid: 'CloudWatchRead',
          actions: [
            'cloudwatch:DescribeAlarmsForMetric',
            'cloudwatch:DescribeAlarmHistory',
            'cloudwatch:DescribeAlarms',
            'cloudwatch:ListMetrics',
            'cloudwatch:GetMetricData',
            'cloudwatch:GetMetricStatistics',
            'cloudwatch:GetInsightRuleReport',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'LogsRead',
          actions: [
            'logs:DescribeLogGroups',
            'logs:GetLogGroupFields',
            'logs:StartQuery',
            'logs:StopQuery',
            'logs:GetQueryResults',
            'logs:GetLogEvents',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'TagsRead',
          actions: ['tag:GetResources'],
          resources: ['*'],
        }),
      ],
    });
    // Allow assuming CloudWatch roles in other org accounts (cross-account datasources)
    const assumeRolePolicy = new iam.Policy(this, 'AssumeCloudWatchRoles', {
      statements: [
        new iam.PolicyStatement({
          sid: 'AssumeProjectCloudWatchRoles',
          actions: ['sts:AssumeRole'],
          resources: ['arn:aws:iam::*:role/*GrafanaCW*'],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': props.orgId,
            },
          },
        }),
      ],
    });
    this.serviceRole.attachInlinePolicy(servicePolicy);
    this.serviceRole.attachInlinePolicy(assumeRolePolicy);

    NagSuppressions.addResourceSuppressions(servicePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'CloudWatch, CloudWatch Logs, and Resource Groups Tagging read APIs do not support resource-level permissions — Resource: "*" is required',
      },
    ]);

    NagSuppressions.addResourceSuppressions(assumeRolePolicy, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Grafana needs to assume CloudWatch roles in any org account — scoped by naming convention (*GrafanaCW*) and org condition',
      },
    ]);

    // Grafana workspace (L1 — no L2 exists)
    this.workspace = new grafana.CfnWorkspace(this, 'Workspace', {
      name: props.workspaceName,
      accountAccessType: 'CURRENT_ACCOUNT',
      authenticationProviders: ['AWS_SSO'],
      permissionType: 'SERVICE_MANAGED',
      grafanaVersion: version,
      roleArn: this.serviceRole.roleArn,
      pluginAdminEnabled: true,
      notificationDestinations: ['SNS'],
    });

    // Unified alerting is enabled by default in Grafana v10.4+.
    // pluginAdminEnabled is set as a direct prop above.

    this.workspaceId = this.workspace.attrId;
    this.endpoint = this.workspace.attrEndpoint;

    // Service account via AwsCustomResource (no L1 construct available in this CDK version)
    const serviceAccount = new cr.AwsCustomResource(this, 'ServiceAccount', {
      onCreate: {
        service: 'Grafana',
        action: 'createWorkspaceServiceAccount',
        parameters: {
          workspaceId: this.workspace.attrId,
          grafanaRole: 'ADMIN',
          name: 'cdk-service-account',
        },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('id'),
      },
      onDelete: {
        service: 'Grafana',
        action: 'deleteWorkspaceServiceAccount',
        parameters: {
          workspaceId: this.workspace.attrId,
          serviceAccountId: new cr.PhysicalResourceIdReference(),
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'grafana:CreateWorkspaceServiceAccount',
            'grafana:DeleteWorkspaceServiceAccount',
          ],
          resources: [
            `arn:aws:grafana:${stack.region}:${stack.account}:/workspaces/${this.workspace.attrId}`,
            `arn:aws:grafana:${stack.region}:${stack.account}:/workspaces/${this.workspace.attrId}/*`,
          ],
        }),
      ]),
      installLatestAwsSdk: false,
    });

    const serviceAccountId = serviceAccount.getResponseField('id');

    NagSuppressions.addResourceSuppressions(
      serviceAccount,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'Custom resource Lambda runtime is managed by the CDK AwsCustomResource construct',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Custom resource IAM policy is scoped to the specific Grafana workspace ARN with wildcard for service account sub-resources',
        },
      ],
      true,
    );

    // Service account token via AwsCustomResource (no CloudFormation support)
    const tokenResource = new cr.AwsCustomResource(this, 'ServiceAccountToken', {
      onCreate: {
        service: 'Grafana',
        action: 'createWorkspaceServiceAccountToken',
        parameters: {
          workspaceId: this.workspace.attrId,
          serviceAccountId,
          name: 'cdk-token',
          secondsToLive: 2592000,
        },
        physicalResourceId: cr.PhysicalResourceId.fromResponse('serviceAccountToken.id'),
      },
      onDelete: {
        service: 'Grafana',
        action: 'deleteWorkspaceServiceAccountToken',
        parameters: {
          workspaceId: this.workspace.attrId,
          serviceAccountId,
          tokenId: new cr.PhysicalResourceIdReference(),
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'grafana:CreateWorkspaceServiceAccountToken',
            'grafana:DeleteWorkspaceServiceAccountToken',
          ],
          resources: [
            `arn:aws:grafana:${stack.region}:${stack.account}:/workspaces/${this.workspace.attrId}`,
            `arn:aws:grafana:${stack.region}:${stack.account}:/workspaces/${this.workspace.attrId}/*`,
          ],
        }),
      ]),
      installLatestAwsSdk: false,
    });

    this.serviceAccountTokenKey = tokenResource.getResponseField('serviceAccountToken.key');

    // cdk-nag suppressions for the custom resource Lambda
    NagSuppressions.addResourceSuppressions(
      tokenResource,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'Custom resource Lambda runtime is managed by the CDK AwsCustomResource construct',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Custom resource IAM policy is scoped to the specific Grafana workspace ARN with wildcard for service account sub-resources',
        },
      ],
      true,
    );
  }
}
