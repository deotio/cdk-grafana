import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Template } from 'aws-cdk-lib/assertions';

import { RemovalPolicyAspect } from '../lib/aspects/removal-policy-aspect';

describe('RemovalPolicyAspect', () => {
  test('applies DESTROY removal policy to all CfnResources', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    new ssm.StringParameter(stack, 'Param', {
      parameterName: '/test/param',
      stringValue: 'value',
    });

    cdk.Aspects.of(stack).add(new RemovalPolicyAspect(cdk.RemovalPolicy.DESTROY));

    const template = Template.fromStack(stack);
    const params = template.findResources('AWS::SSM::Parameter');
    const logicalId = Object.keys(params)[0];
    expect(params[logicalId].DeletionPolicy).toBe('Delete');
    expect(params[logicalId].UpdateReplacePolicy).toBe('Delete');
  });

  test('applies RETAIN removal policy to all CfnResources', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    new ssm.StringParameter(stack, 'Param', {
      parameterName: '/test/param',
      stringValue: 'value',
    });

    cdk.Aspects.of(stack).add(new RemovalPolicyAspect(cdk.RemovalPolicy.RETAIN));

    const template = Template.fromStack(stack);
    const params = template.findResources('AWS::SSM::Parameter');
    const logicalId = Object.keys(params)[0];
    expect(params[logicalId].DeletionPolicy).toBe('Retain');
    expect(params[logicalId].UpdateReplacePolicy).toBe('Retain');
  });
});
