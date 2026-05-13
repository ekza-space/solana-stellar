import type { LogEntry } from "../lib/types";

const LOG_URL_RE = /(https?:\/\/[^\s]+)/g;

function renderDetail(detail: string) {
  const parts = detail.split(LOG_URL_RE);
  return parts.map((part, index) => {
    if (part.match(LOG_URL_RE)) {
      return (
        <a href={part} key={part + index} rel="noreferrer" target="_blank">
          {part}
        </a>
      );
    }

    return part;
  });
}

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
              {log.detail ? (
                <code>
                  {log.detail.includes("\n")
                    ? renderDetail(log.detail).map((part, index) => (
                        <span key={index}>
                          {index ? <br /> : null}
                          {part}
                        </span>
                      ))
                    : renderDetail(log.detail)}
                </code>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
