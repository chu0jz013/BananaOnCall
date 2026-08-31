import type { ReactNode } from 'react';

interface Props {
  readonly head: readonly ReactNode[];
  readonly rows: readonly (readonly ReactNode[])[];
}

/** Tables scroll inside their own container so the page body never does. */
export function DataTable({ head, rows }: Props) {
  return (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="eyebrow border-b border-strong px-3 py-2 text-left font-medium text-soft"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-line px-3 py-2 align-top [&_code]:font-mono [&_code]:text-[.8125rem]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
