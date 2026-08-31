interface Props {
  /** Shown above the block — usually a filename or a shell prompt hint. */
  readonly title?: string;
  readonly children: string;
}

/** Wide code scrolls inside its own box; the page itself never scrolls sideways. */
export function CodeBlock({ title, children }: Props) {
  return (
    <figure className="my-5 border border-line bg-surface">
      {title && (
        <figcaption className="eyebrow border-b border-line px-4 py-2 text-soft">
          {title}
        </figcaption>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[.8125rem] leading-relaxed">
        <code>{children.trim()}</code>
      </pre>
    </figure>
  );
}
