const sensitiveKey =
  /(^|_)(name|email|phone|date_?of_?birth|dob|driver.?s?_?license|license_?number|policy_?number|vin|token|cookie|password|secret|authorization|address)(_|$)/i;

const textPatterns: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b[A-HJ-NPR-Z0-9]{17}\b/gi,
  /\b(?:bearer\s+|token[_:= -]+|api[_-]?key[_:= -]+)[A-Za-z0-9._-]{12,}\b/gi,
];

function redactText(value: string): string {
  return textPatterns.reduce((redacted, pattern) => redacted.replace(pattern, '[REDACTED]'), value);
}

export function sanitizeForLog(value: unknown, key = ''): unknown {
  const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLocaleLowerCase();
  if (sensitiveKey.test(normalizedKey)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeForLog(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

export interface SafeLogRecord {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  jobId?: string;
  fields?: Record<string, unknown>;
}

export function serializeSafeLog(record: SafeLogRecord): string {
  return JSON.stringify(sanitizeForLog(record));
}

export interface SafeLogger {
  write(record: SafeLogRecord): void;
}

export class JsonLineSafeLogger implements SafeLogger {
  public constructor(private readonly sink: (line: string) => void = console.log) {}

  public write(record: SafeLogRecord): void {
    this.sink(serializeSafeLog(record));
  }
}
