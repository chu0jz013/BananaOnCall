#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CdkStack } from '../lib/cdk-stack';
import { envConfig } from '../lib/config';

const app = new cdk.App();

// `cdklocal deploy -c env=local` (the default) or `cdk deploy -c env=prod`.
const config = envConfig(app.node.tryGetContext('env') ?? 'local');

new CdkStack(app, 'CdkStack', {
  config,
  // Environment-agnostic: one synthesized template deploys to LocalStack or to
  // a real account. Nothing here does an account-scoped context lookup.
  description: `BananaOnCall (${config.name})`,
});
