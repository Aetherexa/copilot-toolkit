import * as path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml', '.xml', '.html', '.css', '.scss', '.less',
  '.py', '.java', '.kt', '.kts', '.go', '.rs', '.cs', '.cpp', '.c', '.h', '.hpp', '.php', '.rb', '.swift', '.scala', '.sh', '.ps1', '.toml', '.ini', '.env',
]);

export const PROJECT_METADATA_FILES = new Set(['package.json', 'tsconfig.json', 'pyproject.toml', 'pom.xml', 'go.mod', 'cargo.toml', 'requirements.txt', 'readme.md']);

export function isTestPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.includes('__tests__')
    || lower.includes('.test.')
    || lower.includes('.spec.')
    || lower.endsWith('_test.py')
    || lower.endsWith('test.py');
}

export function shouldIndexFile(filePath: string, size: number): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (/\/(node_modules|dist|build|out|coverage|\.next|target|bin|obj|media)\//.test(normalized)) {
    return false;
  }
  if (size > 512_000) {
    return false;
  }
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || PROJECT_METADATA_FILES.has(path.basename(filePath).toLowerCase());
}