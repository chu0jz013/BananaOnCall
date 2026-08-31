import type { DocPage, Translated } from '../i18n/types';
import { AlertDemo } from '../components/AlertDemo';
import { Callout } from '../components/Callout';

const note = (t: boolean) => (
  <Callout tone="note" title={t ? 'Chạy hoàn toàn trong trình duyệt' : 'Runs entirely in your browser'}>
    <p>
      {t
        ? 'Không có AWS, không có bot token, không có request nào rời khỏi trang này. Nhịp escalation, giới hạn lặp 50 lần và việc gộp alert trùng đều là con số thật lấy từ internal/domain — chỉ có thời gian là được nén lại.'
        : 'No AWS, no bot token, and no request leaves this page. The beat schedule, the 50-repeat cap and the dedupe collapse are the real numbers from internal/domain — only time is compressed.'}
    </p>
  </Callout>
);

export const demo: Translated<DocPage> = {
  vi: {
    title: 'Demo luồng alert',
    lede: 'Bắn một alert, xem nó đi qua pipeline, rồi bấm Ack để chặn escalation giữa chừng.',
    wide: true,
    sections: [
      {
        id: 'demo',
        heading: 'Bắn thử',
        body: (
          <>
            <AlertDemo lang="vi" />
            {note(true)}
          </>
        ),
      },
    ],
  },
  en: {
    title: 'Alert-flow demo',
    lede: 'Fire an alert, watch it cross the pipeline, then press Ack to stop the escalation mid-sweep.',
    wide: true,
    sections: [
      {
        id: 'demo',
        heading: 'Fire one',
        body: (
          <>
            <AlertDemo lang="en" />
            {note(false)}
          </>
        ),
      },
    ],
  },
};
