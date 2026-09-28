import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { getWorkspaceRoot } from '../app/workspace';

const execFileAsync = promisify(execFile);

export interface GitChangedFile {
  path: string;
  status: string;
}

export interface GitCommitSummary {
  hash: string;
  subject: string;
  relativeDate: string;
}

type Runner = (args: string[], cwd: string) => Promise<string>;

export class GitService {
  private cache = new Map<string, { timestamp: number; value: string }>();

  constructor(private readonly runner: Runner = async (args, cwd) => {
    const result = await execFileAsync('git', args, { cwd, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    return result.stdout.trim();
  }) {}

  async getRepositoryRoot(): Promise<string | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return undefined;
    }

    try {
      const output = await this.runCached(['rev-parse', '--show-toplevel'], workspaceRoot, 'repo-root');
      return output || workspaceRoot;
    } catch {
      return undefined;
    }
  }

  async getCurrentBranch(): Promise<string | undefined> {
    const repoRoot = await this.getRepositoryRoot();
    if (!repoRoot) {
      return undefined;
    }

    try {
      return await this.runCached(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot, 'branch');
    } catch {
      return undefined;
    }
  }

  async getDiff(includeStaged = true, includeUnstaged = true): Promise<string | undefined> {
    const repoRoot = await this.getRepositoryRoot();
    if (!repoRoot) {
      return undefined;
    }

    const chunks: string[] = [];
    if (includeStaged) {
      const staged = await this.tryRun(['diff', '--cached', '--no-ext-diff', '--unified=2'], repoRoot, 'diff-staged');
      if (staged) {
        chunks.push(`## Staged Changes\n${staged}`);
      }
    }
    if (includeUnstaged) {
      const unstaged = await this.tryRun(['diff', '--no-ext-diff', '--unified=2'], repoRoot, 'diff-unstaged');
      if (unstaged) {
        chunks.push(`## Unstaged Changes\n${unstaged}`);
      }
    }

    return chunks.length > 0 ? chunks.join('\n\n') : undefined;
  }

  async getChangedFiles(): Promise<GitChangedFile[]> {
    const repoRoot = await this.getRepositoryRoot();
    if (!repoRoot) {
      return [];
    }

    const output = await this.tryRun(['status', '--short'], repoRoot, 'status-short');
    if (!output) {
      return [];
    }

    return output.split(/\r?\n/)
      .map(line => line.trimEnd())
      .filter(Boolean)
      .map(line => ({
        status: line.slice(0, 2).trim() || 'M',
        path: line.slice(3).trim().replace(/\\/g, '/'),
      }));
  }

  async getRecentCommits(count: number): Promise<GitCommitSummary[]> {
    const repoRoot = await this.getRepositoryRoot();
    if (!repoRoot) {
      return [];
    }

    const output = await this.tryRun(['log', `-n${count}`, '--pretty=format:%h|%s|%cr'], repoRoot, `log-${count}`);
    if (!output) {
      return [];
    }

    return output.split(/\r?\n/)
      .filter(Boolean)
      .map(line => {
        const [hash, subject, relativeDate] = line.split('|');
        return { hash, subject, relativeDate };
      });
  }

  async wasFileRecentlyChanged(filePath: string): Promise<boolean> {
    const repoRoot = await this.getRepositoryRoot();
    if (!repoRoot) {
      return false;
    }

    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const changedFiles = await this.getChangedFiles();
    return changedFiles.some(file => file.path === relativePath);
  }

  private async tryRun(args: string[], cwd: string, key: string): Promise<string | undefined> {
    try {
      return await this.runCached(args, cwd, key);
    } catch {
      return undefined;
    }
  }

  private async runCached(args: string[], cwd: string, key: string): Promise<string> {
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.timestamp < 3_000) {
      return cached.value;
    }

    const value = await this.runner(args, cwd);
    this.cache.set(key, { timestamp: now, value });
    return value;
  }
}