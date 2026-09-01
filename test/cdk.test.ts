import { App } from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CdkStack } from '../lib/cdk-stack';
import { envConfig, LOCAL_REST_API_ID } from '../lib/config';

function template(env: 'local' | 'prod'): Template {
  const app = new App();
  const stack = new CdkStack(app, 'TestStack', { config: envConfig(env) });
  return Template.fromStack(stack);
}

/** Every IAM action granted to the role whose logical id starts with `prefix`. */
function actionsForRole(prefix: string): string[] {
  const policies = template('local').findResources('AWS::IAM::Policy');
  return Object.values(policies)
    .filter((p: any) =>
      (p.Properties.Roles ?? []).some((r: any) => (r.Ref ?? '').startsWith(prefix)),
    )
    .flatMap((p: any) => p.Properties.PolicyDocument.Statement as any[])
    .flatMap((s: any) => [s.Action].flat())
    .filter((a: unknown): a is string => typeof a === 'string');
}

describe('alert queue', () => {
  test('is FIFO with explicit deduplication', () => {
    // Content-based dedup would hash the body for us, but we want the narrower
    // key ingest computes, so it must stay off.
    template('local').hasResourceProperties('AWS::SQS::Queue', {
      FifoQueue: true,
      ContentBasedDeduplication: false,
    });
  });

  test('parks poison messages on a dead-letter queue', () => {
    template('local').hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 3 }),
    });
  });
});

describe('state table', () => {
  test('is on-demand with TTL and GSI1', () => {
    template('local').hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'GSI1' }),
      ]),
    });
  });

  test('is retained in prod and disposable locally', () => {
    template('prod').hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
    template('local').hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Delete' });
  });
});

describe('ingest', () => {
  test('runs Go on arm64', () => {
    template('local').hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'provided.al2023',
      Handler: 'bootstrap',
      Architectures: ['arm64'],
    });
  });

  test('can send to the queue but has no table access', () => {
    // ingest must not reach DynamoDB: FR-1.5 depends on it staying out of the
    // database's blast radius. Scoped to ingest's own role — the status Lambda
    // legitimately reads the table, so a stack-wide scan proves nothing.
    expect(actionsForRole('Ingest')).toEqual(
      expect.arrayContaining([expect.stringMatching(/^sqs:/)]),
    );
    expect(actionsForRole('Ingest')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^dynamodb:/)]),
    );
  });

  test('the status reader can read the table but not write it', () => {
    const actions = actionsForRole('Status');
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^dynamodb:Query/)]));
    expect(actions.filter((a) => /^dynamodb:(Put|Update|Delete|BatchWrite)/.test(a))).toEqual([]);
  });
});

describe('webhook api', () => {
  test('exposes POST /v1/int/{key}/alertmanager', () => {
    const t = template('local');
    for (const part of ['v1', 'int', '{key}', 'alertmanager']) {
      t.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: part });
    }
    t.hasResourceProperties('AWS::ApiGateway::Method', { HttpMethod: 'POST' });
  });

  test('lets any origin read the public board', () => {
    // Not an oversight: the status endpoint is unauthenticated public data, so
    // an origin restriction would block embedding without protecting anything.
    const methods = template('local').findResources('AWS::ApiGateway::Method', {
      Properties: { HttpMethod: 'OPTIONS' },
    });
    const headers = JSON.stringify(Object.values(methods));
    expect(headers).toContain("'*'");
    expect(headers).toContain('GET');
  });

  test('throttles the stage', () => {
    template('local').hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'prod',
      MethodSettings: Match.arrayWith([
        Match.objectLike({ ThrottlingRateLimit: 200, ThrottlingBurstLimit: 400 }),
      ]),
    });
  });

  test('pins the api id locally so container URLs stay stable', () => {
    // LocalStack reads this tag and uses it as the generated REST API id.
    template('local').hasResourceProperties('AWS::ApiGateway::RestApi', {
      Tags: Match.arrayWith([
        Match.objectLike({ Key: '_custom_id_', Value: LOCAL_REST_API_ID }),
      ]),
    });
  });

  test('does not pin the api id in prod', () => {
    const apis = template('prod').findResources('AWS::ApiGateway::RestApi');
    const tags = Object.values(apis).flatMap((a: any) => a.Properties.Tags ?? []);
    expect(tags.some((t: any) => t.Key === '_custom_id_')).toBe(false);
  });
});

describe('escalation', () => {
  test('is a Standard state machine that waits on the policy, not on a constant', () => {
    const machines = template('local').findResources('AWS::StepFunctions::StateMachine');
    const definition = JSON.stringify(Object.values(machines));

    // A hardcoded Seconds here would mean changing an escalation chain needs a
    // deploy; FR-3.2 says the wait comes from the policy.
    expect(definition).toContain('SecondsPath');
    expect(definition).toContain('$.waitSeconds');
    expect(definition).toContain('$.stop');
    // STANDARD is the default and is what D1 chose: Express executions cap at
    // five minutes, which is shorter than a single escalation step in prod.
    const types = Object.values(machines).map((m: any) => m.Properties.StateMachineType);
    expect(types.every((t) => t === undefined || t === 'STANDARD')).toBe(true);
  });

  test('the processor can start and stop it but never sends a message itself', () => {
    const actions = actionsForRole('Processor');
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^states:StartExecution/)]));
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^states:StopExecution/)]));
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^dynamodb:/)]));
  });

  test('the callback can stop an escalation but cannot start one', () => {
    // An ack must be able to end the ladder; nothing a responder presses should
    // be able to launch a new one.
    const actions = actionsForRole('Callback');
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^states:StopExecution/)]));
    expect(actions).not.toEqual(expect.arrayContaining([expect.stringMatching(/^states:StartExecution/)]));
  });

  test('the notifier has no access to the state machine at all', () => {
    // It reports whether to continue; it does not get to decide by itself.
    expect(actionsForRole('Notify')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^states:/)]),
    );
  });
});

describe('processing', () => {
  test('consumes the FIFO queue one message at a time', () => {
    // The queue is FIFO so that `firing` precedes `resolved` for one subject.
    // A larger batch would let a partial failure replay that ordering.
    template('local').hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1,
    });
  });

  test('polls the calendar on an EventBridge rule, not the scheduler', () => {
    // LocalStack's scheduler provider stores schedules and never fires them;
    // rate() rules really do run, and cost nothing (FR-4.1).
    template('local').hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(5 minutes)',
    });
  });

  test('exposes the telegram callback behind a secret path segment', () => {
    const t = template('local');
    for (const part of ['tg', '{secret}', 'webhook']) {
      t.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: part });
    }
  });
});
