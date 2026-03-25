import { CfnResource, IAspect, RemovalPolicy } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

/**
 * CDK Aspect that applies a given RemovalPolicy to all CfnResource nodes in the construct tree.
 */
export class RemovalPolicyAspect implements IAspect {
  constructor(private readonly policy: RemovalPolicy) {}

  visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(this.policy);
    }
  }
}
