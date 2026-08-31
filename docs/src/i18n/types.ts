import type { ReactNode } from 'react';

export type Lang = 'vi' | 'en';

export const LANGS: Lang[] = ['vi', 'en'];

/**
 * One anchored section of a page.
 *
 * `id` is deliberately language-independent: it is what the table of contents
 * links to and what a shared URL fragment carries, so switching language keeps
 * the reader exactly where they were.
 */
export interface DocSection {
  readonly id: string;
  readonly heading: string;
  readonly body: ReactNode;
}

export interface DocPage {
  readonly title: string;
  readonly lede: string;
  readonly sections: readonly DocSection[];
}

/**
 * Both languages are required. A page translated into only one of them is a
 * compile error rather than a blank section discovered in production.
 */
export type Translated<T> = Record<Lang, T>;
