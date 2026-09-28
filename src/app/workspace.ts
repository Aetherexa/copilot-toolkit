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

export function getConfigPath(key: 'promptFolder' | 'skillFile' | 'skillsFolder'): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) {
    return undefined;
  }

  const cfg = vscode.workspace.getConfiguration('copilotToolkit');
  const relative: string = cfg.get(key) ?? '';
  return path.join(root, relative);
}