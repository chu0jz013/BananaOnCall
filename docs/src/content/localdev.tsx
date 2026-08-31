import type { DocPage, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';

const urls = `
host       http://localhost:4566/_aws/execute-api/bananalocal/prod/...
container  http://localstack:4566/_aws/execute-api/bananalocal/prod/...
`;

const poke = `
make smoke      # POST one alert, print what ingest answered
make fire       # make the real Alertmanager fire at us
make queue      # read what is sitting on the queue
make logs       # tail the ingest Lambda
make messages   # what mock-telegram has received
make reset      # clear mock-telegram's message log
`;

export const localdev: Translated<DocPage> = {
  vi: {
    title: 'Phát triển cục bộ',
    lede: 'Mọi thứ chạy offline trên LocalStack Community. Bốn container, một stack CDK, và vài cái bẫy đủ khó chịu để đáng được ghi lại.',
    sections: [
      {
        id: 'containers',
        heading: 'Bốn container',
        body: (
          <>
            <DataTable
              head={['Container', 'Image', 'Vì sao có nó']}
              rows={[
                [<code>localstack</code>, <code>localstack/localstack:4.14.0</code>, 'Toàn bộ AWS. Tag CalVer mới hơn là bản Pro và sẽ không chạy nếu thiếu auth token.'],
                [<code>mock-telegram</code>, <>tự build từ <code>tools/</code></>, 'Đóng vai api.telegram.org, kèm một trang để bấm Ack thật.'],
                [<code>ical</code>, <code>nginx:1.29-alpine</code>, 'Đóng vai URL iCal bí mật của Google Calendar. Cùng hợp đồng: một GET không cần xác thực trả về .ics.'],
                [<code>alertmanager</code>, <code>prom/alertmanager:v0.28.1</code>, 'Đồ thật, không phải đồ giả — tiêu chí nghiệm thu số 1 đòi chính Alertmanager phải là thứ bắn alert.'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'wiring',
        heading: 'Hai chỗ đấu dây dễ sai',
        body: (
          <>
            <p className="text-soft">
              <strong>Lambda là container anh em, không phải container con.</strong> LocalStack
              khởi động Lambda trên Docker daemon của host. Nếu không có{' '}
              <code>LAMBDA_DOCKER_NETWORK</code> trỏ đúng network của compose project này, chúng
              sẽ rơi vào bridge mặc định và không resolve nổi tên <code>mock-telegram</code> hay{' '}
              <code>ical</code>.
            </p>
            <p className="text-soft">
              <strong>REST API id được ghim.</strong> Tag <code>_custom_id_</code> của LocalStack
              cố định id thành <code>bananalocal</code>, nên URL không đổi giữa các lần deploy —
              đó là thứ giữ cho <code>deploy/alertmanager.yml</code> và Makefile không phải tra
              cứu gì. API Gateway thật bỏ qua tag này.
            </p>
            <CodeBlock>{urls}</CodeBlock>
          </>
        ),
      },
      {
        id: 'bug',
        heading: 'Một bug của LocalStack cần biết',
        body: (
          <>
            <Callout tone="danger" title="CloudFormation update lên API Gateway rất hay hỏng, và hỏng im lặng">
              <p>
                LocalStack áp dụng <em>create</em> lên API Gateway khá đáng tin. <em>Update</em>{' '}
                thì kém hơn nhiều. Đã gặp hai kiểu hỏng, cả hai đều không báo gì:
              </p>
            </Callout>
            <ol className="ml-5 list-decimal space-y-3 text-sm text-soft">
              <li>
                Khi update, CDK tạo deployment mới rồi xoá cái cũ — và LocalStack xoá luôn cả
                stage. CloudFormation vẫn báo stage <code>UPDATE_COMPLETE</code>, nhưng mọi route
                sau đó trả 404 kèm <em>&ldquo;does not correspond to a deployed API&rdquo;</em>.
                Target <code>make deploy</code> tự dựng lại stage khi thấy nó biến mất.
              </li>
              <li>
                Một integration response của CORS bị sửa nhưng không được áp dụng chút nào; giá
                trị cũ vẫn tiếp tục được phục vụ cho tới khi stack được tạo lại từ đầu.
              </li>
            </ol>
            <p className="mt-4 text-soft">
              Nếu một thay đổi trên API Gateway có vẻ không ăn, hãy{' '}
              <code>make down &amp;&amp; make all</code> thay vì ngồi debug code của chính mình.
            </p>
          </>
        ),
      },
      {
        id: 'poking',
        heading: 'Nghịch bằng tay',
        body: (
          <>
            <CodeBlock>{poke}</CodeBlock>
            <DataTable
              head={['Giao diện', 'URL']}
              rows={[
                ['mock-telegram', <code>http://localhost:8081</code>],
                ['Alertmanager', <code>http://localhost:9093</code>],
                ['lịch trực', <code>http://localhost:8082/oncall.ics</code>],
                ['LocalStack health', <code>http://localhost:4566/_localstack/health</code>],
              ]}
            />
            <p className="text-soft">
              Frontend chạy hot reload với <code>make web-dev</code>, trỏ thẳng vào API đã deploy
              trong LocalStack.
            </p>
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Local development',
    lede: 'Everything runs offline against LocalStack Community. Four containers, one CDK stack, and a few traps unpleasant enough to be worth writing down.',
    sections: [
      {
        id: 'containers',
        heading: 'Four containers',
        body: (
          <>
            <DataTable
              head={['Container', 'Image', 'Why it is there']}
              rows={[
                [<code>localstack</code>, <code>localstack/localstack:4.14.0</code>, 'All of AWS. The newer CalVer tags are the Pro build and refuse to start without an auth token.'],
                [<code>mock-telegram</code>, <>built from <code>tools/</code></>, 'Stands in for api.telegram.org, and serves a page where you can actually press Ack.'],
                [<code>ical</code>, <code>nginx:1.29-alpine</code>, 'Stands in for the secret Google Calendar iCal URL. Same contract: an unauthenticated GET returning an .ics body.'],
                [<code>alertmanager</code>, <code>prom/alertmanager:v0.28.1</code>, 'The real thing, not a fake — acceptance criterion 1 says a genuine Alertmanager must be what fires the alert.'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'wiring',
        heading: 'Two pieces of wiring that are easy to get wrong',
        body: (
          <>
            <p className="text-soft">
              <strong>Lambdas are sibling containers, not children.</strong> LocalStack starts
              them on the host Docker daemon. Without <code>LAMBDA_DOCKER_NETWORK</code> pointing
              at this compose project&rsquo;s network, they land on the default bridge and cannot
              resolve <code>mock-telegram</code> or <code>ical</code> by name.
            </p>
            <p className="text-soft">
              <strong>The REST API id is pinned.</strong> LocalStack&rsquo;s{' '}
              <code>_custom_id_</code> tag fixes the id at <code>bananalocal</code>, so URLs never
              change between deploys — which is what keeps <code>deploy/alertmanager.yml</code>{' '}
              and the Makefile from having to look anything up. Real API Gateway ignores the tag.
            </p>
            <CodeBlock>{urls}</CodeBlock>
          </>
        ),
      },
      {
        id: 'bug',
        heading: 'One LocalStack bug to know about',
        body: (
          <>
            <Callout tone="danger" title="CloudFormation updates to API Gateway often fail, and fail silently">
              <p>
                LocalStack applies <em>creates</em> to API Gateway reliably. <em>Updates</em> much
                less so. Two failures have been seen, both silent:
              </p>
            </Callout>
            <ol className="ml-5 list-decimal space-y-3 text-sm text-soft">
              <li>
                On an update, CDK creates a new deployment and deletes the superseded one — and
                LocalStack drops the stage with it. CloudFormation still reports the stage{' '}
                <code>UPDATE_COMPLETE</code>, but every route then 404s with{' '}
                <em>&ldquo;does not correspond to a deployed API&rdquo;</em>. The{' '}
                <code>make deploy</code> target re-creates the stage when it goes missing.
              </li>
              <li>
                A changed CORS integration response was not applied at all; the old value kept
                being served until the stack was recreated from scratch.
              </li>
            </ol>
            <p className="mt-4 text-soft">
              If an API Gateway change does not seem to take effect, run{' '}
              <code>make down &amp;&amp; make all</code> rather than debugging your own code.
            </p>
          </>
        ),
      },
      {
        id: 'poking',
        heading: 'Poking at it by hand',
        body: (
          <>
            <CodeBlock>{poke}</CodeBlock>
            <DataTable
              head={['UI', 'URL']}
              rows={[
                ['mock-telegram', <code>http://localhost:8081</code>],
                ['Alertmanager', <code>http://localhost:9093</code>],
                ['the roster', <code>http://localhost:8082/oncall.ics</code>],
                ['LocalStack health', <code>http://localhost:4566/_localstack/health</code>],
              ]}
            />
            <p className="text-soft">
              The frontend runs with hot reload via <code>make web-dev</code>, pointed at the API
              already deployed inside LocalStack.
            </p>
          </>
        ),
      },
    ],
  },
};
