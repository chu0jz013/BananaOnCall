import type { DocPage, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';

const boardJson = `
{
  "generatedAt": "2026-08-31T09:14:02Z",
  "health": "operational",
  "slis": [
    {
      "key": "ingest_availability",
      "label": "Ingest availability",
      "detail": "Webhook requests that did not return 5xx",
      "target": 99.9,
      "actual": 99.977,
      "meeting": true,
      "windowDays": 28,
      "errorBudget": {
        "totalSeconds": 2419,
        "consumedSeconds": 561,
        "remainingSeconds": 1858,
        "consumedPercent": 23.2
      },
      "days": [{ "date": "2026-08-04", "good": 1204, "total": 1204 }]
    }
  ],
  "activeIncidents": [],
  "recentIncidents": [
    {
      "id": "01J9X...",
      "title": "HighErrorRate",
      "severity": "critical",
      "service": "checkout",
      "state": "resolved",
      "startedAt": "2026-08-29T02:11:00Z",
      "ackedAt": "2026-08-29T02:12:48Z",
      "resolvedAt": "2026-08-29T02:41:10Z",
      "alertCount": 9
    }
  ],
  "mtta": { "seconds": 108, "sampleSize": 14 },
  "mttr": { "seconds": 1750, "sampleSize": 13 }
}
`;

const table = `
                   pk               sk
AlertGroup         AG#<ulid>        META
Alert (raw)        AG#<ulid>        ALERT#<ts>
Timeline           AG#<ulid>        LOG#<ts>
Dedupe pointer     FP#<int>#<fp>    OPEN      <- conditional put guards the race
Escalation policy  EP#<id>          STEP#<order>
Shift              SCHED#<id>       SHIFT#<startISO>
Contact            USER#<id>        CONTACT#telegram
SLA rollup         SLO#<sli>        DAY#<date>
`;

const slis = (head: readonly string[]) => (
  <DataTable
    head={head}
    rows={[
      [<code>ingest_availability</code>, 'Webhook requests that did not return 5xx', <code>99.9%</code>],
      [<code>notification_latency</code>, 'Alerts whose first message went out within 30 seconds', <code>99%</code>],
      [<code>delivery_success</code>, 'Messages the provider confirmed it received', <code>99.5%</code>],
      [<code>escalation_correctness</code>, 'Escalation steps that ran on time, within 30 seconds', <code>99%</code>],
    ]}
  />
);

export const reference: Translated<DocPage> = {
  vi: {
    title: 'Tham chiếu',
    lede: 'Hai endpoint, một bảng DynamoDB, bốn SLI và một danh sách target của Makefile.',
    sections: [
      {
        id: 'endpoints',
        heading: 'Endpoint',
        body: (
          <>
            <h3 className="mt-6 mb-2 font-mono text-sm font-semibold">
              POST /v1/int/&#123;key&#125;/alertmanager
            </h3>
            <p className="text-soft">
              Cửa trước cho webhook. Nhận body Alertmanager v4. Integration key nằm ngay trong
              path — đây là chỗ bản build đi chệch thiết kế, vì Cognito không có trong LocalStack
              Community.
            </p>
            <DataTable
              head={['Mã', 'Khi nào', 'Thân']}
              rows={[
                [<code>202</code>, 'Batch hợp lệ, đã nằm trên queue', <code>{'{"status":"accepted","alerts":n}'}</code>],
                [<code>400</code>, 'Body không parse được, hoặc không có alert nào', 'lỗi ngắn gọn'],
                [<code>401</code>, 'Integration key sai', <span className="text-soft">phẳng, không chi tiết — dò key không được lộ gì</span>],
              ]}
            />

            <h3 className="mt-8 mb-2 font-mono text-sm font-semibold">GET /v1/status</h3>
            <p className="text-soft">
              Status board công khai (FR-8.3). Chỉ đọc, không cần đăng nhập, CORS mở cho mọi
              origin — có chủ đích: dữ liệu công khai, không cookie, không credential.
            </p>
            <CodeBlock title="Board — internal/domain/status.go">{boardJson}</CodeBlock>
          </>
        ),
      },
      {
        id: 'data',
        heading: 'Mô hình dữ liệu',
        body: (
          <>
            <p className="text-soft">
              Một bảng duy nhất. Mọi access pattern đều là GetItem hoặc Query —{' '}
              <strong>không có gì scan</strong>.
            </p>
            <CodeBlock title="lib/constructs/table.ts">{table}</CodeBlock>
            <p className="text-soft">
              <code>GSI1</code> (<code>gsi1pk</code>/<code>gsi1sk</code>, projection ALL) phục vụ
              hai lượt tra ngược: alert group theo trạng thái, và user theo Telegram chat id.
            </p>
            <DataTable
              head={['Thuộc tính', 'Giá trị']}
              rows={[
                ['Billing', <>PAY_PER_REQUEST — không tốn gì khi rảnh (D3)</>],
                ['TTL', <><code>ttl</code> — dọn alert thô và timeline miễn phí</>],
                ['Point-in-time recovery', 'bật ở prod, tắt ở local'],
                ['Removal policy', 'DESTROY ở local, RETAIN ở prod'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'slis',
        heading: 'SLI',
        body: (
          <>
            <p className="text-soft">
              Bốn chỉ số, đo trên cửa sổ trượt <strong>28 ngày</strong>.
            </p>
            {slis(['Key', 'Đo cái gì', 'Mục tiêu'])}
            <Callout tone="note" title="Cửa sổ trống báo 100%, không phải 0%">
              <p>
                Một SLI chưa ai ghi nhận sự kiện nào thì chưa hỏng. Hiển thị một lần deploy mới
                tinh thành &ldquo;chết hoàn toàn&rdquo; còn tệ hơn là vô dụng.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'config',
        heading: 'Cấu hình theo môi trường',
        body: (
          <>
            <DataTable
              head={['Khoá', 'local', 'prod']}
              rows={[
                [<code>restApiId</code>, <code>bananalocal</code>, <span className="text-soft">không đặt</span>],
                [<code>integrationKeys</code>, 'một key cố định trong repo', 'đọc từ Secrets Manager'],
                [<code>telegramApiBaseUrl</code>, <code>http://mock-telegram:8081</code>, <code>https://api.telegram.org</code>],
                [<code>icalUrl</code>, <code>http://ical/oncall.ics</code>, <span className="text-soft">chưa đặt</span>],
                [<code>throttle</code>, <code>200 / 400</code>, <code>50 / 100</code>],
                [<code>siteOrigin</code>, 'S3 website của LocalStack', <span className="text-soft">chưa đặt — chờ chốt domain</span>],
              ]}
            />
            <p className="text-soft">
              Chọn môi trường bằng CDK context: <code>-c env=local</code> hoặc{' '}
              <code>-c env=prod</code>. Tên nào khác sẽ ném lỗi ngay lúc synth.
            </p>
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Reference',
    lede: 'Two endpoints, one DynamoDB table, four SLIs, and a list of Makefile targets.',
    sections: [
      {
        id: 'endpoints',
        heading: 'Endpoints',
        body: (
          <>
            <h3 className="mt-6 mb-2 font-mono text-sm font-semibold">
              POST /v1/int/&#123;key&#125;/alertmanager
            </h3>
            <p className="text-soft">
              The webhook front door. Takes an Alertmanager v4 body. The integration key sits in
              the path — this is where the build deviated from the design, because Cognito is not
              in LocalStack Community.
            </p>
            <DataTable
              head={['Code', 'When', 'Body']}
              rows={[
                [<code>202</code>, 'Valid batch, now on the queue', <code>{'{"status":"accepted","alerts":n}'}</code>],
                [<code>400</code>, 'Body does not parse, or carries no alerts', 'a short error'],
                [<code>401</code>, 'Wrong integration key', <span className="text-soft">flat, with no detail — probing must reveal nothing</span>],
              ]}
            />

            <h3 className="mt-8 mb-2 font-mono text-sm font-semibold">GET /v1/status</h3>
            <p className="text-soft">
              The public status board (FR-8.3). Read-only, unauthenticated, CORS open to any
              origin — deliberately: public data, no cookies, no credentials.
            </p>
            <CodeBlock title="Board — internal/domain/status.go">{boardJson}</CodeBlock>
          </>
        ),
      },
      {
        id: 'data',
        heading: 'Data model',
        body: (
          <>
            <p className="text-soft">
              One table. Every access pattern is a GetItem or a Query —{' '}
              <strong>nothing scans</strong>.
            </p>
            <CodeBlock title="lib/constructs/table.ts">{table}</CodeBlock>
            <p className="text-soft">
              <code>GSI1</code> (<code>gsi1pk</code>/<code>gsi1sk</code>, ALL projection) serves
              the two reverse lookups: alert groups by state, and users by Telegram chat id.
            </p>
            <DataTable
              head={['Property', 'Value']}
              rows={[
                ['Billing', <>PAY_PER_REQUEST — nothing to pay while idle (D3)</>],
                ['TTL', <><code>ttl</code> — free cleanup of raw alerts and timelines</>],
                ['Point-in-time recovery', 'on in prod, off locally'],
                ['Removal policy', 'DESTROY locally, RETAIN in prod'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'slis',
        heading: 'SLIs',
        body: (
          <>
            <p className="text-soft">
              Four indicators, measured over a rolling <strong>28-day</strong> window.
            </p>
            {slis(['Key', 'What it measures', 'Target'])}
            <Callout tone="note" title="An empty window reports 100%, not 0%">
              <p>
                An SLI nobody has recorded an event for has not failed. Showing a fresh
                deployment as totally down would be worse than useless.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'config',
        heading: 'Per-environment config',
        body: (
          <>
            <DataTable
              head={['Key', 'local', 'prod']}
              rows={[
                [<code>restApiId</code>, <code>bananalocal</code>, <span className="text-soft">unset</span>],
                [<code>integrationKeys</code>, 'one fixed key in the repo', 'read from Secrets Manager'],
                [<code>telegramApiBaseUrl</code>, <code>http://mock-telegram:8081</code>, <code>https://api.telegram.org</code>],
                [<code>icalUrl</code>, <code>http://ical/oncall.ics</code>, <span className="text-soft">not set yet</span>],
                [<code>throttle</code>, <code>200 / 400</code>, <code>50 / 100</code>],
                [<code>siteOrigin</code>, "LocalStack's S3 website", <span className="text-soft">not set — waiting on a domain</span>],
              ]}
            />
            <p className="text-soft">
              Pick the environment with CDK context: <code>-c env=local</code> or{' '}
              <code>-c env=prod</code>. Any other name throws at synth time.
            </p>
          </>
        ),
      },
    ],
  },
};
