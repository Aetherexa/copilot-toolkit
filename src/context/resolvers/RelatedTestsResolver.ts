import * as path from 'path';
import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { WorkspaceIndexService } from '../../services/WorkspaceIndexService';
import { RelatedFilesEngine } from '../RelatedFilesEngine';
import { buildFileContexts } from './resolverUtils';

export class RelatedTestsResolver implements ContextResolver {
  readonly type = 'relatedTests' as const;

  constructor(
    private readonly relatedFilesEngine: RelatedFilesEngine,
    private readonly workspaceIndex: WorkspaceIndexService,
  ) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext[]> {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activePath) {
      return [];
    }

    const maxFiles = binding.options?.maxFiles ?? 4;
    const ranked = await this.relatedFilesEngine.rankRelatedTests(activePath, maxFiles);
    return buildFileContexts(this.type, binding, this.workspaceIndex, ranked, [path.basename(activePath, path.extname(activePath))]);
  }
}