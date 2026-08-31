import { Construct } from 'constructs';
import { Tags } from 'aws-cdk-lib/core';
import {
  Cors,
  LambdaIntegration,
  LogGroupLogDestination,
  MethodLoggingLevel,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { EnvConfig } from '../config';

export interface WebhookApiProps {
  readonly env: EnvConfig;
  readonly ingest: IFunction;
  readonly status: IFunction;
}

/**
 * The public edge (D2, revised).
 *
 * The design doc specified an HTTP API, but `apigatewayv2` is not part of
 * LocalStack Community, so the whole local loop would have been untestable.
 * REST API costs ~0.40 USD/month more at our volume and keeps everything the
 * doc asked for — custom domain, throttling, key-in-path — while adding usage
 * plans and request validators.
 */
export class WebhookApi extends Construct {
  readonly api: RestApi;

  constructor(scope: Construct, id: string, props: WebhookApiProps) {
    super(scope, id);

    const accessLogs = new LogGroup(this, 'AccessLogs', {
      retention: RetentionDays.ONE_WEEK,
    });

    this.api = new RestApi(this, 'Api', {
      restApiName: `bananaoncall-${props.env.name}`,
      description: 'BananaOnCall webhook and control plane',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: props.env.throttle.rateLimit,
        throttlingBurstLimit: props.env.throttle.burstLimit,
        accessLogDestination: new LogGroupLogDestination(accessLogs),
        loggingLevel: MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
    });

    // LocalStack honours this tag and pins the generated id, which is what
    // keeps deploy/alertmanager.yml and the Makefile URLs stable. Real API
    // Gateway just stores it as an ordinary tag.
    if (props.env.restApiId) {
      Tags.of(this.api).add('_custom_id_', props.env.restApiId);
    }

    // POST /v1/int/{key}/alertmanager
    const integration = this.api.root
      .addResource('v1')
      .addResource('int')
      .addResource('{key}');

    integration
      .addResource('alertmanager')
      .addMethod('POST', new LambdaIntegration(props.ingest, { proxy: true }));

    // GET /v1/status — public, read-only, and on a different origin from the
    // board that calls it, so it needs a real preflight rather than a wildcard.
    this.api.root
      .getResource('v1')!
      .addResource('status', {
        defaultCorsPreflightOptions: {
          // Any origin, deliberately. The board is unauthenticated public data
          // with no cookies and no credentials, so restricting the origin would
          // protect nothing while breaking legitimate embedding — and the local
          // Vite dev server, which is a different origin again.
          allowOrigins: Cors.ALL_ORIGINS,
          allowMethods: ['GET'],
          allowHeaders: Cors.DEFAULT_HEADERS,
        },
      })
      .addMethod('GET', new LambdaIntegration(props.status, { proxy: true }));
  }

  /** Base invoke URL as seen from inside the compose network. */
  static internalUrl(restApiId: string, stage = 'prod'): string {
    return `http://localstack:4566/_aws/execute-api/${restApiId}/${stage}`;
  }
}
