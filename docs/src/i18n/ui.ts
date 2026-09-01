import type { Translated } from './types';

/** Chrome only. Page prose lives in src/content, where it can carry markup. */
export interface Ui {
  readonly tagline: string;
  readonly contents: string;
  readonly onThisPage: string;
  readonly menu: string;
  readonly closeMenu: string;
  readonly language: string;
  readonly theme: string;
  readonly toLight: string;
  readonly toDark: string;
  readonly archivedDoc: string;
  readonly repo: string;
  readonly feedback: string;
  readonly feedbackNote: string;
  readonly editedFrom: string;
  readonly notFound: string;
  readonly notFoundBody: string;
  readonly backToOverview: string;
}

export const ui: Translated<Ui> = {
  vi: {
    tagline: 'On-call engine trên AWS Serverless',
    contents: 'Nội dung',
    onThisPage: 'Trong trang này',
    menu: 'Mở mục lục',
    closeMenu: 'Đóng mục lục',
    language: 'Ngôn ngữ',
    theme: 'Giao diện',
    toLight: 'Chuyển sang nền sáng',
    toDark: 'Chuyển sang nền tối',
    archivedDoc: 'Design doc v0.1 (lưu trữ)',
    repo: 'Mã nguồn',
    feedback: 'Góp ý',
    feedbackNote: 'Thấy chỗ nào sai hoặc thiếu?',
    editedFrom: 'Tài liệu này sinh ra từ chính mã nguồn trong repo.',
    notFound: 'Không có trang này',
    notFoundBody: 'Đường dẫn bạn mở không tồn tại trong tài liệu.',
    backToOverview: 'Về trang Tổng quan',
  },
  en: {
    tagline: 'An on-call engine on AWS Serverless',
    contents: 'Contents',
    onThisPage: 'On this page',
    menu: 'Open contents',
    closeMenu: 'Close contents',
    language: 'Language',
    theme: 'Theme',
    toLight: 'Switch to light',
    toDark: 'Switch to dark',
    archivedDoc: 'Design doc v0.1 (archived)',
    repo: 'Source',
    feedback: 'Feedback',
    feedbackNote: 'Something wrong or missing?',
    editedFrom: 'These docs are written from the code in this repository.',
    notFound: 'Page not found',
    notFoundBody: 'That path does not exist in these docs.',
    backToOverview: 'Back to Overview',
  },
};
