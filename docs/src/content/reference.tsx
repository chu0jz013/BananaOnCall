import { useState } from 'react';
import type { DocPage, Lang, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';
import { EndpointCard } from '../components/EndpointCard';
import { StatTiles } from '../components/StatTiles';
import { Tabs } from '../components/Tabs';

const boardJson = `
{
  "generatedAt": "2026-08-31T09:14:02Z",
  "health": "operational",
  "slis": [
    {
      "key": "ingest_availability",
      "target": 99.9,
      "actual": 99.977,
      "meeting": true,
      "windowDays": 28,
      "errorBudget": {
        "totalSeconds": 2419,
        "consumedSeconds": 561,
        "remainingSeconds": 1858,
        "consumedPercent": 23.2
      }
    }
  ],
  "activeIncidents": [],
  "recentIncidents": [ { "id": "01J9X...", "state": "resolved" } ],
  "mtta": { "seconds": 108, "sampleSize": 14 },
  "mttr": { "seconds": 1750, "sampleSize": 13 }
}
`;

const alertmanagerBody = `
{
  "version": "4",
  "groupKey": "{}:{alertname=\\"HighErrorRate\\"}",
  "status": "firing",
  "commonLabels": { "severity": "critical" },
  "alerts": [
    {
      "status": "firing",
      "labels": { "alertname": "HighErrorRate", "service": "checkout" },
      "startsAt": "2026-08-31T09:12:00Z"
    }
  ]
}
`;

/** Real key shapes, from lib/constructs/table.ts — not the wireframe's sketch. */
const items: readonly (readonly [string, string, string])[] = [
  ['AG#<ulid>', 'META', 'AlertGroup'],
  ['AG#<ulid>', 'ALERT#<ts>', 'Alert (raw)'],
  ['AG#<ulid>', 'LOG#<ts>', 'Timeline'],
  ['FP#<int>#<fp>', 'OPEN', 'Dedupe pointer — a conditional put guards the race'],
  ['EP#<id>', 'STEP#<order>', 'Escalation policy'],
  ['SCHED#<id>', 'SHIFT#<startISO>', 'Shift'],
  ['USER#<id>', 'CONTACT#telegram', 'Contact'],
  ['SLO#<sli>', 'DAY#<date>', 'SLA rollup'],
];

const configRows: Record<'local' | 'prod', readonly (readonly [string, string])[]> = {
  local: [
    ['restApiId', 'bananalocal'],
    ['integrationKeys', 'one fixed key, committed in lib/config.ts'],
    ['telegramApiBaseUrl', 'http://mock-telegram:8081'],
    ['icalUrl', 'http://ical/oncall.ics'],
    ['throttle', '200 / 400'],
    ['siteOrigin', "LocalStack's S3 website endpoint"],
  ],
  prod: [
    ['restApiId', 'unset — real API Gateway assigns its own'],
    ['integrationKeys', 'empty; must read from Secrets Manager'],
    ['telegramApiBaseUrl', 'https://api.telegram.org'],
    ['icalUrl', 'not set yet'],
    ['throttle', '50 / 100'],
    ['siteOrigin', 'not set — waiting on a domain (Q4)'],
  ],
};

function ConfigTabs({ lang }: { lang: Lang }) {
  const [env, setEnv] = useState<'local' | 'prod'>('local');
  const t = lang === 'vi';
  return (
    <Tabs
      label={t ? 'Môi trường' : 'Environment'}
      active={env}
      onChange={(id) => setEnv(id as 'local' | 'prod')}
      tabs={[
        { id: 'local', label: 'local' },
        { id: 'prod', label: 'prod' },
      ]}
    >
      <DataTable
        head={[t ? 'Khoá' : 'Key', t ? 'Giá trị' : 'Value']}
        rows={configRows[env].map(([k, v]) => [<code>{k}</code>, v])}
      />
    </Tabs>
  );
}

const endpointLabels = {
  vi: { request: 'Request', responses: 'Trả về', copy: 'Chép', copied: 'Đã chép' },
  en: { request: 'Request', responses: 'Responses', copy: 'Copy', copied: 'Copied' },
} as const;

function Endpoints({ lang }: { lang: Lang }) {
  const t = lang === 'vi';
  const L = endpointLabels[lang];
  return (
    <>
      <EndpointCard
        method="POST"
        path="/v1/int/{key}/alertmanager"
        badge={t ? 'KEY TRONG PATH' : 'KEY IN PATH'}
        summary={
          t
            ? 'Cửa trước cho webhook. Nhận body Alertmanager v4, đẩy vào SQS rồi trả 202 — không chạm DynamoDB.'
            : 'The webhook front door. Takes an Alertmanager v4 body, enqueues it and returns 202 — it never touches DynamoDB.'
        }
        request={alertmanagerBody}
        responses={[
          { code: '202', meaning: t ? 'Đã nằm trên queue' : 'On the queue', tone: 'ok' },
          { code: '400', meaning: t ? 'Không parse được, hoặc không có alert' : 'Does not parse, or carries no alerts' },
          { code: '401', meaning: t ? 'Sai key — phẳng, không chi tiết' : 'Wrong key — flat, with no detail', tone: 'bad' },
        ]}
        copy="make smoke"
        labels={L}
      />
      <EndpointCard
        method="GET"
        path="/v1/status"
        badge={t ? 'CÔNG KHAI · CORS MỞ' : 'PUBLIC · CORS OPEN'}
        summary={
          t
            ? 'Status board công khai (FR-8.3). Chỉ đọc, không đăng nhập, mở cho mọi origin — có chủ đích.'
            : 'The public status board (FR-8.3). Read-only, no login, open to any origin — deliberately.'
        }
        request={boardJson}
        responses={[{ code: '200', meaning: t ? 'Board đầy đủ' : 'The whole board', tone: 'ok' }]}
        copy="curl -sS $API/v1/status | python3 -m json.tool"
        labels={L}
        defaultOpen={false}
      />
    </>
  );
}

const dataSection = (t: boolean) => (
  <>
    <p className="text-soft">
      {t
        ? 'Một bảng duy nhất. Mọi access pattern đều là GetItem hoặc Query — không có gì scan.'
        : 'One table. Every access pattern is a GetItem or a Query — nothing scans.'}
    </p>
    <DataTable
      head={[<code>pk</code>, <code>sk</code>, t ? 'Là gì' : 'Item']}
      rows={items.map(([pk, sk, what]) => [<code>{pk}</code>, <code>{sk}</code>, what])}
    />
    <p className="text-soft">
      {t ? (
        <>
          <code>GSI1</code> (<code>gsi1pk</code>/<code>gsi1sk</code>, projection ALL) phục vụ hai
          lượt tra ngược: alert group theo trạng thái, và user theo Telegram chat id.
        </>
      ) : (
        <>
          <code>GSI1</code> (<code>gsi1pk</code>/<code>gsi1sk</code>, ALL projection) serves the two
          reverse lookups: alert groups by state, and users by Telegram chat id.
        </>
      )}
    </p>
    <CodeBlock title="lib/constructs/table.ts">{`
billingMode              PAY_PER_REQUEST   // D3 — nothing to pay while idle
timeToLiveAttribute      ttl               // free cleanup of raw alerts
pointInTimeRecovery      prod only
removalPolicy            DESTROY (local) / RETAIN (prod)
`}</CodeBlock>
  </>
);

const sliStats = [
  { label: 'ingest_availability', value: '99.9%' },
  { label: 'notification_latency', value: '99%' },
  { label: 'delivery_success', value: '99.5%' },
  { label: 'escalation_correctness', value: '99%' },
];

export const reference: Translated<DocPage> = {
  vi: {
    title: 'Tham chiếu',
    lede: 'Hai endpoint · một bảng · bốn SLI · cấu hình theo môi trường.',
    sections: [
      { id: 'endpoints', heading: 'Endpoint', body: <Endpoints lang="vi" /> },
      { id: 'data', heading: 'Mô hình dữ liệu', body: dataSection(true) },
      {
        id: 'slis',
        heading: 'SLI',
        body: (
          <>
            <p className="text-soft">
              Bốn chỉ số, đo trên cửa sổ trượt <strong>28 ngày</strong>.
            </p>
            <StatTiles stats={sliStats} />
            <Callout tone="note" title="Cửa sổ trống báo 100%, không phải 0%">
              <p>
                Một SLI chưa ai ghi nhận sự kiện nào thì chưa hỏng. Hiển thị một lần deploy mới tinh
                thành &ldquo;chết hoàn toàn&rdquo; còn tệ hơn là vô dụng.
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
            <p className="text-soft">
              Khác biệt giữa hai môi trường mới là phần đáng đọc, nên chúng nằm chung một chỗ chứ
              không phải hai bảng rời.
            </p>
            <ConfigTabs lang="vi" />
            <p className="text-soft">
              Chọn bằng CDK context: <code>-c env=local</code> hoặc <code>-c env=prod</code>. Tên
              nào khác sẽ ném lỗi ngay lúc synth.
            </p>
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Reference',
    lede: 'Two endpoints · one table · four SLIs · per-environment config.',
    sections: [
      { id: 'endpoints', heading: 'Endpoints', body: <Endpoints lang="en" /> },
      { id: 'data', heading: 'Data model', body: dataSection(false) },
      {
        id: 'slis',
        heading: 'SLIs',
        body: (
          <>
            <p className="text-soft">
              Four indicators, measured over a rolling <strong>28-day</strong> window.
            </p>
            <StatTiles stats={sliStats} />
            <Callout tone="note" title="An empty window reports 100%, not 0%">
              <p>
                An SLI nobody has recorded an event for has not failed. Showing a fresh deployment
                as totally down would be worse than useless.
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
            <p className="text-soft">
              The differences between the two environments are the interesting part, so they sit in
              one place rather than in two separate tables.
            </p>
            <ConfigTabs lang="en" />
            <p className="text-soft">
              Pick one with CDK context: <code>-c env=local</code> or <code>-c env=prod</code>. Any
              other name throws at synth time.
            </p>
          </>
        ),
      },
    ],
  },
};
