import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { Template, Match, Annotations } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';

import { GrafanaInfraStack, GrafanaInfraStackProps } from '../lib/grafana-infra-stack';

const testProps: GrafanaInfraStackProps = {
  env: { account: '123456789012', region: 'eu-central-1' },
  workspaceName: 'test-grafana-workspace',
  grafanaVersion: '10.4',
  environment: 'prod',
  orgId: 'o-testorg123',
  secretAccessOuPaths: [
    'o-testorg123/r-abcd/ou-abcd-prod1234/*',
    'o-testorg123/r-abcd/ou-abcd-sdlc5678/*',
  ],
  ssmPrefix: '/grafana/prod',
  githubRepo: 'testorg/test-grafana',
};

describe('GrafanaInfraStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new GrafanaInfraStack(app, 'TestStack', testProps);
    template = Template.fromStack(stack);
  });

  test('Grafana workspace has SSO auth and configured Grafana version', () => {
    template.hasResourceProperties('AWS::Grafana::Workspace', {
      AuthenticationProviders: ['AWS_SSO'],
      GrafanaVersion: '10.4',
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

  test('no SNS topics in this stack', () => {
    template.resourceCountIs('AWS::SNS::Topic', 0);
  });

  test('cross-account secret policy uses PrincipalOrgPaths condition for OU-based access', () => {
    const resources = template.findResources('AWS::SecretsManager::ResourcePolicy');
    const logicalId = Object.keys(resources)[0];
    const policy = resources[logicalId].Properties.ResourcePolicy;
    const statement = policy.Statement[0];

    expect(statement.Principal).toBe('*');

    const orgPaths =
      statement.Condition['ForAnyValue:StringLike']['aws:PrincipalOrgPaths'];
    expect(orgPaths).toEqual(testProps.secretAccessOuPaths);
  });

  test('GitHub Actions role policy only allows sts:AssumeRole on cdk-* resources', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Resource: Match.stringLikeRegexp('cdk-\\*'),
          }),
        ]),
      },
    });
  });

  test('stack has Environment, ManagedBy, and Project tags', () => {
    const roles = template.findResources('AWS::IAM::Role');
    const firstRoleId = Object.keys(roles)[0];
    const roleTags = roles[firstRoleId].Properties?.Tags ?? [];

    const tagMap: Record<string, string> = {};
    for (const tag of roleTags) {
      tagMap[tag.Key] = tag.Value;
    }

    expect(tagMap['Environment']).toBe('prod');
    expect(tagMap['ManagedBy']).toBe('CDK');
    expect(tagMap['Project']).toBe('Grafana');
  });

  test('Secrets Manager secret has UpdateReplacePolicy set to Delete', () => {
    const secrets = template.findResources('AWS::SecretsManager::Secret');
    const logicalId = Object.keys(secrets)[0];
    expect(secrets[logicalId].UpdateReplacePolicy).toBe('Delete');
  });

  test('SSM parameters are created for endpoint, workspace ID, secret ARN, and service role ARN', () => {
    const expectedParams = [
      `${testProps.ssmPrefix}/endpoint`,
      `${testProps.ssmPrefix}/workspace-id`,
      `${testProps.ssmPrefix}/secret-arn`,
      `${testProps.ssmPrefix}/service-role-arn`,
    ];

    for (const paramName of expectedParams) {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: paramName,
        Type: 'String',
      });
    }
  });

  test('uses existing OIDC provider when existingGitHubOidcArn is provided', () => {
    const app = new cdk.App();
    const stack = new GrafanaInfraStack(app, 'OidcImportStack', {
      ...testProps,
      existingGitHubOidcArn:
        'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com',
    });
    const t = Template.fromStack(stack);
    t.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
  });

  test('uses custom GitHub Actions role name when provided', () => {
    const app = new cdk.App();
    const stack = new GrafanaInfraStack(app, 'CustomRoleStack', {
      ...testProps,
      githubActionsRoleName: 'custom-gh-role',
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'custom-gh-role',
    });
  });

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});

// ------------------------------------------------------------------
// cdk-nag compliance test
// ------------------------------------------------------------------

describe('cdk-nag compliance', () => {
  test('no unsuppressed AwsSolutions errors', () => {
    const app = new cdk.App();
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
    const stack = new GrafanaInfraStack(app, 'NagTestStack', testProps);

    app.synth();

    const errors = Annotations.fromStack(stack).findError(
      '*',
      Match.stringLikeRegexp('AwsSolutions-.*'),
    );
    expect(errors).toHaveLength(0);
  });
});
