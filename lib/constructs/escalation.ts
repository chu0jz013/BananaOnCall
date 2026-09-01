import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  Choice,
  Condition,
  DefinitionBody,
  JsonPath,
  LogLevel,
  StateMachine,
  StateMachineType,
  Succeed,
  Wait,
  WaitTime,
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface EscalationProps {
  /** The notifier. One invocation is one rung of the ladder. */
  readonly notify: IFunction;
}

/**
 * The escalation ladder (D1, FR-3.2 through FR-3.6).
 *
 *   Notify -> stop? -> Succeed
 *          -> Wait(waitSeconds from the policy) -> Notify -> ...
 *
 * Step Functions Standard, not a cron sweeper, because the wait then lives in
 * the service instead of in a process: a deploy or a Lambda restart mid-wait
 * cannot lose an escalation (FR-3.7), and each incident leaves an execution
 * graph behind that answers "why was the second person never paged".
 *
 * Every decision — whether to stop, who is next, how long to wait — is made
 * inside the notifier, against the group's state at the moment of sending. The
 * state machine therefore needs no database access of its own, and an ack that
 * lands one second before the wait expires still stops the page.
 */
export class Escalation extends Construct {
  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: EscalationProps) {
    super(scope, id);

    const notify = new LambdaInvoke(this, 'Notify', {
      lambdaFunction: props.notify,
      // The task's output replaces the state, so the next iteration's input is
      // exactly what the notifier returned: {groupId, level, waitSeconds, stop}.
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    const wait = new Wait(this, 'WaitForAck', {
      // wait_after comes from the policy, not from the template: changing an
      // escalation chain must not require a deploy (FR-3.2).
      time: WaitTime.secondsPath(JsonPath.stringAt('$.waitSeconds')),
    });

    notify.next(
      new Choice(this, 'AckedOrExhausted?')
        .when(Condition.booleanEquals('$.stop', true), new Succeed(this, 'Stopped'))
        .otherwise(wait.next(notify)),
    );

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      definitionBody: DefinitionBody.fromChainable(notify),
      stateMachineType: StateMachineType.STANDARD,
      // Longer than the worst case FR-3.6 allows: 50 repeats of the last step.
      timeout: Duration.hours(12),
      logs: {
        destination: new LogGroup(this, 'Logs', { retention: RetentionDays.ONE_WEEK }),
        level: LogLevel.ALL,
      },
    });
  }
}
