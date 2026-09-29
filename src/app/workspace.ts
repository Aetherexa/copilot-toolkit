import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const ROOT_MARKERS = [
  '.git',
  'package.json',
  'tsconfig.json',
  'pom.xml',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  '.sln',
];

function isContainedPath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function realPathIfPresent(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

export function getWorkspaceRoot(): string | undefined {
  const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (wsFolder) {
    return wsFolder;
  }

  const activeFile = vscode.window.activeTextEditor?.document?.uri;
  if (!activeFile || activeFile.scheme !== 'file') {
    return undefined;
  }

  let dir = path.dirname(activeFile.fsPath);
  for (let index = 0; index < 10; index += 1) {
    const hasMarker = ROOT_MARKERS.some(marker => {
      try {
        if (marker === '.sln') {
          return fs.readdirSync(dir).some(file => file.endsWith('.sln') || file.endsWith('.csproj'));
        }

        return fs.existsSync(path.join(dir, marker));
      } catch {
        return false;
      }
    });

    if (hasMarker) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return path.dirname(activeFile.fsPath);
}

/**
 * Resolves a configured workspace-relative path without allowing path traversal
 * or symlink escapes outside the current workspace root.
 */
export function resolveWorkspacePath(root: string, configuredPath: string): string | undefined {
  const value = configuredPath.trim();
  if (!value) {
    return undefined;
  }

  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, value);
  if (!isContainedPath(resolvedRoot, candidate)) {
    return undefined;
  }

  const realRoot = realPathIfPresent(resolvedRoot);
  const realCandidate = realPathIfPresent(candidate);
  if (!isContainedPath(realRoot, realCandidate)) {
    return undefined;
  }

  return candidate;
}

export function getConfigPath(key: 'promptFolder' | 'skillFile' | 'skillsFolder'): string | undefined {
  if (!vscode.workspace.isTrusted) {
    return undefined;
  }

  const root = getWorkspaceRoot();
  if (!root) {
    return undefined;
  }

  const cfg = vscode.workspace.getConfiguration('copilotToolkit');
  const configured = cfg.get<string>(key, '');
  return resolveWorkspacePath(root, configured);
}
