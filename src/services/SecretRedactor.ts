export interface SecretRedactionResult {
  text: string;
  redactionCount: number;
}

const REDACTED = '[REDACTED]';

const VALUE_PATTERNS: RegExp[] = [
  /(\b(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|password|passwd|private[_-]?key|access[_-]?key|secret[_-]?access[_-]?key)\b\s*[:=]\s*)(["']?)([^\s"'#,;}{]+|[^"'\r\n]+\2)/gi,
  /(\bAuthorization\s*:\s*Bearer\s+)([^\s]+)/gi,
  /(\b(?:AKIA|ASIA)[A-Z0-9]{16}\b)/g,
  /(\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b)/g,
];

const PRIVATE_KEY_PATTERN = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g;

export function redactSecrets(value: string): SecretRedactionResult {
  if (!value) {
    return { text: value, redactionCount: 0 };
  }

  let redactionCount = 0;
  let text = value.replace(PRIVATE_KEY_PATTERN, () => {
    redactionCount += 1;
    return REDACTED;
  });

  for (const pattern of VALUE_PATTERNS) {
    text = text.replace(pattern, (...args: string[]) => {
      redactionCount += 1;
      const match = args[0];
      const prefix = args[1];

      if (prefix && match.startsWith(prefix)) {
        return `${prefix}${REDACTED}`;
      }

      return REDACTED;
    });
  }

  return { text, redactionCount };
}
