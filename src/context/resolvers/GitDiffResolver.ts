import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GitService } from '../../services/GitService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class GitDiffResolver implements ContextResolver {
  readonly type = 'gitDiff' as const;

  constructor(
    private readonly gitService: GitService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const diff = await this.gitService.getDiff(binding.options?.includeStaged !== false, binding.options?.includeUnstaged !== false);
    if (!diff) {
      return undefined;
    }

    const maxCharacters = binding.options?.maxCharacters ?? Math.min((binding.options?.maxTokens ?? 700) * 4, 20_000);
    const truncated = diff.length > maxCharacters;
    const content = truncated ? `${diff.slice(0, maxCharacters)}\n\n[Truncated]` : diff;
    return {
      type: this.type,
      title: 'Git Diff',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(diff),
      truncated,
      relevanceScore: 90,
      reason: 'Current staged and unstaged code changes',
      source: { label: 'Git working tree' },
    };
  }
}