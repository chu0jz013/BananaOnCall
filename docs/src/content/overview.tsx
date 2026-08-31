import type { DocPage, Translated } from '../i18n/types';
import { EscalationClock } from '../components/EscalationClock';
import { StateChips } from '../components/Chips';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';
import { Hero } from '../components/Hero';

const A = ({ href, children }: { href: string; children: string }) => (
  <a href={href} className="underline decoration-banana decoration-2 underline-offset-2">
    {children}
  </a>
);

export const overview: Translated<DocPage> = {
  vi: {
    hero: (
      <Hero
        l={{
          headline: 'Không ai phải trả tiền theo đầu người chỉ để bị gọi dậy lúc 3 giờ sáng.',
          quickstart: 'Bắt đầu nhanh',
          source: 'Mã nguồn',
          stats: [
            { value: '~8 USD', label: 'mỗi tháng, ở prod' },
            { value: '99,9%', label: 'mục tiêu SLO' },
            { value: '35s', label: 'dựng xong stack local' },
          ],
        }}
      />
    ),
    title: 'Tổng quan',
    lede: 'BananaOnCall nhận alert từ Alertmanager, gom nhóm và khử trùng lặp, tìm đúng người đang trực trên Google Calendar, bắn Telegram kèm nút Ack — và tự leo thang khi không ai trả lời.',
    sections: [
      {
        id: 'loop',
        heading: 'Vòng lặp',
        body: (
          <>
            <p className="text-soft">
              Toàn bộ sản phẩm là một vòng lặp khép kín. Alert đi vào bằng webhook, đi ra bằng
              một tin nhắn Telegram có nút bấm, và chỉ dừng khi có người thật sự xác nhận.
            </p>
            <EscalationClock
              caption="Escalation clock · ep-critical"
              hint="ack bất kỳ lúc nào → dừng"
              beats={[
                { at: 'T+0s', title: 'Primary', detail: 'Telegram DM tới người đang trực' },
                { at: 'T+5m', title: 'Secondary', detail: 'Chưa ack → người trực dự phòng' },
                { at: 'T+10m', title: 'War room', detail: 'Cả team trong group chat' },
                { at: 'Lặp lại', title: 'Mỗi 10m', detail: 'Tối đa 50 lần rồi báo admin', accent: true },
              ]}
            />
            <p className="text-soft">Một alert group đi qua bốn trạng thái:</p>
            <StateChips />
          </>
        ),
      },
      {
        id: 'why',
        heading: 'Tại sao không dùng đồ có sẵn',
        body: (
          <>
            <p className="text-soft">
              Câu hỏi này có một câu trả lời rất cụ thể.{' '}
              <strong>Grafana OnCall OSS đã bị đóng băng.</strong> Dự án vào chế độ maintenance
              từ 11-03-2025, và repository bị archive (chuyển sang chỉ đọc) ngày 24-03-2026.
              Cùng ngày đó, Cloud Connection — thứ mang SMS, cuộc gọi và push notification cho
              bản OSS — cũng bị khai tử. Phát triển chuyển hẳn sang Grafana Cloud IRM, tức là
              sang dịch vụ trả tiền.
            </p>
            <p className="text-soft">
              Ngoài chuyện đó ra, ba ràng buộc còn lại của chúng ta cũng không khớp với sản phẩm
              đóng gói nào:
            </p>
            <DataTable
              head={['Chúng ta cần', 'Đồ có sẵn', 'BananaOnCall']}
              rows={[
                [
                  'Chi phí đoán trước được, không tính theo đầu người',
                  'PagerDuty ~105–210 USD/tháng cho 5 người; Grafana Cloud IRM ~100 USD',
                  <strong>~8 USD/tháng, tăng theo lượng alert chứ không theo số người</strong>,
                ],
                [
                  'Kênh mà team đã ở sẵn',
                  'Grafana OnCall OSS archive 24-03-2026; SMS, cuộc gọi và push chết cùng Cloud Connection',
                  <strong>Bot Telegram với nút Ack ngay trong tin nhắn</strong>,
                ],
                [
                  'Lịch trực đã có, ai cũng sửa được',
                  'Một UI xếp ca mới phải học và phải duy trì',
                  <strong>Google Calendar qua secret iCal URL, poll 5 phút</strong>,
                ],
              ]}
            />
          </>
        ),
      },
      {
        id: 'status',
        heading: 'Đang xây tới đâu',
        body: (
          <>
            <Callout tone="warn" title="Hai trên bảy Lambda đã tồn tại">
              <p>
                Thiết kế gọi tên bảy Lambda. Hiện tại repo mới có <code>cmd/ingest</code> và{' '}
                <code>cmd/status</code>. Phần còn lại — processor, notifier, escalator,
                schedule-sync, ack handler — đã được thiết kế nhưng chưa viết.
              </p>
            </Callout>
            <DataTable
              head={['Thành phần', 'Trạng thái']}
              rows={[
                [<code>cmd/ingest</code>, <>Đã xong — nhận webhook, kiểm tra key, chuẩn hoá, đẩy vào SQS, trả 202</>],
                [<code>cmd/status</code>, <>Đã xong — phục vụ status board công khai</>],
                [<>Domain core <code>internal/domain</code></>, <>Đã xong — parse, fingerprint, SLI, error budget, đủ unit test</>],
                [<>Hạ tầng <code>lib/</code></>, <>Đã xong — CDK: bảng, queue, API, bucket</>],
                [<>Status board <code>web/</code></>, <>Đã xong — Vite + React, deploy lên S3</>],
                ['processor · notifier · escalator', <span className="text-soft">Chưa xây</span>],
                ['schedule-sync · ack handler', <span className="text-soft">Chưa xây</span>],
              ]}
            />
            <p className="text-soft">
              Bản thiết kế gốc vẫn được giữ nguyên để đối chiếu:{' '}
              <A href="/design-doc-v0.1.html">Design doc v0.1</A>. Bốn chỗ mà bản build đã đi
              chệch khỏi thiết kế được liệt kê đầy đủ ở trang Quyết định.
            </p>
          </>
        ),
      },
    ],
  },

  en: {
    hero: (
      <Hero
        l={{
          headline: 'Nobody should pay per seat to get woken up at 3am.',
          quickstart: 'Quickstart',
          source: 'Source',
          stats: [
            { value: '~8 USD', label: 'per month, in prod' },
            { value: '99.9%', label: 'SLO target' },
            { value: '35s', label: 'to a local stack' },
          ],
        }}
      />
    ),
    title: 'Overview',
    lede: 'BananaOnCall takes alerts from Alertmanager, groups and deduplicates them, finds whoever is on call from Google Calendar, sends a Telegram message with an Ack button — and escalates when nobody answers.',
    sections: [
      {
        id: 'loop',
        heading: 'The loop',
        body: (
          <>
            <p className="text-soft">
              The whole product is one closed loop. An alert comes in over a webhook, goes out as
              a Telegram message with a button, and stops only when a human actually acknowledges
              it.
            </p>
            <EscalationClock
              caption="Escalation clock · ep-critical"
              hint="ack at any point → it stops"
              beats={[
                { at: 'T+0s', title: 'Primary', detail: 'Telegram DM to whoever is on call' },
                { at: 'T+5m', title: 'Secondary', detail: 'No ack → the backup on-call' },
                { at: 'T+10m', title: 'War room', detail: 'The whole team, in the group chat' },
                { at: 'Repeat', title: 'Every 10m', detail: 'Up to 50 times, then tell an admin', accent: true },
              ]}
            />
            <p className="text-soft">An alert group moves through four states:</p>
            <StateChips />
          </>
        ),
      },
      {
        id: 'why',
        heading: 'Why not something off the shelf',
        body: (
          <>
            <p className="text-soft">
              This one has a very specific answer.{' '}
              <strong>Grafana OnCall OSS is frozen.</strong> The project entered maintenance mode
              on 11 March 2025, and the repository was archived — made read-only — on 24 March
              2026. The same day, Cloud Connection, which carried SMS, phone calls and push
              notifications for the OSS build, was deprecated with it. Development moved to
              Grafana Cloud IRM, which is to say, to a paid service.
            </p>
            <p className="text-soft">
              Beyond that, our other three constraints do not match any packaged product either:
            </p>
            <DataTable
              head={['What we need', 'Off the shelf', 'BananaOnCall']}
              rows={[
                [
                  'Predictable cost, not per seat',
                  'PagerDuty ~105–210 USD/month for 5; Grafana Cloud IRM ~100 USD',
                  <strong>~8 USD/month, growing with alert volume rather than headcount</strong>,
                ],
                [
                  'The channel the team is already in',
                  'Grafana OnCall OSS archived 24 Mar 2026; SMS, phone and push died with Cloud Connection',
                  <strong>A Telegram bot with an Ack button right in the message</strong>,
                ],
                [
                  'The roster we already keep',
                  'A new shift-planning UI to learn and maintain',
                  <strong>Google Calendar over a secret iCal URL, polled every 5 minutes</strong>,
                ],
              ]}
            />
          </>
        ),
      },
      {
        id: 'status',
        heading: 'How far along this is',
        body: (
          <>
            <Callout tone="warn" title="Two of seven Lambdas exist">
              <p>
                The design names seven Lambdas. Today the repo has <code>cmd/ingest</code> and{' '}
                <code>cmd/status</code>. The rest — processor, notifier, escalator,
                schedule-sync, ack handler — are designed but not written.
              </p>
            </Callout>
            <DataTable
              head={['Component', 'State']}
              rows={[
                [<code>cmd/ingest</code>, <>Done — takes the webhook, checks the key, normalizes, enqueues, returns 202</>],
                [<code>cmd/status</code>, <>Done — serves the public status board</>],
                [<>Domain core <code>internal/domain</code></>, <>Done — parsing, fingerprinting, SLIs, error budget, with unit tests</>],
                [<>Infrastructure <code>lib/</code></>, <>Done — CDK: table, queue, API, bucket</>],
                [<>Status board <code>web/</code></>, <>Done — Vite + React, deployed to S3</>],
                ['processor · notifier · escalator', <span className="text-soft">Not built</span>],
                ['schedule-sync · ack handler', <span className="text-soft">Not built</span>],
              ]}
            />
            <p className="text-soft">
              The original proposal is kept verbatim for comparison:{' '}
              <A href="/design-doc-v0.1.html">Design doc v0.1</A>. The four places the build
              deviated from it are listed in full on the Decisions page.
            </p>
          </>
        ),
      },
    ],
  },
};
