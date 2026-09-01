/**
 * Per-environment knobs. `local` targets LocalStack Community, which is why a
 * few things differ from prod — each difference is commented where it matters.
 */
export interface EnvConfig {
  readonly name: 'local' | 'prod';
  /**
   * Pins the REST API id via LocalStack's `_custom_id_` tag so the invoke URL
   * survives every redeploy. Real API Gateway ignores the tag and assigns its
   * own id, so this is safe to leave set — but we only set it locally.
   */
  readonly restApiId?: string;
  /** Webhook keys accepted by ingest (FR-1.4). Prod reads these from Secrets Manager. */
  readonly integrationKeys: string[];
  /** Where the notifier sends Telegram calls. */
  readonly telegramApiBaseUrl: string;
  /**
   * Bot token. Locally it is a fixed string the mock ignores; in prod this is
   * a Secrets Manager lookup, not a synthesized value.
   */
  readonly telegramBotToken: string;
  /**
   * Shared secret for the callback webhook. It appears in the URL path *and*
   * in the header Telegram sends, so a leaked URL alone is not enough.
   */
  readonly telegramWebhookSecret: string;
  /** Schedule the notifier resolves "who is on call" against (FR-4.4). */
  readonly scheduleId: string;
  /** Where schedule-sync fetches the roster (D7). */
  readonly icalUrl: string;
  /** Throttle applied at the API stage (D2). */
  readonly throttle: { rateLimit: number; burstLimit: number };
  /** Fixed locally so `make web-deploy` can sync without looking the name up. */
  readonly siteBucketName?: string;
  /** Where the board is served from. Informational — CORS is open by design. */
  readonly siteOrigin: string;
}

/** The single well-known key the local harness and Alertmanager both use. */
export const LOCAL_INTEGRATION_KEY =
  '4f9c2d7ae1b845f0932c6de8a17b40c5e6f3819d2a4b7c05e8d9f1a3b6c47e20';

export const LOCAL_REST_API_ID = 'bananalocal';

export const LOCAL_SITE_BUCKET = 'bananaoncall-status-local';

/** Fixed locally so the Makefile, the E2E suite and mock-telegram agree. */
export const LOCAL_TELEGRAM_SECRET = 'b0c8f3a15e7d429cab6f0e2d9137c845';
export const LOCAL_BOT_TOKEN = '1234567:local-bot-token';

/**
 * LocalStack's S3 website endpoint. `*.localhost.localstack.cloud` resolves to
 * 127.0.0.1 in any browser, so this works without touching /etc/hosts.
 */
export const LOCAL_SITE_ORIGIN =
  `http://${LOCAL_SITE_BUCKET}.s3-website.localhost.localstack.cloud:4566`;

export function envConfig(name: string): EnvConfig {
  switch (name) {
    case 'prod':
      return {
        name: 'prod',
        integrationKeys: [],
        telegramApiBaseUrl: 'https://api.telegram.org',
        // Placeholders: prod reads both from Secrets Manager at start-up rather
        // than baking them into a template that lives in git.
        telegramBotToken: '',
        telegramWebhookSecret: '',
        scheduleId: 'primary',
        icalUrl: '',
        throttle: { rateLimit: 50, burstLimit: 100 },
        // Set once a domain is chosen (design doc Q4).
        siteOrigin: '',
      };
    case 'local':
      return {
        name: 'local',
        restApiId: LOCAL_REST_API_ID,
        integrationKeys: [LOCAL_INTEGRATION_KEY],
        // Container-to-container names: Lambdas resolve these because
        // LAMBDA_DOCKER_NETWORK puts them on this compose network.
        telegramApiBaseUrl: 'http://mock-telegram:8081',
        telegramBotToken: LOCAL_BOT_TOKEN,
        telegramWebhookSecret: LOCAL_TELEGRAM_SECRET,
        scheduleId: 'primary',
        icalUrl: 'http://ical/oncall.ics',
        throttle: { rateLimit: 200, burstLimit: 400 },
        siteBucketName: LOCAL_SITE_BUCKET,
        siteOrigin: LOCAL_SITE_ORIGIN,
      };
    default:
      throw new Error(`unknown env "${name}": expected "local" or "prod"`);
  }
}
