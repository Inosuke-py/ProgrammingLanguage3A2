/**
 * Minimal audit logger for auth events.
 * Logs to stdout in structured JSON for Railway log drain.
 */
export function auditLog(event, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };
  console.log(`[Audit] ${JSON.stringify(entry)}`);
}
