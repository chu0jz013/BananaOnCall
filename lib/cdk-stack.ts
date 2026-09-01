import { Construct } from 'constructs';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction as LambdaTarget } from 'aws-cdk-lib/aws-events-targets';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { EnvConfig } from './config';
import { StateTable } from './constructs/table';
import { AlertQueue } from './constructs/queue';
import { goFunction } from './constructs/functions';
import { WebhookApi } from './constructs/api';
import { StatusSite } from './constructs/site';
import { Escalation } from './constructs/escalation';

export interface BananaOnCallStackProps extends StackProps {
  readonly config: EnvConfig;
}

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props: BananaOnCallStackProps) {
    super(scope, id, props);

    const cfg = props.config;
    const isLocal = cfg.name === 'local';

    const state = new StateTable(this, 'State', { isLocal });
    const alerts = new AlertQueue(this, 'Alerts');

    // ingest never touches DynamoDB: writing to SQS and returning 202 is the
    // whole job, so a slow or broken database cannot cost us an alert (FR-1.5).
    const ingest = goFunction(this, 'Ingest', {
      name: 'ingest',
      description: 'Verify integration key, normalize payload, enqueue',
      timeout: Duration.seconds(10),
      environment: {
        ALERT_QUEUE_URL: alerts.queue.queueUrl,
        INTEGRATION_KEYS: cfg.integrationKeys.join(','),
      },
    });
    alerts.queue.grantSendMessages(ingest);

    // The public status board (FR-8.3). Read-only and unauthenticated: it has
    // to work for someone who cannot log in, usually because the thing they
    // would log into is the thing that broke.
    const status = goFunction(this, 'Status', {
      name: 'status',
      description: 'Serve the public status board',
      timeout: Duration.seconds(15),
      environment: {
        TABLE_NAME: state.table.tableName,
        // Matches the preflight above: public data, any origin.
        ALLOWED_ORIGIN: '*',
      },
    });
    state.table.grantReadData(status);

    // The notifier is one rung of the escalation ladder. It is deliberately
    // ignorant of the state machine driving it — it answers "who gets this and
    // how long do we wait", and Step Functions does the waiting.
    const notify = goFunction(this, 'Notify', {
      name: 'notify',
      description: 'Send one escalation step and report whether to continue',
      timeout: Duration.seconds(20),
      environment: {
        TABLE_NAME: state.table.tableName,
        TELEGRAM_API_BASE: cfg.telegramApiBaseUrl,
        TELEGRAM_BOT_TOKEN: cfg.telegramBotToken,
        SCHEDULE_ID: cfg.scheduleId,
      },
    });
    state.table.grantReadWriteData(notify);

    const escalation = new Escalation(this, 'Escalation', { notify });

    // processor decides *whether* there is an incident; it never sends. That
    // keeps "should anyone be woken up" a single decision, made once.
    const processor = goFunction(this, 'Processor', {
      name: 'processor',
      description: 'Group and deduplicate alerts, open and close incidents',
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: state.table.tableName,
        ESCALATION_ARN: escalation.stateMachine.stateMachineArn,
      },
    });
    state.table.grantReadWriteData(processor);
    escalation.stateMachine.grantStartExecution(processor);
    escalation.stateMachine.grantExecution(processor, 'states:StopExecution');
    processor.addEventSource(
      new SqsEventSource(alerts.queue, {
        // One message at a time. The queue is FIFO precisely so `firing`
        // arrives before `resolved` for a subject; a partial batch failure
        // would replay that ordering, so we do not take batches at all.
        batchSize: 1,
      }),
    );

    // The Telegram webhook. An ack here is what stops an escalation (FR-3.5).
    const callback = goFunction(this, 'Callback', {
      name: 'callback',
      description: 'Apply Ack, Resolve and Silence button presses',
      timeout: Duration.seconds(15),
      environment: {
        TABLE_NAME: state.table.tableName,
        TELEGRAM_API_BASE: cfg.telegramApiBaseUrl,
        TELEGRAM_BOT_TOKEN: cfg.telegramBotToken,
        TELEGRAM_WEBHOOK_SECRET: cfg.telegramWebhookSecret,
        ESCALATION_ARN: escalation.stateMachine.stateMachineArn,
      },
    });
    state.table.grantReadWriteData(callback);
    escalation.stateMachine.grantExecution(callback, 'states:StopExecution');

    // Rota sync (D7). EventBridge Rules rather than Scheduler: LocalStack's
    // scheduler provider stores schedules and never fires them, while rate()
    // rules really do run — and cost nothing.
    const scheduleSync = goFunction(this, 'ScheduleSync', {
      name: 'schedule',
      description: 'Materialize the on-call rota from the iCal feed',
      timeout: Duration.seconds(20),
      environment: {
        TABLE_NAME: state.table.tableName,
        ICAL_URL: cfg.icalUrl,
        SCHEDULE_ID: cfg.scheduleId,
      },
    });
    state.table.grantReadWriteData(scheduleSync);

    new Rule(this, 'ScheduleSyncTimer', {
      description: 'Poll the on-call calendar (FR-4.1)',
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaTarget(scheduleSync)],
    });

    const api = new WebhookApi(this, 'Webhook', { env: cfg, ingest, status, callback });

    new StatusSite(this, 'Site', { isLocal, bucketName: cfg.siteBucketName });

    new CfnOutput(this, 'ApiUrl', { value: api.api.url });
    new CfnOutput(this, 'EscalationArn', { value: escalation.stateMachine.stateMachineArn });
    new CfnOutput(this, 'ScheduleSyncName', { value: scheduleSync.functionName });
    new CfnOutput(this, 'AlertQueueUrl', { value: alerts.queue.queueUrl });
    new CfnOutput(this, 'TableName', { value: state.table.tableName });

    if (cfg.restApiId) {
      new CfnOutput(this, 'InternalApiUrl', {
        value: WebhookApi.internalUrl(cfg.restApiId),
        description: 'Invoke URL as reachable from sibling compose containers',
      });
    }
  }
}
