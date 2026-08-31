import type { ReactNode } from 'react';
import type { DocPage, Lang, Translated } from '../i18n/types';
import { CodeBlock } from '../components/CodeBlock';
import { DataTable } from '../components/DataTable';
import { Callout } from '../components/Callout';
import { Steps } from '../components/Steps';
import { Tabs } from '../components/Tabs';
import { ENVS, useEnv, type Env } from '../env';

const envLabels: Record<Lang, Record<Env, string>> = {
  vi: { local: 'LocalStack', aws: 'AWS thật', docs: 'Trang docs' },
  en: { local: 'LocalStack', aws: 'Real AWS', docs: 'Docs site' },
};

const chips = (xs: readonly string[]) => (
  <div className="flex flex-wrap gap-2">
    {xs.map((x) => (
      <span key={x} className="border border-line px-2 py-1 font-mono text-[.6875rem] text-soft">
        {x}
      </span>
    ))}
  </div>
);

const services = (t: boolean) => (
  <DataTable
    head={[t ? 'Service' : 'Service', 'Port', t ? 'Đóng vai' : 'Stands in for']}
    rows={[
      [<code>localstack</code>, <code>4566</code>, 'AWS'],
      [<code>mock-telegram</code>, <code>8081</code>, 'api.telegram.org'],
      [<code>ical</code>, <code>8082</code>, t ? 'URL iCal của Google Calendar' : 'the Google Calendar iCal URL'],
      [<code>alertmanager</code>, <code>9093</code>, t ? 'Alertmanager thật trên RKE2' : 'the real Alertmanager on RKE2'],
    ]}
  />
);

/** Each environment is the same three beats; only the commands differ. */
function steps(env: Env, t: boolean) {
  if (env === 'local') {
    return [
      {
        title: t ? 'Chuẩn bị' : 'Prerequisites',
        body: chips(['Docker', 'Go 1.27', 'Node + npm', 'AWS CLI · profile localstack']),
      },
      {
        title: t ? 'Dựng stack' : 'Bring the stack up',
        body: <CodeBlock>{'make all\n#  up · bootstrap · deploy · seed · web-deploy'}</CodeBlock>,
        expected: t ? 'một status board xem được, khoảng 35 giây' : 'a browsable status board in about 35 seconds',
      },
      {
        title: t ? 'Kiểm lại' : 'Check it',
        body: (
          <>
            {services(t)}
            <Callout tone="danger" title={t ? 'Khi một thay đổi không ăn' : "When a change won't take"}>
              <p>
                {t
                  ? 'LocalStack áp dụng update lên API Gateway rất hay hỏng, và hỏng im lặng. '
                  : 'LocalStack applies updates to API Gateway unreliably, and fails silently. '}
                <code>make down &amp;&amp; make all</code>
                {t ? ' thay vì ngồi debug code của chính mình.' : ' rather than debugging your own code.'}
              </p>
            </Callout>
          </>
        ),
      },
    ];
  }

  if (env === 'aws') {
    return [
      {
        title: t ? 'Chuẩn bị' : 'Prerequisites',
        body: chips([
          t ? 'Tài khoản AWS' : 'An AWS account',
          t ? 'Credential có quyền deploy' : 'Credentials that can deploy',
          'cdk bootstrap',
          'ap-southeast-1',
        ]),
      },
      {
        title: t ? 'Deploy' : 'Deploy',
        body: <CodeBlock>{'make build\nnpx cdk deploy -c env=prod'}</CodeBlock>,
        expected: t
          ? 'CloudFormation xong, và ApiUrl · TableName · SiteUrl nằm trong outputs'
          : 'CloudFormation completes, and ApiUrl · TableName · SiteUrl appear in the outputs',
      },
      {
        title: t ? 'Bốn chỗ phải chốt trước' : 'Four things to settle first',
        body: (
          <>
            <DataTable
              head={[t ? 'Việc' : 'Item', t ? 'Trạng thái' : 'State']}
              rows={[
                [t ? 'Integration key' : 'Integration keys', <><code>integrationKeys</code> {t ? 'ở prod đang rỗng — phải đọc từ Secrets Manager' : 'is empty in prod — must read from Secrets Manager'}</>],
                [t ? 'Domain' : 'Domain', <><code>siteOrigin</code> {t ? 'chưa đặt; câu hỏi Q4 vẫn treo' : 'is unset; design doc Q4 is still open'}</>],
                [t ? 'TLS cho board' : 'TLS for the board', t ? 'S3 website chỉ có HTTP — cần CloudFront phía trước' : 'S3 website endpoints are HTTP-only — it wants CloudFront in front'],
                [t ? 'Xác thực' : 'Authentication', t ? 'Cognito quay lại ở Phase 2; hiện key nằm trong path' : 'Cognito returns in Phase 2; today the key is in the path'],
              ]}
            />
            <Callout tone="danger" title={t ? 'Chưa deploy lên AWS thật lần nào' : 'Never deployed to real AWS'}>
              <p>
                {t
                  ? 'Nhánh prod của config đã tồn tại nhưng chưa được chạy.'
                  : 'The prod branch of the config exists but has not been exercised.'}
              </p>
            </Callout>
          </>
        ),
      },
    ];
  }

  return [
    {
      title: t ? 'Chuẩn bị' : 'Prerequisites',
      body: (
        <>
          {chips([t ? 'Quyền ghi vào repo' : 'Write access to the repo', 'Settings → Pages'])}
          <p className="mt-3 text-sm text-soft">
            {t ? 'Nguồn của Pages phải là ' : 'The Pages source must be '}
            <strong>GitHub Actions</strong>
            {t
              ? ', không phải "Deploy from a branch" — nếu không, builder cũ sẽ publish thẳng thư mục docs/ chưa build và trang ra trắng xoá.'
              : ', not "Deploy from a branch" — otherwise the legacy builder publishes the raw, unbuilt docs/ folder and the page renders blank.'}
          </p>
        </>
      ),
    },
    {
      title: t ? 'Đẩy lên' : 'Ship it',
      body: <CodeBlock>{'git push        # any push to master\n# or: Actions → Pages → Run workflow'}</CodeBlock>,
      expected: t
        ? 'workflow Pages xanh, rồi oncall.quachuoitrenmay.com phục vụ bản mới'
        : 'the Pages workflow goes green, then oncall.quachuoitrenmay.com serves the new build',
    },
    {
      title: t ? 'Workflow tự kiểm gì' : 'What the workflow verifies',
      body: (
        <>
          <p className="text-soft">
            {t
              ? 'Build fail thay vì đẩy ra một trang trắng — đúng ba thứ đã từng thiếu:'
              : 'The build fails rather than shipping a blank page — exactly the three things that were once missing:'}
          </p>
          <CodeBlock title=".github/workflows/pages.yml">{`
dist/index.html · 404.html · CNAME · design-doc-v0.1.html   exist and are non-empty
dist/assets/*.js                                            a JS bundle was emitted
dist/index.html                                             is NOT the unbuilt Vite entry
`}</CodeBlock>
        </>
      ),
    },
  ];
}

function EnvSteps({ lang }: { lang: Lang }) {
  const { env, setEnv } = useEnv();
  const t = lang === 'vi';
  return (
    <>
      <Tabs
        label={t ? 'Môi trường' : 'Environment'}
        active={env}
        onChange={(id) => setEnv(id as Env)}
        tabs={ENVS.map((e) => ({ id: e, label: envLabels[lang][e] }))}
      />
      <p className="-mt-2 mb-6 font-mono text-[.6875rem] text-soft">
        ↑ {t ? 'một cái switch viết lại mọi câu lệnh bên dưới' : 'one switch rewrites every command below'}
      </p>
      <Steps steps={steps(env, t)} expectedLabel={t ? 'Kỳ vọng' : 'Expected'} />
    </>
  );
}

const costRail = (t: boolean): ReactNode => (
  <div className="border border-line bg-surface p-4">
    <div className="eyebrow text-soft">{t ? 'Chi phí vận hành' : 'Running cost'}</div>
    <div className="font-display mt-2 text-3xl font-bold tracking-[-0.02em]">~8 USD</div>
    <div className="mt-1 font-mono text-[.6875rem] text-soft">
      {t ? 'mỗi tháng, ở prod' : 'per month, in prod'}
    </div>
    <p className="mt-3 border-t border-line pt-3 text-[.8125rem] leading-relaxed text-soft">
      {t
        ? 'CloudWatch Metrics là khoản lớn nhất (4,50). Remote-write thẳng vào Prometheus on-prem cắt hơn nửa hoá đơn.'
        : 'CloudWatch Metrics is the biggest line (4.50). Remote-writing to the on-prem Prometheus cuts more than half the bill.'}
    </p>
  </div>
);

const cdkSection = (t: boolean) => (
  <>
    <p className="text-soft">
      {t
        ? 'Hạ tầng là CDK TypeScript, không phải Terraform — chỗ thứ tư bản build đi chệch thiết kế. Handler vẫn là Go theo D10.'
        : 'Infrastructure is CDK TypeScript, not Terraform — the fourth place the build deviated from the design. The handlers stay Go, per D10.'}
    </p>
    <DataTable
      head={[t ? 'Tài nguyên' : 'Resource', t ? 'Cái gì được tạo' : 'What gets created']}
      rows={[
        ['DynamoDB', <>{t ? 'một bảng, ' : 'one table, '}<code>GSI1</code>, TTL, pay-per-request</>],
        ['SQS', <>{t ? 'queue FIFO và DLQ (' : 'a FIFO queue and its DLQ ('}<code>maxReceiveCount</code> 3)</>],
        ['Lambda', <><code>ingest</code>{t ? ' và ' : ' and '}<code>status</code>, Go · <code>PROVIDED_AL2023</code> · arm64</>],
        ['API Gateway', t ? 'REST API, stage prod, có throttle và access log' : 'a REST API, stage prod, throttled, with access logs'],
        ['S3', t ? 'bucket website công khai cho status board' : 'a public website bucket for the status board'],
      ]}
    />
  </>
);

export const deployment: Translated<DocPage> = {
  vi: {
    title: 'Triển khai',
    lede: 'Một stack CDK, ba thứ có thể deploy, và một cái switch viết lại mọi câu lệnh trên trang.',
    rail: costRail(true),
    sections: [
      { id: 'run', heading: 'Chọn môi trường rồi làm theo', body: <EnvSteps lang="vi" /> },
      { id: 'cdk', heading: 'Stack CDK', body: cdkSection(true) },
    ],
  },
  en: {
    title: 'Deployment',
    lede: 'One CDK stack, three things you might be deploying, and a switch that rewrites every command on the page.',
    rail: costRail(false),
    sections: [
      { id: 'run', heading: 'Pick an environment and follow along', body: <EnvSteps lang="en" /> },
      { id: 'cdk', heading: 'The CDK stack', body: cdkSection(false) },
    ],
  },
};
