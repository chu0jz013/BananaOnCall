import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib/core';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';

/**
 * The ingest -> processor buffer (D4).
 *
 * FIFO with MessageGroupId set to the routing key keeps `firing` strictly ahead
 * of `resolved` for one subject, while still letting unrelated alerts run in
 * parallel. Deduplication is explicit rather than content-based: ingest supplies
 * a MessageDeduplicationId so an Alertmanager retry of the identical body
 * collapses (FR-1.6).
 */
export class AlertQueue extends Construct {
  readonly queue: Queue;
  readonly deadLetterQueue: Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.deadLetterQueue = new Queue(this, 'Dlq', {
      fifo: true,
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });

    this.queue = new Queue(this, 'Queue', {
      fifo: true,
      contentBasedDeduplication: false,
      encryption: QueueEncryption.SQS_MANAGED,
      // Six times the processor's timeout, the ratio AWS recommends so a
      // retry never overlaps an in-flight invocation.
      visibilityTimeout: Duration.seconds(180),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        // Two retries, then park it: a payload that fails three times is a bug,
        // not a blip, and burning the queue on it delays real alerts.
        maxReceiveCount: 3,
      },
    });
  }
}
