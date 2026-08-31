import type { ReactNode } from 'react';

type Tone = 'note' | 'warn' | 'danger';

const tones: Record<Tone, string> = {
  note: 'border-l-strong bg-surface',
  warn: 'border-l-banana bg-wash',
  danger: 'border-l-fire bg-fire/[.07]',
};

interface Props {
  readonly tone?: Tone;
  readonly title?: string;
  readonly children: ReactNode;
}

export function Callout({ tone = 'note', title, children }: Props) {
  return (
    <aside className={`my-5 border border-line border-l-4 px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className="space-y-2 [&_code]:font-mono [&_code]:text-[.8125rem]">{children}</div>
    </aside>
  );
}
