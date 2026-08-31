import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeToggle } from './components/ThemeToggle';
import './styles.css';

/**
 * Placeholder. The operator console needs the alert-group write path and the
 * ack/resolve endpoints, which land in sessions S2 and S4 — and it needs auth,
 * which needs Cognito, which is not in LocalStack Community. Shipping the shell
 * now keeps the second entry point real rather than a promise.
 */
function Console() {
  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <div className="row">
            <p className="eyebrow" style={{ marginTop: 0 }}>Console</p>
            <ThemeToggle />
          </div>
          <h1 className="wordmark">
            Banana<span>OnCall</span>
          </h1>
          <p className="health-note">Operator console — not built yet.</p>
        </div>
      </header>
      <main className="wrap">
        <section>
          <h2>What goes here</h2>
          <p className="section-note">
            Firing alerts with their timeline, and the Ack, Resolve and Silence
            actions that Telegram already offers.
          </p>
          <p className="error">
            Blocked on three things, in order: the processor that writes alert
            groups (S2), the ack and resolve endpoints (S4), and an authenticated
            session — Cognito is not part of LocalStack Community, so that one
            needs a decision about what stands in for it locally.
          </p>
          <p style={{ fontSize: '.875rem' }}>
            <a href="../">← Public status board</a>
          </p>
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Console />
  </StrictMode>,
);
