import { Construct } from 'constructs';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import { EnvConfig } from './config';
import { StateTable } from './constructs/table';
import { AlertQueue } from './constructs/queue';
import { goFunction } from './constructs/functions';
import { WebhookApi } from './constructs/api';
import { StatusSite } from './constructs/site';

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

    const api = new WebhookApi(this, 'Webhook', { env: cfg, ingest, status });

    new StatusSite(this, 'Site', { isLocal, bucketName: cfg.siteBucketName });

    new CfnOutput(this, 'ApiUrl', { value: api.api.url });
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
