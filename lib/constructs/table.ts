import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib/core';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';

export interface StateTableProps {
  readonly isLocal: boolean;
}

/**
 * The single table from design doc §07. Every access pattern is a GetItem or a
 * Query — nothing scans.
 *
 *   AlertGroup        AG#<ulid>        META
 *   Alert (raw)       AG#<ulid>        ALERT#<ts>
 *   Timeline          AG#<ulid>        LOG#<ts>
 *   Dedupe pointer    FP#<int>#<fp>    OPEN          <- conditional put guards the race
 *   Escalation policy EP#<id>          STEP#<order>
 *   Shift             SCHED#<id>       SHIFT#<startISO>
 *   Contact           USER#<id>        CONTACT#telegram
 *   SLA rollup        SLO#<sli>        DAY#<date>
 *
 * GSI1 serves the two reverse lookups: alert groups by state, and users by
 * Telegram chat id.
 */
export class StateTable extends Construct {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: StateTableProps) {
    super(scope, id);

    this.table = new Table(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST, // D3: nothing to pay while idle
      encryption: TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl', // free cleanup of raw alerts and timelines
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: !props.isLocal },
      // Local state is disposable by definition — LocalStack Community drops it
      // on every restart anyway.
      removalPolicy: props.isLocal ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
  }
}
