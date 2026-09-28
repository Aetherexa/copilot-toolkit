import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GitService } from '../../services/GitService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class RecentCommitsResolver implements ContextResolver {
  readonly type = 'recentCommits' as const;

  constructor(
    private readonly gitService: GitService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const commitCount = binding.options?.recentCommitCount ?? 5;
    const commits = await this.gitService.getRecentCommits(commitCount);
    if (commits.length === 0) {
      return undefined;
    }

    const content = commits.map(commit => `- ${commit.hash} ${commit.subject} (${commit.relativeDate})`).join('\n');
    return {
      type: this.type,
      title: 'Recent Commits',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(content),
      truncated: false,
      relevanceScore: 58,
      reason: 'Recent Git history for surrounding changes',
      source: { label: 'Git log' },
    };
  }
}