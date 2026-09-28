import * as path from 'path';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { WorkspaceIndexService } from '../../services/WorkspaceIndexService';
import { buildFileContexts } from './resolverUtils';

export class OpenEditorsResolver implements ContextResolver {
  readonly type = 'openEditors' as const;

  constructor(private readonly workspaceIndex: WorkspaceIndexService) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext[]> {
    const maxFiles = binding.options?.maxFiles ?? 4;
    const openFiles = await this.workspaceIndex.getOpenEditorFiles();
    const focusTerms = openFiles[0] ? [path.basename(openFiles[0].absolutePath, path.extname(openFiles[0].absolutePath))] : [];
    return buildFileContexts(
      this.type,
      binding,
      this.workspaceIndex,
      openFiles.slice(0, maxFiles).map((file, index) => ({
        file,
        score: 74 - index,
        reason: 'Currently open in the editor',
      })),
      focusTerms,
    );
  }
}