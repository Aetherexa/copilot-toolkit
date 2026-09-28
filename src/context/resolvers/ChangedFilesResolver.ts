import * as path from 'path';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GitService } from '../../services/GitService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class ChangedFilesResolver implements ContextResolver {
  readonly type = 'changedFiles' as const;

  constructor(
    private readonly gitService: GitService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(_binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const changedFiles = await this.gitService.getChangedFiles();
    if (changedFiles.length === 0) {
      return undefined;
    }

    const content = changedFiles.slice(0, 12).map(file => `- [${file.status}] ${file.path}`).join('\n');
    return {
      type: this.type,
      title: 'Changed Files',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(content),
      truncated: changedFiles.length > 12,
      relevanceScore: 68,
      reason: 'Files currently modified in the repository',
      source: { label: path.basename((await this.gitService.getRepositoryRoot()) ?? 'workspace') },
      metadata: {
        fileCount: changedFiles.length,
      },
    };
  }
}