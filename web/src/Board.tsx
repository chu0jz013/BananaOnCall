import { useEffect, useState } from 'react';
import { fetchBoard, type Board as BoardData } from './api';
import { duration, timestamp } from './format';
import { HEALTH_COPY } from './status';
import { Legend } from './components/Legend';
import { ThemeToggle } from './components/ThemeToggle';
import { Sli } from './components/Sli';
import { ActiveIncidents, IncidentHistory } from './components/Incidents';

/** Re-poll often enough to be useful during an incident, rarely enough to be free. */
const REFRESH_MS = 30_000;

export function Board() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const load = () =>
      fetchBoard(controller.signal)
        .then((b) => {
          setBoard(b);
          setError(null);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setError(e instanceof Error ? e.message : String(e));
        });

    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const health = board ? HEALTH_COPY[board.health] : null;

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <div className="row">
            <p className="eyebrow" style={{ marginTop: 0 }}>Status</p>
            <ThemeToggle />
          </div>
          <h1 className="wordmark">
            Banana<span>OnCall</span>
          </h1>

          {health ? (
            <div className="health">
              <span className={`health-dot ${health.cls}`} aria-hidden="true" />
              <span className="health-word">{health.word}</span>
              <span className="health-note">{health.note}</span>
            </div>
          ) : (
            <p className="health-note">{error ? 'Status unavailable.' : 'Loading…'}</p>
          )}
        </div>
      </header>

      <main className="wrap">
        {error && (
          <section>
            {/* Say which part failed. A status page that just spins is worse
                than one that admits it cannot reach its own backend. */}
            <p className="error">
              Could not reach the status endpoint — {error}. The figures below,
              if any, are from the last successful load.
            </p>
          </section>
        )}

        {board && (
          <>
            <section>
              <h2>Open right now</h2>
              <p className="section-note">
                Alerts that have not been resolved, acknowledged or not.
              </p>
              <ActiveIncidents incidents={board.activeIncidents} />
            </section>

            <section>
              <h2>Response times</h2>
              <p className="section-note">
                Averaged over the {board.recentIncidents.length} most recent resolved incidents.
              </p>
              <div className="tiles">
                <div className="tile">
                  <span className="eyebrow tile-label">Mean time to acknowledge</span>
                  <div className="tile-value mono">
                    {board.mtta.sampleSize > 0 ? duration(board.mtta.seconds) : '—'}
                  </div>
                  <div className="tile-sub">
                    {board.mtta.sampleSize > 0
                      ? `over ${board.mtta.sampleSize} incidents`
                      : 'no acknowledged incidents yet'}
                  </div>
                </div>
                <div className="tile">
                  <span className="eyebrow tile-label">Mean time to resolve</span>
                  <div className="tile-value mono">
                    {board.mttr.sampleSize > 0 ? duration(board.mttr.seconds) : '—'}
                  </div>
                  <div className="tile-sub">
                    {board.mttr.sampleSize > 0
                      ? `over ${board.mttr.sampleSize} incidents`
                      : 'no resolved incidents yet'}
                  </div>
                </div>
                <div className="tile">
                  <span className="eyebrow tile-label">Open incidents</span>
                  <div className="tile-value mono">{board.activeIncidents.length}</div>
                  <div className="tile-sub">right now</div>
                </div>
              </div>
            </section>

            <section>
              <div className="row" style={{ marginBottom: '1.25rem' }}>
                <div>
                  <h2>Service level</h2>
                  <p className="section-note" style={{ margin: 0 }}>
                    Each indicator over its own rolling window, with the error
                    budget it has left.
                  </p>
                </div>
                <Legend />
              </div>
              <div className="slis">
                {board.slis.map((s) => (
                  <Sli key={s.key} sli={s} />
                ))}
              </div>
            </section>

            <section>
              <h2>Incident history</h2>
              <p className="section-note">Most recently resolved first.</p>
              <IncidentHistory incidents={board.recentIncidents} />
            </section>
          </>
        )}
      </main>

      <footer>
        <div className="wrap">
          {board ? `Last updated ${timestamp(board.generatedAt)} UTC · ` : ''}
          refreshes every {REFRESH_MS / 1000}s · BananaOnCall
        </div>
      </footer>
    </>
  );
}
