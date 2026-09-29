import * as path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml', '.xml', '.html', '.css', '.scss', '.less',
  '.py', '.java', '.kt', '.kts', '.go', '.rs', '.cs', '.cpp', '.c', '.h', '.hpp', '.php', '.rb', '.swift', '.scala', '.sh', '.ps1', '.toml', '.ini',
]);

const SENSITIVE_DIRECTORIES = new Set([
  '.ssh',
  '.aws',
  '.azure',
  '.gnupg',
  '.kube',
]);

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^credentials(?:\.[^.]+)?$/i,
  /^secrets?(?:\.[^.]+)?$/i,
  /^service[-_.]?account(?:\.[^.]+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
];

export const PROJECT_METADATA_FILES = new Set(['package.json', 'tsconfig.json', 'pyproject.toml', 'pom.xml', 'go.mod', 'cargo.toml', 'requirements.txt', 'readme.md']);

export function isTestPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.includes('__tests__')
    || lower.includes('.test.')
    || lower.includes('.spec.')
    || lower.endsWith('_test.py')
    || lower.endsWith('test.py');
}

export function isSensitiveFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) ?? '';

  if (segments.some(segment => SENSITIVE_DIRECTORIES.has(segment.toLowerCase()))) {
    return true;
  }

  return SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(fileName));
}

export function shouldIndexFile(filePath: string, size: number): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (/\/(node_modules|dist|build|out|coverage|\.next|target|bin|obj|media)\//.test(normalized)) {
    return false;
  }
  if (isSensitiveFilePath(filePath)) {
    return false;
  }
  if (size > 512_000) {
    return false;
  }
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || PROJECT_METADATA_FILES.has(path.basename(filePath).toLowerCase());
}
