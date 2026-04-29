import type { LogEntry } from "../lib/types";

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <section className="panel log-panel" aria-live="polite">
      <div className="panel-heading">
        <h2>Run Log</h2>
        <p>Transaction signatures, fetch results, and errors appear here.</p>
      </div>
      <div className="logs">
        {logs.length === 0 ? (
          <p className="muted">No actions yet.</p>
        ) : (
          logs.map((log) => (
            <article className={`log ${log.level}`} key={log.id}>
              <div>
                <strong>{log.message}</strong>
                <time>{log.at}</time>
              </div>
              {log.detail ? <code>{log.detail}</code> : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
