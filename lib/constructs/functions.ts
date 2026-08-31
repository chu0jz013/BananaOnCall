import * as path from 'node:path';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib/core';
import { Architecture, Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

/** Repo root, resolved from this file so `cdk synth` works from any cwd. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export interface GoFunctionProps {
  /** Directory name under cmd/ and dist/ — e.g. "ingest". */
  readonly name: string;
  readonly environment?: Record<string, string>;
  readonly timeout?: Duration;
  readonly memorySize?: number;
  readonly description: string;
}

/**
 * A Go handler on the OS-only runtime.
 *
 * `make build` cross-compiles cmd/<name> to dist/<name>/bootstrap, so there is
 * no Docker bundling step and no alpha construct in the dependency tree. arm64
 * matches both the Apple Silicon host LocalStack runs on and Graviton in prod.
 */
export function goFunction(scope: Construct, id: string, props: GoFunctionProps): LambdaFunction {
  // An explicit log group instead of `logRetention`, which is deprecated and
  // provisions a custom resource Lambda just to set a retention value.
  const logGroup = new LogGroup(scope, `${id}Logs`, {
    retention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });

  return new LambdaFunction(scope, id, {
    functionName: undefined,
    description: props.description,
    runtime: Runtime.PROVIDED_AL2023,
    architecture: Architecture.ARM_64,
    handler: 'bootstrap',
    code: Code.fromAsset(path.join(REPO_ROOT, 'dist', props.name)),
    timeout: props.timeout ?? Duration.seconds(30),
    memorySize: props.memorySize ?? 256,
    environment: props.environment,
    logGroup,
  });
}
