import type { DocPage, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';
import { FlowDiagram, type FlowLabels } from '../components/FlowDiagram';

const flowVi: FlowLabels = {
  caption: 'Đường đi của một alert, đúng như code hiện tại. Hộp nét đứt là phần đã thiết kế nhưng chưa xây.',
  ingestNote: 'kiểm key · chuẩn hoá · enqueue · 202',
  queueNote: 'MessageGroupId + DedupeId · DLQ sau 3 lần',
  processorNote: 'gom nhóm, khử trùng lặp, ghi state',
  tableNote: 'một bảng · GSI1 · TTL',
  statusNote: 'chỉ đọc, không cần đăng nhập',
  boardNote: 'S3 static website',
  notBuilt: 'chưa xây',
  query: 'Query',
};

const flowEn: FlowLabels = {
  caption: 'The path of one alert, as the code stands today. Dashed boxes are designed but not built.',
  ingestNote: 'check key · normalize · enqueue · 202',
  queueNote: 'MessageGroupId + DedupeId · DLQ after 3',
  processorNote: 'group, deduplicate, write state',
  tableNote: 'single table · GSI1 · TTL',
  statusNote: 'read-only, no login',
  boardNote: 'S3 static website',
  notBuilt: 'not built',
  query: 'Query',
};

const layout = `
bin/, lib/          CDK app and constructs
cmd/<fn>/           Lambda handlers (Go)
internal/domain/    the core — never imports an AWS SDK (D10)
internal/ports/     the interfaces the core depends on
internal/adapter/   one adapter per port
web/                the status board (Vite + React + TS)
docs/               this site (Vite + React + TS + Tailwind)
tools/mock-telegram Telegram Bot API test double
tools/seed/         plausible rollups and incidents, until the processor writes real ones
fixtures/           the roster the ical container serves
test/e2e/payloads/  Alertmanager bodies used by make smoke / make fire
`;

export const architecture: Translated<DocPage> = {
  vi: {
    title: 'Kiến trúc',
    lede: 'Một domain core thuần Go không biết gì về AWS, bao quanh bởi các adapter mỏng. Đó là quyết định D10, và nó chi phối gần như mọi thứ còn lại.',
    sections: [
      {
        id: 'path',
        heading: 'Đường đi của một alert',
        body: (
          <>
            <FlowDiagram l={flowVi} />
            <Callout tone="note" title="ingest không bao giờ chạm vào DynamoDB">
              <p>
                Việc của nó chỉ là ghi vào SQS rồi trả <code>202</code>. Một database chậm hoặc
                hỏng vì thế không thể làm mất alert — đó là yêu cầu FR-1.5, và nó là lý do
                <code>ingest</code> không hề được cấp quyền đọc ghi bảng.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'core',
        heading: 'Domain core và các port',
        body: (
          <>
            <p className="text-soft">
              <code>internal/domain</code> tuyệt đối không import AWS SDK. Điều này không phải
              sạch sẽ cho vui: nó là điều kiện để toàn bộ logic nghiệp vụ chạy được trên RKE2
              y hệt như trên Lambda, và để test được bằng hàm thuần không cần container nào.
            </p>
            <p className="text-soft">
              Mọi thứ core cần từ thế giới bên ngoài đều đi qua một interface trong{' '}
              <code>internal/ports</code>. Ví dụ, cả đường ghi alert chỉ là:
            </p>
            <CodeBlock title="internal/ports/ports.go">{`
// AlertSink accepts a normalized batch and guarantees it will not be lost.
// ingest returns 202 only after this succeeds (FR-1.5).
type AlertSink interface {
	Publish(ctx context.Context, env domain.Envelope) error
}
`}</CodeBlock>
            <p className="text-soft">
              Adapter thật nằm ở <code>internal/adapter/sqsx</code>. Muốn test thì thay bằng một
              bản in-memory, không cần LocalStack.
            </p>
          </>
        ),
      },
      {
        id: 'keys',
        heading: 'Hai khoá, hai mục đích',
        body: (
          <>
            <p className="text-soft">
              <code>ParseAlertmanager</code> sinh ra hai khoá từ mỗi batch, và chúng rất dễ bị
              nhầm với nhau:
            </p>
            <DataTable
              head={['Khoá', 'Sinh ra từ', 'Dùng để']}
              rows={[
                [
                  <code>RoutingKey</code>,
                  <>integration key + <code>groupKey</code> của Alertmanager</>,
                  <>Làm <code>MessageGroupId</code> của SQS FIFO, để <code>firing</code> luôn đi trước <code>resolved</code> của cùng một chủ đề</>,
                ],
                [
                  <code>DedupeKey</code>,
                  'integration key + toàn bộ body',
                  <>Làm <code>MessageDeduplicationId</code>, để một lần gửi lại y hệt bị gộp lại (FR-1.6)</>,
                ],
              ]}
            />
            <Callout tone="warn">
              <p>
                <code>RoutingKey</code> là khoá gom nhóm <em>tạm thời</em>, không phải fingerprint
                (<em>dấu vân tay</em>) chính thức. Fingerprint thật phụ thuộc vào cấu hình
                <code>group_by</code> và được tính ở bước sau — bước đó chính là processor chưa xây.
              </p>
            </Callout>
            <p className="text-soft">
              Khi Alertmanager không gửi <code>groupKey</code>, core rơi về <code>LabelDigest</code>:
              một hash ổn định trên toàn bộ label set, sắp xếp theo key nên thứ tự map của Go
              không ảnh hưởng kết quả.
            </p>
          </>
        ),
      },
      {
        id: 'layout',
        heading: 'Bố cục repo',
        body: <CodeBlock>{layout}</CodeBlock>,
      },
    ],
  },

  en: {
    title: 'Architecture',
    lede: 'A pure Go domain core that knows nothing about AWS, wrapped in thin adapters. That is decision D10, and it governs almost everything else.',
    sections: [
      {
        id: 'path',
        heading: 'The path of an alert',
        body: (
          <>
            <FlowDiagram l={flowEn} />
            <Callout tone="note" title="ingest never touches DynamoDB">
              <p>
                Its entire job is to write to SQS and return <code>202</code>. A slow or broken
                database therefore cannot cost us an alert — that is requirement FR-1.5, and it
                is why <code>ingest</code> is never granted read or write access to the table at
                all.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'core',
        heading: 'The domain core and its ports',
        body: (
          <>
            <p className="text-soft">
              <code>internal/domain</code> never imports an AWS SDK. This is not tidiness for its
              own sake: it is the condition that lets the whole business logic run on RKE2 exactly
              as it runs on Lambda, and be tested as pure functions with no container involved.
            </p>
            <p className="text-soft">
              Everything the core needs from the outside world goes through an interface in{' '}
              <code>internal/ports</code>. The entire alert write path, for instance, is just:
            </p>
            <CodeBlock title="internal/ports/ports.go">{`
// AlertSink accepts a normalized batch and guarantees it will not be lost.
// ingest returns 202 only after this succeeds (FR-1.5).
type AlertSink interface {
	Publish(ctx context.Context, env domain.Envelope) error
}
`}</CodeBlock>
            <p className="text-soft">
              The real adapter lives in <code>internal/adapter/sqsx</code>. To test, swap an
              in-memory one in — no LocalStack required.
            </p>
          </>
        ),
      },
      {
        id: 'keys',
        heading: 'Two keys, two jobs',
        body: (
          <>
            <p className="text-soft">
              <code>ParseAlertmanager</code> derives two keys from every batch, and they are easy
              to confuse:
            </p>
            <DataTable
              head={['Key', 'Derived from', 'Used for']}
              rows={[
                [
                  <code>RoutingKey</code>,
                  <>integration key + Alertmanager&rsquo;s <code>groupKey</code></>,
                  <>The SQS FIFO <code>MessageGroupId</code>, so <code>firing</code> always stays ahead of <code>resolved</code> for one subject</>,
                ],
                [
                  <code>DedupeKey</code>,
                  'integration key + the whole body',
                  <>The <code>MessageDeduplicationId</code>, so an identical redelivery collapses (FR-1.6)</>,
                ],
              ]}
            />
            <Callout tone="warn">
              <p>
                <code>RoutingKey</code> is a <em>provisional</em> grouping key, not the
                authoritative fingerprint. The real fingerprint depends on the configured{' '}
                <code>group_by</code> and is computed downstream — in the processor, which is the
                piece that is not built yet.
              </p>
            </Callout>
            <p className="text-soft">
              When Alertmanager sends no <code>groupKey</code>, the core falls back to{' '}
              <code>LabelDigest</code>: a stable hash over the whole label set, sorted by key so
              Go&rsquo;s map ordering cannot change the result.
            </p>
          </>
        ),
      },
      {
        id: 'layout',
        heading: 'Repo layout',
        body: <CodeBlock>{layout}</CodeBlock>,
      },
    ],
  },
};
