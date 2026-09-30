import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspaceRoot } from '../app/workspace';
import { TokenEstimator } from './TokenEstimator';
import { isTestPath, PROJECT_METADATA_FILES, shouldIndexFile } from './workspaceFileFilters';

export interface WorkspaceFileInfo {
  absolutePath: string;
  relativePath: string;
  directory: string;
  name: string;
  baseName: string;
  extension: string;
  size: number;
  mtimeMs: number;
  isTest: boolean;
  isProjectMetadata: boolean;
}

export interface FileExcerpt {
  content: string;
  truncated: boolean;
  tokenEstimate: number;
  originalTokenEstimate: number;
  lineCount: number;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.toml': 'toml',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
};

const EXCLUDED_GLOB = '**/{.git,node_modules,dist,build,out,coverage,.next,target,bin,obj,media}/**';
const MAX_INDEXED_FILES = 5_000;
const MAX_INDEXED_BYTES = 64 * 1024 * 1024;
function tokenizeName(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map(token => token.toLowerCase())
    .filter(token => token.length > 1);
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }

  return false;
}

export class WorkspaceIndexService {
  private filesCache: WorkspaceFileInfo[] | undefined;
  private readonly importCache = new Map<string, { mtimeMs: number; imports: string[] }>();

  constructor(
    context: vscode.ExtensionContext,
    private readonly tokenEstimator: TokenEstimator,
  ) {
    const invalidate = () => this.invalidate();
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(invalidate));
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(invalidate));
    context.subscriptions.push(vscode.workspace.onDidRenameFiles(invalidate));
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(invalidate));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(invalidate));
  }

  invalidate(): void {
    this.filesCache = undefined;
    this.importCache.clear();
  }

  getWorkspaceRoot(): string | undefined {
    return getWorkspaceRoot();
  }

  async getWorkspaceFiles(): Promise<WorkspaceFileInfo[]> {
    if (this.filesCache) {
      return this.filesCache;
    }

    const root = this.getWorkspaceRoot();
    if (!root) {
      this.filesCache = [];
      return this.filesCache;
    }

    const uris = await vscode.workspace.findFiles('**/*', EXCLUDED_GLOB);
    const files: WorkspaceFileInfo[] = [];

    for (const uri of uris) {
      if (uri.scheme !== 'file') {
        continue;
      }

      try {
        const stat = await fs.promises.stat(uri.fsPath);
        if (!stat.isFile() || !shouldIndexFile(uri.fsPath, stat.size)) {
          continue;
        }

        const relativePath = path.relative(root, uri.fsPath).replace(/\\/g, '/');
        files.push({
          absolutePath: uri.fsPath,
          relativePath,
          directory: path.dirname(relativePath).replace(/\\/g, '/'),
          name: path.basename(uri.fsPath),
          baseName: path.basename(uri.fsPath, path.extname(uri.fsPath)),
          extension: path.extname(uri.fsPath).toLowerCase(),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          isTest: isTestPath(relativePath),
          isProjectMetadata: PROJECT_METADATA_FILES.has(path.basename(uri.fsPath).toLowerCase()),
        });
      } catch {
        continue;
      }
    }

    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    const bounded: WorkspaceFileInfo[] = [];
    let totalBytes = 0;
    for (const file of files) {
      if (bounded.length >= MAX_INDEXED_FILES) {
        break;
      }
      if (totalBytes + file.size > MAX_INDEXED_BYTES) {
        continue;
      }

      bounded.push(file);
      totalBytes += file.size;
    }

    this.filesCache = bounded;
    return bounded;
  }

  async getFileInfo(filePath: string): Promise<WorkspaceFileInfo | undefined> {
    const files = await this.getWorkspaceFiles();
    return files.find(file => path.normalize(file.absolutePath) === path.normalize(filePath));
  }

  async upsertFileInfo(filePath: string): Promise<WorkspaceFileInfo | undefined> {
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile() || !shouldIndexFile(filePath, stat.size)) {
        return undefined;
      }

      const root = this.getWorkspaceRoot();
      if (!root) {
        return undefined;
      }

      const info: WorkspaceFileInfo = {
        absolutePath: filePath,
        relativePath: path.relative(root, filePath).replace(/\\/g, '/'),
        directory: path.dirname(path.relative(root, filePath)).replace(/\\/g, '/'),
        name: path.basename(filePath),
        baseName: path.basename(filePath, path.extname(filePath)),
        extension: path.extname(filePath).toLowerCase(),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        isTest: isTestPath(path.relative(root, filePath).replace(/\\/g, '/')),
        isProjectMetadata: PROJECT_METADATA_FILES.has(path.basename(filePath).toLowerCase()),
      };

      if (this.filesCache) {
        const next = this.filesCache.filter(file => path.normalize(file.absolutePath) !== path.normalize(filePath));
        next.push(info);
        next.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
        this.filesCache = next;
      }

      return info;
    } catch {
      return undefined;
    }
  }

  removeFileInfo(filePath: string): void {
    if (this.filesCache) {
      this.filesCache = this.filesCache.filter(file => path.normalize(file.absolutePath) !== path.normalize(filePath));
    }
    this.importCache.delete(filePath);
  }

  async getOpenEditorFiles(): Promise<WorkspaceFileInfo[]> {
    const openPaths = [...new Set(vscode.window.visibleTextEditors
      .map(editor => editor.document.uri)
      .filter(uri => uri.scheme === 'file')
      .map(uri => uri.fsPath))];

    const files = await this.getWorkspaceFiles();
    return openPaths
      .map(openPath => files.find(file => path.normalize(file.absolutePath) === path.normalize(openPath)))
      .filter((file): file is WorkspaceFileInfo => Boolean(file));
  }

  async getCurrentFolderFiles(activeFilePath: string, maxFiles: number, depth = 1): Promise<WorkspaceFileInfo[]> {
    const active = await this.getFileInfo(activeFilePath);
    if (!active) {
      return [];
    }

    const baseSegments = active.directory.split('/').filter(Boolean);
    const files = await this.getWorkspaceFiles();
    return files
      .filter(file => file.absolutePath !== active.absolutePath)
      .filter(file => {
        const segments = file.directory.split('/').filter(Boolean);
        if (segments.length < baseSegments.length) {
          return false;
        }

        const shared = baseSegments.every((segment, index) => segments[index] === segment);
        return shared && segments.length - baseSegments.length <= depth;
      })
      .slice(0, maxFiles);
  }

  async getProjectMetadataFiles(): Promise<WorkspaceFileInfo[]> {
    const files = await this.getWorkspaceFiles();
    return files.filter(file => file.isProjectMetadata).slice(0, 6);
  }

  async readFileExcerpt(filePath: string, maxTokens: number, focusTerms: string[] = []): Promise<FileExcerpt | undefined> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      if (isBinaryBuffer(buffer)) {
        return undefined;
      }

      const content = buffer.toString('utf8');
      const originalTokenEstimate = this.tokenEstimator.estimate(content);
      const maxCharacters = Math.max(200, maxTokens * 4);
      const excerpt = this.createExcerpt(content, maxCharacters, focusTerms);

      return {
        content: excerpt.content,
        truncated: excerpt.truncated,
        tokenEstimate: this.tokenEstimator.estimate(excerpt.content),
        originalTokenEstimate,
        lineCount: content.split(/\r?\n/).length,
      };
    } catch {
      return undefined;
    }
  }

  async readFullText(filePath: string): Promise<string | undefined> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      if (isBinaryBuffer(buffer)) {
        return undefined;
      }
      return buffer.toString('utf8');
    } catch {
      return undefined;
    }
  }

  async getImports(filePath: string): Promise<string[]> {
    const file = await this.getFileInfo(filePath);
    if (!file) {
      return [];
    }

    const cached = this.importCache.get(file.absolutePath);
    if (cached && cached.mtimeMs === file.mtimeMs) {
      return cached.imports;
    }

    const excerpt = await this.readFileExcerpt(file.absolutePath, 4000);
    if (!excerpt) {
      return [];
    }

    const importMatches = excerpt.content.matchAll(/from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g);
    const imports = [...new Set([...importMatches]
      .map(match => match[1] ?? match[2] ?? match[3])
      .filter((value): value is string => Boolean(value)))];
    this.importCache.set(file.absolutePath, { mtimeMs: file.mtimeMs, imports });
    return imports;
  }

  async resolveRelativeImports(filePath: string): Promise<string[]> {
    const imports = await this.getImports(filePath);
    const root = this.getWorkspaceRoot();
    if (!root) {
      return [];
    }

    const candidates = new Set<string>();
    const directory = path.dirname(filePath);
    for (const specifier of imports) {
      if (!specifier.startsWith('.')) {
        continue;
      }

      const resolved = this.resolveImportCandidates(path.resolve(directory, specifier));
      for (const candidate of resolved) {
        if (candidate.startsWith(root)) {
          candidates.add(candidate);
        }
      }
    }

    return [...candidates];
  }

  async summarizeWorkspace(maxFiles = 8): Promise<string> {
    const files = await this.getWorkspaceFiles();
    if (files.length === 0) {
      return 'No workspace files were available.';
    }

    const languageCounts = new Map<string, number>();
    for (const file of files) {
      const extension = file.extension || 'no-ext';
      languageCounts.set(extension, (languageCounts.get(extension) ?? 0) + 1);
    }

    const topLanguages = [...languageCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([extension, count]) => `${extension}: ${count}`)
      .join(', ');

    const metadataFiles = await this.getProjectMetadataFiles();
    const metadataSummary = metadataFiles.map(file => file.relativePath).join(', ') || 'None';
    const sampleFiles = files.slice(0, maxFiles).map(file => `- ${file.relativePath}`).join('\n');

    return [
      `Workspace root: ${this.getWorkspaceRoot() ?? 'Unavailable'}`,
      `Files indexed: ${files.length}`,
      `Top file types: ${topLanguages}`,
      `Project metadata: ${metadataSummary}`,
      'Representative files:',
      sampleFiles,
    ].join('\n');
  }

  getNameTokens(file: WorkspaceFileInfo): string[] {
    return tokenizeName(file.baseName);
  }

  inferLanguageId(file: WorkspaceFileInfo): string {
    return LANGUAGE_BY_EXTENSION[file.extension] ?? (file.extension.replace('.', '') || 'plaintext');
  }

  private createExcerpt(content: string, maxCharacters: number, focusTerms: string[]): { content: string; truncated: boolean } {
    if (content.length <= maxCharacters) {
      return { content, truncated: false };
    }

    if (focusTerms.length === 0) {
      return { content: `${content.slice(0, maxCharacters)}\n\n[Truncated]`, truncated: true };
    }

    const lowerTerms = focusTerms.map(term => term.toLowerCase()).filter(Boolean);
    const lines = content.split(/\r?\n/);
    const matchedIndexes = lines
      .map((line, index) => ({ line: line.toLowerCase(), index }))
      .filter(entry => lowerTerms.some(term => entry.line.includes(term)))
      .map(entry => entry.index);

    if (matchedIndexes.length === 0) {
      return { content: `${content.slice(0, maxCharacters)}\n\n[Truncated]`, truncated: true };
    }

    const collected: string[] = [];
    let used = 0;
    for (const matchIndex of matchedIndexes.slice(0, 4)) {
      const start = Math.max(0, matchIndex - 4);
      const end = Math.min(lines.length, matchIndex + 5);
      const snippet = lines.slice(start, end).join('\n');
      if (used + snippet.length > maxCharacters) {
        break;
      }
      collected.push(`// lines ${start + 1}-${end}\n${snippet}`);
      used += snippet.length;
    }

    if (collected.length === 0) {
      return { content: `${content.slice(0, maxCharacters)}\n\n[Truncated]`, truncated: true };
    }

    return { content: `${collected.join('\n\n')}\n\n[Truncated]`, truncated: true };
  }

  private resolveImportCandidates(basePath: string): string[] {
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.java', '.go', '.rs', '.cs'];
    const results: string[] = [];
    for (const extension of extensions) {
      const candidate = `${basePath}${extension}`;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        results.push(candidate);
      }
    }

    for (const extension of ['.ts', '.tsx', '.js', '.jsx']) {
      const indexCandidate = path.join(basePath, `index${extension}`);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        results.push(indexCandidate);
      }
    }

    return results;
  }
}