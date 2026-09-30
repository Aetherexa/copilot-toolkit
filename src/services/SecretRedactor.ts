export interface SecretRedactionResult {
  text: string;
  redactionCount: number;
}

const REDACTED = '[REDACTED]';

const PREFIX_PATTERNS: RegExp[] = [
  /((?:^|\r?\n)\s*[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET)[A-Z0-9_]*\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s#]+)/g,
  /(\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET)[A-Z0-9_]*\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[A-Za-z0-9_+./=-]{8,})/g,
  /(\b["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret[_-]?access[_-]?key)["']?\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*')/gi,
  /(\bAuthorization\s*:\s*Bearer\s+)([^\s]+)/gi,
];

const STANDALONE_PATTERNS: RegExp[] = [
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
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

  for (const pattern of PREFIX_PATTERNS) {
    text = text.replace(pattern, (_match: string, prefix: string) => {
      redactionCount += 1;
      return `${prefix}${REDACTED}`;
    });
  }

  for (const pattern of STANDALONE_PATTERNS) {
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return REDACTED;
    });
  }

  return { text, redactionCount };
}
