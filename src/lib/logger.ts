type LogContext = Record<string, unknown>;

function writeLog(level: "info" | "error", event: string, context: LogContext = {}) {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...context
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.info(line);
}

export function logInfo(event: string, context: LogContext = {}) {
  writeLog("info", event, context);
}

export function logError(event: string, context: LogContext = {}) {
  writeLog("error", event, context);
}
