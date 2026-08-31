import type { DocPage, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';

const cdkCmds = `
make synth      # print the synthesized template
make deploy     # deploy into LocalStack, then repair the stage if needed
make destroy    # remove the stack again

npx cdk deploy -c env=prod     # real AWS, once the gaps below are closed
`;

const stack = (head: readonly string[]) => (
  <DataTable
    head={head}
    rows={[
      ['DynamoDB', <>one table, <code>GSI1</code>, TTL, pay-per-request</>],
      ['SQS', <>a FIFO queue and its DLQ (<code>maxReceiveCount</code> 3)</>],
      ['Lambda', <><code>ingest</code> and <code>status</code>, Go on <code>PROVIDED_AL2023</code>, arm64</>],
      ['API Gateway', 'a REST API, stage prod, throttled, with access logs'],
      ['S3', 'a public website bucket for the status board'],
      ['CloudWatch Logs', 'one group per function, one week retention'],
    ]}
  />
);

export const deployment: Translated<DocPage> = {
  vi: {
    title: 'Triển khai',
    lede: 'Một stack CDK TypeScript, hai môi trường, và một danh sách ngắn những thứ còn phải chốt trước khi đụng vào AWS thật.',
    sections: [
      {
        id: 'cdk',
        heading: 'Stack CDK',
        body: (
          <>
            <p className="text-soft">
              Hạ tầng là CDK TypeScript, không phải Terraform — đây là chỗ thứ tư bản build đi
              chệch thiết kế. Handler vẫn là Go theo đúng D10.
            </p>
            <CodeBlock>{cdkCmds}</CodeBlock>
            <p className="text-soft">
              <code>make build</code> cross-compile <code>cmd/&lt;fn&gt;</code> thành{' '}
              <code>dist/&lt;fn&gt;/bootstrap</code> cho <code>linux/arm64</code>, nên không có
              bước bundling bằng Docker và không có construct alpha nào trong cây phụ thuộc.
              arm64 khớp cả máy Apple Silicon lẫn Graviton ở prod.
            </p>
            {stack(['Tài nguyên', 'Cái gì được tạo'])}
          </>
        ),
      },
      {
        id: 'prod',
        heading: 'Còn thiếu gì trước khi lên prod',
        body: (
          <>
            <Callout tone="danger" title="Chưa deploy lên AWS thật lần nào">
              <p>
                Nhánh <code>prod</code> của config đã tồn tại nhưng chưa được chạy. Bốn chỗ dưới
                đây phải chốt trước.
              </p>
            </Callout>
            <DataTable
              head={['Việc', 'Trạng thái']}
              rows={[
                [<>Integration key</>, <><code>integrationKeys</code> ở prod đang rỗng — phải đọc từ Secrets Manager</>],
                [<>Domain</>, <><code>siteOrigin</code> chưa đặt; câu hỏi Q4 của design doc vẫn treo</>],
                [<>TLS cho board</>, 'S3 website endpoint chỉ có HTTP. Cần CloudFront phía trước trước khi gắn domain thật.'],
                [<>Xác thực</>, 'Cognito quay lại như một bước hoán đổi ở Phase 2; hiện tại key nằm trong path'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'docs',
        heading: 'Trang tài liệu này deploy thế nào',
        body: (
          <>
            <p className="text-soft">
              Chính trang bạn đang đọc là một app Vite + React + TypeScript + Tailwind nằm trong{' '}
              <code>docs/</code>, và được GitHub Actions build rồi đẩy lên GitHub Pages. Không có
              file build nào được commit.
            </p>
            <CodeBlock title=".github/workflows/pages.yml">{`
push (master, docs/**)  →  npm ci  →  npm run build  →  upload-pages-artifact
                                                     →  deploy-pages
`}</CodeBlock>
            <DataTable
              head={['Chi tiết', 'Cách xử lý']}
              rows={[
                ['Custom domain', <><code>docs/public/CNAME</code> được Vite chép vào <code>dist/</code> mỗi lần build</>],
                ['Deep link', <>GitHub Pages không có rewrite, nên bước build chép <code>index.html</code> thành <code>404.html</code></>],
                ['Design doc cũ', <>giữ nguyên ở <code>/design-doc-v0.1.html</code></>],
                [<code>base</code>, <>là <code>&apos;/&apos;</code> vì custom domain phục vụ ở gốc</>],
              ]}
            />
            <Callout tone="warn" title="Một bước phải làm bằng tay">
              <p>
                Trong <strong>Settings → Pages</strong>, nguồn phải được chuyển từ{' '}
                <em>Deploy from a branch</em> sang <strong>GitHub Actions</strong>. Chưa chuyển
                thì workflow vẫn chạy xanh nhưng trang thật vẫn là thư mục <code>/docs</code> cũ.
              </p>
            </Callout>
          </>
        ),
      },
    ],
  },

  en: {
    title: 'Deployment',
    lede: 'One CDK TypeScript stack, two environments, and a short list of things still to settle before this touches real AWS.',
    sections: [
      {
        id: 'cdk',
        heading: 'The CDK stack',
        body: (
          <>
            <p className="text-soft">
              Infrastructure is CDK TypeScript, not Terraform — the fourth place the build
              deviated from the design. The handlers stay Go, per D10.
            </p>
            <CodeBlock>{cdkCmds}</CodeBlock>
            <p className="text-soft">
              <code>make build</code> cross-compiles <code>cmd/&lt;fn&gt;</code> to{' '}
              <code>dist/&lt;fn&gt;/bootstrap</code> for <code>linux/arm64</code>, so there is no
              Docker bundling step and no alpha construct in the dependency tree. arm64 matches
              both the Apple Silicon host and Graviton in prod.
            </p>
            {stack(['Resource', 'What gets created'])}
          </>
        ),
      },
      {
        id: 'prod',
        heading: 'What is missing before prod',
        body: (
          <>
            <Callout tone="danger" title="This has never been deployed to real AWS">
              <p>
                The <code>prod</code> branch of the config exists but has not been exercised. The
                four items below have to be settled first.
              </p>
            </Callout>
            <DataTable
              head={['Item', 'State']}
              rows={[
                [<>Integration keys</>, <><code>integrationKeys</code> is empty in prod — it must read from Secrets Manager</>],
                [<>Domain</>, <><code>siteOrigin</code> is unset; design doc question Q4 is still open</>],
                [<>TLS for the board</>, 'S3 website endpoints are HTTP-only. It wants CloudFront in front before it fronts a real domain.'],
                [<>Authentication</>, 'Cognito returns as a Phase 2 swap; today the key is in the path'],
              ]}
            />
          </>
        ),
      },
      {
        id: 'docs',
        heading: 'How this documentation site ships',
        body: (
          <>
            <p className="text-soft">
              The page you are reading is itself a Vite + React + TypeScript + Tailwind app living
              in <code>docs/</code>, built and pushed to GitHub Pages by GitHub Actions. No build
              output is ever committed.
            </p>
            <CodeBlock title=".github/workflows/pages.yml">{`
push (master, docs/**)  →  npm ci  →  npm run build  →  upload-pages-artifact
                                                     →  deploy-pages
`}</CodeBlock>
            <DataTable
              head={['Detail', 'How it is handled']}
              rows={[
                ['Custom domain', <><code>docs/public/CNAME</code> is copied into <code>dist/</code> by Vite on every build</>],
                ['Deep links', <>GitHub Pages has no rewrite rule, so the build copies <code>index.html</code> to <code>404.html</code></>],
                ['The old design doc', <>kept verbatim at <code>/design-doc-v0.1.html</code></>],
                [<code>base</code>, <>is <code>&apos;/&apos;</code> because the custom domain serves at the root</>],
              ]}
            />
            <Callout tone="warn" title="One step that has to be done by hand">
              <p>
                Under <strong>Settings → Pages</strong>, the source must be switched from{' '}
                <em>Deploy from a branch</em> to <strong>GitHub Actions</strong>. Until it is, the
                workflow runs green but the live site is still the old <code>/docs</code> folder.
              </p>
            </Callout>
          </>
        ),
      },
    ],
  },
};
