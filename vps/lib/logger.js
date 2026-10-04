// Logger in-memory untuk log aktivitas gateway (kapasitas 100 log terbaru).
const logs = [];
const MAX_LOGS = 100;

function logEvent(level, message, meta = null) {
  const item = {
    timestamp: new Date().toISOString(),
    level: String(level).toUpperCase(),
    message: String(message),
    meta: meta || undefined,
  };
  logs.unshift(item);
  if (logs.length > MAX_LOGS) logs.pop();
  return item;
}

function getLogs(limit = 50) {
  return logs.slice(0, Math.min(limit, MAX_LOGS));
}

function clearLogs() {
  logs.length = 0;
}

module.exports = { logEvent, getLogs, clearLogs };
