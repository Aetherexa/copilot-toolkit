import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { WorkspaceIndexService } from '../../services/WorkspaceIndexService';
import { buildFileContexts } from './resolverUtils';

const MAX_SELECTED_FILES = 20;

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export class SelectedFilesResolver implements ContextResolver {
  readonly type = 'selectedFiles' as const;

  constructor(private readonly workspaceIndex: WorkspaceIndexService) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext[]> {
    const requestedPaths = [...new Set((binding.options?.filePaths ?? [])
      .map(normalizeRelativePath)
      .filter(Boolean))]
      .slice(0, MAX_SELECTED_FILES);

    if (requestedPaths.length === 0) {
      return [];
    }

    const requested = new Set(requestedPaths);
    const workspaceFiles = await this.workspaceIndex.getWorkspaceFiles();
    const selectedFiles = workspaceFiles
      .filter(file => requested.has(normalizeRelativePath(file.relativePath)))
      .sort((left, right) => requestedPaths.indexOf(normalizeRelativePath(left.relativePath))
        - requestedPaths.indexOf(normalizeRelativePath(right.relativePath)));

    return buildFileContexts(
      this.type,
      binding,
      this.workspaceIndex,
      selectedFiles.map((file, index) => ({
        file,
        score: 98 - Math.min(index, 8),
        reason: 'Manually selected by developer',
      })),
    );
  }
}
