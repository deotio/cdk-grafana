import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';

import { GrafanaWorkspace } from '../lib/constructs/grafana-workspace';

describe('GrafanaWorkspace', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'eu-central-1' },
    });
    new GrafanaWorkspace(stack, 'Workspace', {
      workspaceName: 'test-workspace',
      grafanaVersion: '10.4',
      orgId: 'o-testorg123',
    });
    template = Template.fromStack(stack);
  });

  test('creates a Grafana workspace with SSO auth and correct version', () => {
    template.hasResourceProperties('AWS::Grafana::Workspace', {
      Name: 'test-workspace',
      AuthenticationProviders: ['AWS_SSO'],
      GrafanaVersion: '10.4',
      AccountAccessType: 'CURRENT_ACCOUNT',
      PermissionType: 'SERVICE_MANAGED',
      PluginAdminEnabled: true,
    });
  });

  test('service role is only assumable by grafana.amazonaws.com', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'grafana.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }),
        ]),
      },
    });
  });

  test('service role has CloudWatch, Logs, and Tags read policies', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Sid: 'CloudWatchRead' }),
          Match.objectLike({ Sid: 'LogsRead' }),
          Match.objectLike({ Sid: 'TagsRead' }),
        ]),
      },
    });
  });

  test('cross-account assume role policy uses provided orgId', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'AssumeProjectCloudWatchRoles',
            Action: 'sts:AssumeRole',
            Condition: {
              StringEquals: {
                'aws:PrincipalOrgID': 'o-testorg123',
              },
            },
          }),
        ]),
      },
    });
  });

  test('creates custom resources for service account and token', () => {
    // Two Custom::AWS resources: one for service account, one for token
    template.resourceCountIs('Custom::AWS', 2);
  });

  test('defaults grafana version to 10.4 when not specified', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'DefaultVersionStack', {
      env: { account: '123456789012', region: 'eu-central-1' },
    });
    new GrafanaWorkspace(stack, 'Workspace', {
      workspaceName: 'test-workspace',
      orgId: 'o-testorg123',
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::Grafana::Workspace', {
      GrafanaVersion: '10.4',
    });
  });
});
