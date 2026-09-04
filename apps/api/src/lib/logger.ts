/**
 * Minimal structured logger.
 * Deliberately never accepts/logs keys named like secrets/passwords/tokens —
 * `redact` strips them defensively even if a caller passes them by mistake.
 */

const SENSITIVE_KEYS = [
  "password",
  "passwordhash",
  "secret",
  "key_secret",
  "keysecret",
  "razorpay_key_secret",
  "webhook_secret",
  "jwt_secret",
  "authorization",
  "token",
  "apikey",
  "api_key",
];

function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object") {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

type LogFields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", message: string, fields?: LogFields) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(fields ? (redact(fields) as LogFields) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
