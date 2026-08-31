import type { DocPage, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';

const L = ({ href, children }: { href: string; children: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="underline decoration-banana decoration-2 underline-offset-2"
  >
    {children}
  </a>
);

const services = (standsFor: string) => (
  <DataTable
    head={['Service', 'Port', standsFor]}
    rows={[
      [<code>localstack</code>, <code>4566</code>, 'AWS'],
      [
        <code>mock-telegram</code>,
        <code>8081</code>,
        <>api.telegram.org — <L href="http://localhost:8081">open it</L> to press Ack</>,
      ],
      [<code>ical</code>, <code>8082</code>, 'the secret Google Calendar iCal URL'],
      [<code>alertmanager</code>, <code>9093</code>, 'the real Alertmanager on RKE2'],
    ]}
  />
);

export const quickstart: Translated<DocPage> = {
  vi: {
    title: 'Bắt đầu nhanh',
    lede: 'Từ số không đến một status board bấm được, offline hoàn toàn, khoảng 35 giây. Không cần tài khoản AWS, không cần bản LocalStack trả phí, không cần bot Telegram thật.',
    sections: [
      {
        id: 'prereq',
        heading: 'Cần có sẵn',
        body: (
          <>
            <DataTable
              head={['Công cụ', 'Ghi chú']}
              rows={[
                ['Docker + Docker Compose', 'LocalStack chạy Lambda bằng container trên chính Docker daemon của máy'],
                [<>Go <code>1.27</code></>, <>theo <code>go.mod</code>; build binary Lambda cho <code>linux/arm64</code></>],
                ['Node.js + npm', 'CDK CLI và frontend'],
                ['AWS CLI', <>cùng một profile tên <code>localstack</code></>],
              ]}
            />
            <p className="text-soft">
              Makefile luôn gọi AWS CLI với <code>AWS_PROFILE=localstack</code>, nên profile đó
              phải trỏ về endpoint của LocalStack:
            </p>
            <CodeBlock title="~/.aws/config">{`
[profile localstack]
region = us-east-1
endpoint_url = http://localhost:4566
`}</CodeBlock>
            <CodeBlock title="~/.aws/credentials">{`
[localstack]
aws_access_key_id = test
aws_secret_access_key = test
`}</CodeBlock>
            <p className="text-soft">
              LocalStack không kiểm tra credential, nhưng SDK vẫn đòi phải có.
            </p>
          </>
        ),
      },
      {
        id: 'run',
        heading: 'Chạy',
        body: (
          <>
            <CodeBlock>{`
make all       # từ số không đến một board xem được, ~35s
make open      # mở nó ra
`}</CodeBlock>
            <p className="text-soft">
              <code>make all</code> chính là năm bước này nối lại. Chạy riêng từng bước khi bạn
              chỉ cần một trong số đó:
            </p>
            <DataTable
              head={['Bước', 'Làm gì']}
              rows={[
                [<code>up</code>, 'Build binary Go rồi bật bốn container'],
                [<code>bootstrap</code>, 'CDK-bootstrap tài khoản LocalStack (chạy lại được)'],
                [<code>deploy</code>, 'Deploy stack, rồi vá lại stage nếu LocalStack làm mất'],
                [<code>seed</code>, 'Đổ SLA rollup và lịch sử sự cố vào bảng'],
                [<code>web-deploy</code>, 'Build status board và sync lên bucket S3'],
              ]}
            />
            <p className="text-soft">
              <code>make help</code> liệt kê toàn bộ target.
            </p>
          </>
        ),
      },
      {
        id: 'running',
        heading: 'Cái gì đang chạy',
        body: (
          <>
            {services('Đóng vai')}
            <p className="text-soft">
              Bản thân status board do S3 của LocalStack phục vụ, không phải một container:
            </p>
            <CodeBlock>{`
http://bananaoncall-status-local.s3-website.localhost.localstack.cloud:4566
`}</CodeBlock>
            <Callout tone="danger" title="LocalStack Community không lưu state">
              <p>
                Mỗi lần khởi động lại là mất sạch tài khoản. Đường về trạng thái chạy được luôn
                là <code>make up &amp;&amp; make deploy</code>. Đừng trông chờ vào volume.
              </p>
            </Callout>
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Quickstart',
    lede: 'From nothing to a status board you can click, entirely offline, in about 35 seconds. No AWS account, no paid LocalStack plan, no real Telegram bot.',
    sections: [
      {
        id: 'prereq',
        heading: 'What you need first',
        body: (
          <>
            <DataTable
              head={['Tool', 'Note']}
              rows={[
                ['Docker + Docker Compose', 'LocalStack runs Lambdas as containers on your own Docker daemon'],
                [<>Go <code>1.27</code></>, <>per <code>go.mod</code>; builds the Lambda binaries for <code>linux/arm64</code></>],
                ['Node.js + npm', 'the CDK CLI and the frontend'],
                ['AWS CLI', <>with a profile named <code>localstack</code></>],
              ]}
            />
            <p className="text-soft">
              The Makefile always calls the AWS CLI with <code>AWS_PROFILE=localstack</code>, so
              that profile has to point at the LocalStack endpoint:
            </p>
            <CodeBlock title="~/.aws/config">{`
[profile localstack]
region = us-east-1
endpoint_url = http://localhost:4566
`}</CodeBlock>
            <CodeBlock title="~/.aws/credentials">{`
[localstack]
aws_access_key_id = test
aws_secret_access_key = test
`}</CodeBlock>
            <p className="text-soft">
              LocalStack does not check credentials, but the SDK still insists on finding some.
            </p>
          </>
        ),
      },
      {
        id: 'run',
        heading: 'Run it',
        body: (
          <>
            <CodeBlock>{`
make all       # from nothing to a browsable status board, ~35s
make open      # open it
`}</CodeBlock>
            <p className="text-soft">
              <code>make all</code> is those five steps chained. Run them separately when you
              only need one:
            </p>
            <DataTable
              head={['Step', 'What it does']}
              rows={[
                [<code>up</code>, 'Builds the Go binaries, then starts the four containers'],
                [<code>bootstrap</code>, 'CDK-bootstraps the LocalStack account (idempotent)'],
                [<code>deploy</code>, 'Deploys the stack, then repairs the stage if LocalStack dropped it'],
                [<code>seed</code>, 'Fills the table with SLA rollups and incident history'],
                [<code>web-deploy</code>, 'Builds the status board and syncs it to the S3 bucket'],
              ]}
            />
            <p className="text-soft">
              <code>make help</code> lists every target.
            </p>
          </>
        ),
      },
      {
        id: 'running',
        heading: 'What is running',
        body: (
          <>
            {services('Stands in for')}
            <p className="text-soft">
              The status board itself is served by LocalStack&rsquo;s S3, not by a container:
            </p>
            <CodeBlock>{`
http://bananaoncall-status-local.s3-website.localhost.localstack.cloud:4566
`}</CodeBlock>
            <Callout tone="danger" title="LocalStack Community has no state persistence">
              <p>
                Every restart wipes the account. The way back to a working stack is always{' '}
                <code>make up &amp;&amp; make deploy</code>. Do not rely on the volume.
              </p>
            </Callout>
          </>
        ),
      },
    ],
  },
};
