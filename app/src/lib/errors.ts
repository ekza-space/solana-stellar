export function formatRpcError(error: unknown, fallback: string) {
  const message = extractErrorMessage(error);
  const hints = collectHints(error, message);
  if (!hints.length) return message || fallback;
  return `${message}\n\nHints:\n${hints.join("\n")}`;
}

function collectHints(error: unknown, message: string) {
  const errorText = String(message).toLowerCase();
  const hints: string[] = [];

  if (errorText.includes("cors") || errorText.includes("cross-origin")) {
    hints.push(
      "Browser calls to local RPC should go through Vite proxy (`/rpc`) to avoid CORS."
    );
    hints.push("Start app with `npm run dev -- --port <APP_PORT>` and localnet on 127.0.0.1:8899.");
  }

  if (errorText.includes("networkerror") && errorText.includes("fetch resource")) {
    hints.push("Network request to RPC failed. Check that the RPC is running and reachable.");
    hints.push("Use the same local endpoint as UI is using and confirm the test validator is up.");
  }

  if (errorText.includes("disconnected port") || errorText.includes("service worker")) {
    hints.push("Phantom service worker is temporarily unavailable. Re-open Phantom and reconnect the wallet.");
  }

  const logs = extractErrorLogs(error);
  if (logs?.length) {
    hints.push(`Program logs available: ${logs}`);
  }

  return hints;
}

function extractErrorLogs(error: unknown): string | null {
  if (error && typeof error === "object") {
    const maybeAny = error as Record<string, unknown>;
    if (typeof maybeAny.logs === "string") return String(maybeAny.logs);
    if (Array.isArray(maybeAny.logs)) {
      return maybeAny.logs.map((line) => String(line)).join("\n");
    }
    const maybeCause = maybeAny.cause as Record<string, unknown> | undefined;
    if (maybeCause?.logs) {
      if (Array.isArray(maybeCause.logs)) {
        return maybeCause.logs.map((line) => String(line)).join("\n");
      }
      if (typeof maybeCause.logs === "string") return String(maybeCause.logs);
    }
  }
  return null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.toString();
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
