import type { DocPage, Translated } from '../i18n/types';
import { overview } from './overview';
import { quickstart } from './quickstart';
import { architecture } from './architecture';
import { demo } from './demo';
import { localdev } from './localdev';
import { reference } from './reference';
import { testing } from './testing';
import { deployment } from './deployment';
import { decisions } from './decisions';

export interface DocRoute {
  readonly path: string;
  readonly content: Translated<DocPage>;
}

/**
 * The sidebar order, and the router's source of truth.
 *
 * Nav labels are not stored here on purpose — they are `content[lang].title`,
 * so a page title and its nav entry cannot drift apart.
 */
export const routes: readonly DocRoute[] = [
  { path: '/', content: overview },
  { path: '/quickstart', content: quickstart },
  { path: '/architecture', content: architecture },
  { path: '/demo', content: demo },
  { path: '/local-development', content: localdev },
  { path: '/reference', content: reference },
  { path: '/testing', content: testing },
  { path: '/deployment', content: deployment },
  { path: '/decisions', content: decisions },
];
