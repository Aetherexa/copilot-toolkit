import { ContextBinding, ContextType, ResolvedContext } from '../../domain/context';
import { WorkspaceFileInfo, WorkspaceIndexService } from '../../services/WorkspaceIndexService';

export async function buildFileContexts(
  type: ContextType,
  binding: ContextBinding,
  workspaceIndex: WorkspaceIndexService,
  rankedFiles: Array<{ file: WorkspaceFileInfo; score: number; reason: string }>,
  focusTerms: string[] = [],
): Promise<ResolvedContext[]> {
  const maxTokens = binding.options?.maxTokens ?? 220;
  const items: ResolvedContext[] = [];

  for (const ranked of rankedFiles) {
    const excerpt = await workspaceIndex.readFileExcerpt(ranked.file.absolutePath, maxTokens, focusTerms);
    if (!excerpt) {
      continue;
    }

    items.push({
      type,
      title: ranked.file.name,
      content: excerpt.content,
      tokenEstimate: excerpt.tokenEstimate,
      originalTokenEstimate: excerpt.originalTokenEstimate,
      truncated: excerpt.truncated,
      relevanceScore: ranked.score,
      reason: ranked.reason,
      source: {
        path: ranked.file.absolutePath,
        uri: ranked.file.absolutePath,
        label: ranked.file.relativePath,
      },
      metadata: {
        fileName: ranked.file.name,
        relativePath: ranked.file.relativePath,
        lineCount: excerpt.lineCount,
      },
    });
  }

  return items;
}