import type { DocPage, Translated } from '../i18n/types';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';

const A = ({ href, children }: { href: string; children: string }) => (
  <a href={href} className="underline decoration-banana decoration-2 underline-offset-2">
    {children}
  </a>
);

const Sev = ({ level, tone }: { level: string; tone: 'crit' | 'high' | 'med' }) => {
  const cls =
    tone === 'crit'
      ? 'bg-fire text-paper'
      : tone === 'high'
        ? 'border border-fire text-fire'
        : 'border border-line text-soft';
  return <span className={`px-2 py-1 font-mono text-[.625rem] ${cls}`}>{level}</span>;
};

const cost = (head: readonly string[], total: string) => (
  <DataTable
    head={head}
    rows={[
      ['Lambda', <code>0.30</code>],
      ['API Gateway', <code>0.15</code>],
      ['DynamoDB on-demand', <code>0.50</code>],
      ['SQS FIFO', <code>0.00</code>],
      ['Step Functions', <code>1.03</code>],
      ['EventBridge', <code>0.05</code>],
      ['CloudWatch Logs', <code>1.20</code>],
      [<>CloudWatch Metrics <span className="text-soft">— the biggest line, and a surprise</span></>, <code>4.50</code>],
      ['Route 53', <code>0.50</code>],
      [<strong>{total}</strong>, <strong><code>8.25</code></strong>],
    ]}
  />
);

export const decisions: Translated<DocPage> = {
  vi: {
    title: 'Quyết định & lộ trình',
    lede: 'Mười quyết định sinh ra toàn bộ thiết kế, bốn chỗ bản build buộc phải đi chệch khỏi chúng, và những gì còn ở phía trước.',
    sections: [
      {
        id: 'ten',
        heading: 'Mười quyết định',
        body: (
          <DataTable
            head={['#', 'Quyết định', 'Lý do']}
            rows={[
              [<code>D1</code>, 'Step Functions Standard cho escalation', 'Wait state và retry có sẵn, xem được từng execution dạng đồ thị. Đắt hơn cron sweeper ~1 USD/tháng.'],
              [<code>D2</code>, 'API Gateway HTTP API', 'Rẻ hơn REST API bốn lần, vẫn có throttle và custom domain.'],
              [<code>D3</code>, 'DynamoDB single-table, on-demand', 'Không tốn gì lúc rảnh. TTL miễn phí lo việc dọn dữ liệu.'],
              [<code>D4</code>, 'SQS FIFO, MessageGroupId = fingerprint', <>Giữ đúng thứ tự <code>firing → resolved</code> cho cùng một alert.</>],
              [<code>D5</code>, 'Config bằng YAML trong Git, không làm UI', 'Review qua PR, rollback bằng git revert. Cắt được nhiều effort nhất khỏi MVP.'],
              [<code>D6</code>, 'Cognito + Google cho người, token cho webhook', 'Không phải viết dòng auth nào, miễn phí dưới 50k MAU.'],
              [<code>D7</code>, 'Google Calendar qua secret iCal URL', 'Read-only, poll 5 phút, không cần OAuth flow.'],
              [<code>D8</code>, 'Telegram trước, iOS sau', 'Nút Ack ngay trong tin nhắn, miễn phí. iOS tốn 99 USD/năm và có rủi ro Apple từ chối entitlement.'],
              [<code>D9</code>, 'SLA board trên Grafana on-prem sẵn có', 'CloudWatch EMF → CloudWatch datasource → Grafana. Không tốn thêm đồng nào.'],
              [<code>D10</code>, 'Hexagonal Go — chạy được cả Lambda lẫn RKE2', 'Core không import AWS SDK. ~150 dòng thêm, đổi lấy việc không bị khoá vào AWS.'],
            ]}
          />
        ),
      },
      {
        id: 'deviations',
        heading: 'Chỗ thiết kế và code khác nhau',
        body: (
          <>
            <p className="text-soft">
              Bốn quyết định buộc phải đổi để giữ cho toàn bộ vòng lặp test được ở local. Mỗi
              thay đổi đều được kiểm chứng trên chính source của LocalStack ở tag{' '}
              <code>v4.14.0</code>, không phải trên tài liệu của nó.
            </p>
            <DataTable
              head={['Thiết kế', 'Thực tế', 'Chúng ta làm gì']}
              rows={[
                [<><code>D2</code> API Gateway HTTP API</>, <><code>apigatewayv2</code> không có trong Community</>, 'REST API v1. Đắt thêm ~0,40 USD/tháng; vẫn giữ custom domain và throttle, thêm usage plan.'],
                [<><code>D6</code> Cognito</>, <><code>cognito-idp</code> không có trong Community</>, 'Integration key nằm trong path; Lambda request authorizer cho CLI. Cognito quay lại ở Phase 2, chỉ cho prod.'],
                ['EventBridge Scheduler', 'Provider là một shim của moto — lưu schedule và không bao giờ bắn', <>EventBridge <strong>Rules</strong> với <code>rate()</code>, thứ LocalStack thật sự có chạy — và tốn 0 USD thay vì 0,05.</>],
                [<><code>G8</code> Terraform</>, '—', 'CDK TypeScript, đã bootstrap sẵn. Handler vẫn là Go theo D10.'],
              ]}
            />
            <Callout tone="note">
              <p>
                CloudWatch EMF cũng không được tự động trích xuất thành metric ở local; chỉ có
                metric filter khai báo tường minh là chạy.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'slo',
        heading: '99,9% nghĩa là gì',
        body: (
          <>
            <p className="text-soft">
              Mục tiêu là <strong>99,9%</strong> — tức khoảng <strong>43 phút 49 giây</strong>{' '}
              ngân sách lỗi mỗi tháng dương lịch. Status board đo trên cửa sổ trượt 28 ngày, nên
              con số ở đó nhỏ hơn.
            </p>
            <p className="text-soft">
              Ngân sách lỗi được kẹp lại: một SLI vi phạm nặng sẽ hiện &ldquo;còn 0&rdquo; chứ
              không hiện số âm. Và headline của board đọc từ những gì đang xảy ra{' '}
              <em>ngay lúc này</em>, không phải từ trung bình 28 ngày — một trang báo
              &ldquo;operational&rdquo; trong khi có alert critical chưa ai ack chính là kiểu hỏng
              mà cả thiết kế này sinh ra để ngăn.
            </p>
          </>
        ),
      },
      {
        id: 'cost',
        heading: 'Khoảng 8 USD một tháng',
        body: (
          <>
            <p className="text-soft">
              Giả định 3.000 alert, 10.000 tin nhắn, 150.000 request, 5 người, một region
              Singapore. Cần verify lại trên AWS Pricing Calculator trước khi chốt ngân sách.
            </p>
            {cost(['Dịch vụ', 'USD/tháng'], 'Tổng')}
            <p className="text-soft">
              Muốn rẻ hơn nữa: remote-write metric thẳng vào Prometheus on-prem thay vì dùng
              CloudWatch custom metric — tiết kiệm 4,50 USD, tức hơn một nửa hoá đơn.
            </p>
            <p className="text-soft">
              Để so sánh: PagerDuty 5 người khoảng 105–210 USD/tháng, Grafana Cloud IRM khoảng
              100 USD. Và chi phí ở đây tăng theo lượng alert chứ không theo số người.
            </p>
          </>
        ),
      },
      {
        id: 'risks',
        heading: 'Cái gì có thể hỏng',
        body: (
          <DataTable
            head={['Mức', 'Rủi ro', 'Cách xử lý']}
            rows={[
              [<Sev level="CRITICAL" tone="crit" />, 'BananaOnCall chết mà không ai biết', 'Dead-man switch bắt buộc ở Phase 2. Canary chạy trên RKE2 — hạ tầng độc lập hoàn toàn — ping mỗi phút, im quá 3 phút thì một bot Telegram thứ hai báo thẳng.'],
              [<Sev level="HIGH" tone="high" />, 'Scope creep', 'Danh sách không-làm là hợp đồng. Mọi thứ ngoài đó đẩy sang Phase 2 trở đi.'],
              [<Sev level="HIGH" tone="high" />, 'Telegram bị chặn hoặc API sập', 'Provider interface đã trừu tượng sẵn. Phase 2 thêm email qua SES làm kênh dự phòng.'],
              [<Sev level="HIGH" tone="high" />, 'AWS region outage', 'Chấp nhận ở MVP, ghi rõ trong SLA. Phase 4 làm region thứ hai.'],
              [<Sev level="MEDIUM" tone="med" />, 'Sync Google Calendar lỗi', 'Không xoá shift cũ khi fetch thất bại. Có default target. Fail ba lần liên tiếp thì báo admin.'],
              [<Sev level="MEDIUM" tone="med" />, 'Alert storm nghìn alert một phút', 'SQS làm bộ đệm, Lambda reserved concurrency, grouping cắt phần lớn.'],
            ]}
          />
        ),
      },
      {
        id: 'roadmap',
        heading: 'Bốn giai đoạn',
        body: (
          <>
            <DataTable
              head={['Giai đoạn', 'Nội dung', 'Ước lượng']}
              rows={[
                [<code>PHASE 0</code>, 'Nền móng — repo, CI, domain thuần với unit test đầy đủ, adapter in-memory', '3–4 ngày'],
                [<code>PHASE 1</code>, 'MVP — DynamoDB, ingest, processor, dedupe, Step Functions, notifier, Telegram, ack, sync lịch', '2–3 tuần'],
                [<code>PHASE 2</code>, 'SLA và vận hành — metric, rollup, Grafana board, dead-man switch, silence, Cognito', '1–2 tuần'],
                [<code>PHASE 3</code>, 'iOS — chỉ khi Telegram không đủ. SwiftUI, APNs, TestFlight', '2–3 tuần'],
                [<code>PHASE 4</code>, 'Scale — region thứ hai, thêm kênh Slack và email, multi-tenant', '—'],
              ]}
            />
            <p className="text-soft">
              Toàn bộ lập luận gốc, gồm cả bảy tiêu chí nghiệm thu của Phase 1 và mười câu hỏi
              chặn, nằm trong <A href="/design-doc-v0.1.html">Design doc v0.1</A>.
            </p>
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Decisions & roadmap',
    lede: 'The ten decisions the whole design falls out of, the four places the build was forced to deviate from them, and what is still ahead.',
    sections: [
      {
        id: 'ten',
        heading: 'The ten decisions',
        body: (
          <DataTable
            head={['#', 'Decision', 'Reasoning']}
            rows={[
              [<code>D1</code>, 'Step Functions Standard for escalation', 'Wait states and retries come free, and every execution is inspectable as a graph. About 1 USD/month more than a cron sweeper.'],
              [<code>D2</code>, 'API Gateway HTTP API', 'Four times cheaper than REST API, still has throttling and custom domains.'],
              [<code>D3</code>, 'DynamoDB single-table, on-demand', 'Nothing to pay while idle. TTL handles cleanup for free.'],
              [<code>D4</code>, 'SQS FIFO, MessageGroupId = fingerprint', <>Keeps <code>firing → resolved</code> in order for one alert.</>],
              [<code>D5</code>, 'Config as YAML in Git, no UI', 'Reviewed as a PR, rolled back with git revert. The single biggest effort cut from the MVP.'],
              [<code>D6</code>, 'Cognito + Google for humans, tokens for webhooks', 'No auth code to write, free under 50k MAU.'],
              [<code>D7</code>, 'Google Calendar via a secret iCal URL', 'Read-only, polled every 5 minutes, no OAuth flow.'],
              [<code>D8</code>, 'Telegram first, iOS later', 'An Ack button right in the message, for free. iOS costs 99 USD/year and risks Apple refusing the entitlement.'],
              [<code>D9</code>, 'The SLA board on the existing on-prem Grafana', 'CloudWatch EMF → CloudWatch datasource → Grafana. Costs nothing extra.'],
              [<code>D10</code>, 'Hexagonal Go — runs on Lambda and on RKE2', 'The core imports no AWS SDK. ~150 extra lines, in exchange for not being locked into AWS.'],
            ]}
          />
        ),
      },
      {
        id: 'deviations',
        heading: 'Where the design and the code differ',
        body: (
          <>
            <p className="text-soft">
              Four decisions had to change to keep the whole loop testable locally. Each was
              verified against LocalStack&rsquo;s own source at tag <code>v4.14.0</code>, not
              against its documentation.
            </p>
            <DataTable
              head={['Design', 'Reality', 'What we do']}
              rows={[
                [<><code>D2</code> API Gateway HTTP API</>, <><code>apigatewayv2</code> is not in Community</>, 'REST API v1. About +0.40 USD/month at our volume; keeps custom domain and throttling, adds usage plans.'],
                [<><code>D6</code> Cognito</>, <><code>cognito-idp</code> is not in Community</>, 'Integration key in the path now; a Lambda request authorizer for the CLI. Cognito returns as a prod-only Phase 2 swap.'],
                ['EventBridge Scheduler', 'The provider is a moto shim that stores schedules and never fires them', <>EventBridge <strong>Rules</strong> with <code>rate()</code>, which LocalStack really does execute — and which cost 0 USD instead of 0.05.</>],
                [<><code>G8</code> Terraform</>, '—', 'CDK TypeScript, already bootstrapped. Handlers stay Go per D10.'],
              ]}
            />
            <Callout tone="note">
              <p>
                CloudWatch EMF is also not auto-extracted into metrics locally; only explicit
                metric filters run.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'slo',
        heading: 'What 99.9% means',
        body: (
          <>
            <p className="text-soft">
              The target is <strong>99.9%</strong> — about <strong>43 minutes 49 seconds</strong>{' '}
              of error budget per calendar month. The status board measures over a rolling 28-day
              window, so its numbers come out smaller.
            </p>
            <p className="text-soft">
              The error budget is clamped: a badly breached SLI reads &ldquo;0 left&rdquo; rather
              than going negative. And the board&rsquo;s headline is read from what is happening{' '}
              <em>right now</em>, not from the 28-day averages — a page that says
              &ldquo;operational&rdquo; while a critical alert sits unacknowledged is precisely
              the failure this whole design exists to prevent.
            </p>
          </>
        ),
      },
      {
        id: 'cost',
        heading: 'About 8 USD a month',
        body: (
          <>
            <p className="text-soft">
              Assuming 3,000 alerts, 10,000 messages, 150,000 requests, 5 people, one Singapore
              region. Worth re-checking on the AWS Pricing Calculator before committing a budget.
            </p>
            {cost(['Service', 'USD/month'], 'Total')}
            <p className="text-soft">
              To go cheaper still: remote-write metrics straight into the on-prem Prometheus
              instead of using CloudWatch custom metrics — that saves 4.50 USD, more than half
              the bill.
            </p>
            <p className="text-soft">
              For comparison: PagerDuty for 5 people is roughly 105–210 USD/month, Grafana Cloud
              IRM about 100 USD. And this bill grows with alert volume, not with headcount.
            </p>
          </>
        ),
      },
      {
        id: 'risks',
        heading: 'What could break',
        body: (
          <DataTable
            head={['Level', 'Risk', 'How it is handled']}
            rows={[
              [<Sev level="CRITICAL" tone="crit" />, 'BananaOnCall dies and nobody notices', 'A dead-man switch is mandatory in Phase 2. A canary on RKE2 — entirely independent infrastructure — pings every minute, and after 3 minutes of silence a second Telegram bot reports it directly.'],
              [<Sev level="HIGH" tone="high" />, 'Scope creep', 'The not-doing list is a contract. Everything outside it moves to Phase 2 or later.'],
              [<Sev level="HIGH" tone="high" />, 'Telegram gets blocked or its API goes down', 'The provider interface is already abstracted. Phase 2 adds email via SES as a fallback channel.'],
              [<Sev level="HIGH" tone="high" />, 'An AWS region outage', 'Accepted for the MVP and stated in the SLA. Phase 4 adds a second region.'],
              [<Sev level="MEDIUM" tone="med" />, 'Google Calendar sync fails', 'Old shifts are not deleted when a fetch fails. There is a default target. Three consecutive failures notify an admin.'],
              [<Sev level="MEDIUM" tone="med" />, 'An alert storm of a thousand alerts a minute', 'SQS absorbs it, Lambda reserved concurrency caps it, and grouping cuts most of it.'],
            ]}
          />
        ),
      },
      {
        id: 'roadmap',
        heading: 'Four phases',
        body: (
          <>
            <DataTable
              head={['Phase', 'Contents', 'Estimate']}
              rows={[
                [<code>PHASE 0</code>, 'Foundations — repo, CI, a pure domain with full unit tests, in-memory adapters', '3–4 days'],
                [<code>PHASE 1</code>, 'MVP — DynamoDB, ingest, processor, dedupe, Step Functions, notifier, Telegram, ack, calendar sync', '2–3 weeks'],
                [<code>PHASE 2</code>, 'SLA and operations — metrics, rollups, Grafana boards, dead-man switch, silences, Cognito', '1–2 weeks'],
                [<code>PHASE 3</code>, 'iOS — only if Telegram proves insufficient. SwiftUI, APNs, TestFlight', '2–3 weeks'],
                [<code>PHASE 4</code>, 'Scale — a second region, Slack and email channels, multi-tenancy', '—'],
              ]}
            />
            <p className="text-soft">
              The full original reasoning, including Phase 1&rsquo;s seven acceptance criteria and
              the ten blocking questions, is in the{' '}
              <A href="/design-doc-v0.1.html">Design doc v0.1</A>.
            </p>
          </>
        ),
      },
    ],
  },
};
