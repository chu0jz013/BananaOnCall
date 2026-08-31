import type { DocPage, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';

const tiers = `
go test ./...   # domain core — pure functions, no AWS, no containers
npm test        # CDK template assertions (builds the Go binaries first)
make e2e        # the real path, against the running stack
make smoke      # one alert by hand, when you want to watch it
`;

const checks = (head: readonly string[]) => (
  <DataTable
    head={head}
    rows={[
      [<code>FR-1.1</code>, 'a valid webhook returns 202 with the alert count'],
      [<code>FR-1.4</code>, 'an unknown integration key is refused with 401'],
      [<code>FR-1.5</code>, 'the accepted alert is on the queue, not just in a log line'],
      [<code>FR-1.6</code>, 'an identical redelivery collapses to one message'],
      [<span className="text-soft">—</span>, 'the real Alertmanager reaches ingest within 15s'],
      [<code>FR-8.3</code>, 'the status endpoint answers with a well-formed board'],
      [<code>FR-8.3</code>, 'CORS lets any origin read it, including the Vite dev server'],
      [<span className="text-soft">—</span>, 'S3 answers an unknown key with the error document and a 404'],
    ]}
  />
);

export const testing: Translated<DocPage> = {
  vi: {
    title: 'Kiểm thử',
    lede: 'Bốn tầng, nhanh trước chậm sau. Hai tầng đầu không cần bật gì cả.',
    sections: [
      {
        id: 'tiers',
        heading: 'Bốn tầng',
        body: (
          <>
            <CodeBlock>{tiers}</CodeBlock>
            <DataTable
              head={['Tầng', 'Cần gì', 'Kiểm cái gì']}
              rows={[
                [<code>go test ./...</code>, 'không cần gì', 'Hàm thuần trong domain: parse, fingerprint, SLI, error budget'],
                [<code>npm test</code>, 'không cần gì', 'Assertion trên template CDK đã synth (Jest + swc)'],
                [<code>make e2e</code>, <>đã <code>up</code> và <code>deploy</code></>, 'Đường đi thật, qua HTTP, qua queue, qua Lambda thật'],
                [<code>make smoke</code>, <>đã <code>up</code> và <code>deploy</code></>, 'Một alert, bằng tay, khi bạn muốn tận mắt nhìn'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'nonce',
        heading: 'Vì sao mỗi payload mang một nonce',
        body: (
          <>
            <p className="text-soft">
              <code>make e2e</code> chạy đi chạy lại liên tiếp vẫn đúng. Mỗi payload nó gửi đều
              mang một nonce riêng cho từng lần chạy, vì nếu không thì có hai thứ sẽ khiến một
              lần chạy lại <em>trông giống</em> lỗi sản phẩm:
            </p>
            <ol className="ml-5 list-decimal space-y-2 text-sm text-soft">
              <li>
                Khử trùng lặp của SQS FIFO kéo dài <strong>năm phút tính từ lúc gửi</strong>, chứ
                không phải từ lúc tiêu thụ. Chạy lại trong cửa sổ đó thì alert bị bỏ lặng lẽ.
              </li>
              <li>
                Alertmanager ngồi im theo <code>repeat_interval</code> với một alert group mà nó
                đã thông báo rồi.
              </li>
            </ol>
            <Callout tone="warn">
              <p>
                Cả hai đều là hành vi đúng của công cụ. Không có nonce, bạn sẽ đi tìm bug trong
                code của mình ở chỗ không hề có bug.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'checks',
        heading: 'E2E kiểm những gì',
        body: (
          <>
            <p className="text-soft">
              Mỗi check gọi tên đúng requirement nó phục vụ:
            </p>
            {checks(['Requirement', 'Check'])}
          </>
        ),
      },
      {
        id: 'gaps',
        heading: 'Hai thứ cố tình không kiểm',
        body: (
          <>
            <p className="text-soft">
              Bộ test tự nói ra điều này khi chạy. Cả hai đều là check chỉ làm được trên AWS thật:
            </p>
            <DataTable
              head={['Requirement', 'Vì sao không kiểm được ở local']}
              rows={[
                [<code>FR-3.7</code>, 'Escalation sống sót qua restart — cần Step Functions có persistence thật'],
                [<code>FR-8.1</code>, 'Metric EMF — LocalStack chạy metric filter nhưng không trích xuất EMF'],
              ]}
            />
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Testing',
    lede: 'Four tiers, fastest first. The first two need nothing running.',
    sections: [
      {
        id: 'tiers',
        heading: 'The four tiers',
        body: (
          <>
            <CodeBlock>{tiers}</CodeBlock>
            <DataTable
              head={['Tier', 'Needs', 'What it checks']}
              rows={[
                [<code>go test ./...</code>, 'nothing', 'Pure functions in the domain: parsing, fingerprinting, SLIs, error budget'],
                [<code>npm test</code>, 'nothing', 'Assertions against the synthesized CDK template (Jest + swc)'],
                [<code>make e2e</code>, <><code>up</code> and <code>deploy</code></>, 'The real path — over HTTP, through the queue, through real Lambdas'],
                [<code>make smoke</code>, <><code>up</code> and <code>deploy</code></>, 'One alert, by hand, when you want to watch it happen'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'nonce',
        heading: 'Why every payload carries a nonce',
        body: (
          <>
            <p className="text-soft">
              <code>make e2e</code> is repeatable back to back. Every payload it sends carries a
              per-run nonce, because two things would otherwise make a re-run{' '}
              <em>look like</em> a product bug:
            </p>
            <ol className="ml-5 list-decimal space-y-2 text-sm text-soft">
              <li>
                SQS FIFO deduplication lasts <strong>five minutes from the send</strong>, not from
                the consume. A re-run inside that window has its alerts silently dropped.
              </li>
              <li>
                Alertmanager sits on <code>repeat_interval</code> for an alert group it has
                already notified about.
              </li>
            </ol>
            <Callout tone="warn">
              <p>
                Both are the tools behaving correctly. Without the nonce you go hunting for a bug
                in your own code in a place where there is no bug.
              </p>
            </Callout>
          </>
        ),
      },
      {
        id: 'checks',
        heading: 'What the E2E suite checks',
        body: (
          <>
            <p className="text-soft">Every check names the requirement it serves:</p>
            {checks(['Requirement', 'Check'])}
          </>
        ),
      },
      {
        id: 'gaps',
        heading: 'Two things deliberately not checked',
        body: (
          <>
            <p className="text-soft">
              The suite says so itself when it runs. Both are real-AWS checks only:
            </p>
            <DataTable
              head={['Requirement', 'Why it cannot run locally']}
              rows={[
                [<code>FR-3.7</code>, 'Escalation surviving a restart — needs Step Functions with real persistence'],
                [<code>FR-8.1</code>, 'EMF metrics — LocalStack runs metric filters but does not extract EMF'],
              ]}
            />
          </>
        ),
      },
    ],
  },
};
