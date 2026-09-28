import * as path from 'path';
import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { WorkspaceIndexService } from '../../services/WorkspaceIndexService';
import { buildFileContexts } from './resolverUtils';

export class CurrentFolderResolver implements ContextResolver {
  readonly type = 'currentFolder' as const;

  constructor(private readonly workspaceIndex: WorkspaceIndexService) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext[]> {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activePath) {
      return [];
    }

    const maxFiles = binding.options?.maxFiles ?? 5;
    const depth = binding.options?.depth ?? 1;
    const files = await this.workspaceIndex.getCurrentFolderFiles(activePath, maxFiles, depth);
    return buildFileContexts(
      this.type,
      binding,
      this.workspaceIndex,
      files.map((file, index) => ({
        file,
        score: 70 - index,
        reason: 'Nearby file in the current folder',
      })),
      [path.basename(activePath, path.extname(activePath))],
    );
  }
}