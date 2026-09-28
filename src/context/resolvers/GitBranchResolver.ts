import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GitService } from '../../services/GitService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class GitBranchResolver implements ContextResolver {
  readonly type = 'gitBranch' as const;

  constructor(
    private readonly gitService: GitService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(_binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const branch = await this.gitService.getCurrentBranch();
    if (!branch) {
      return undefined;
    }

    const content = `Current branch: ${branch}`;
    return {
      type: this.type,
      title: 'Current Branch',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(content),
      truncated: false,
      relevanceScore: 40,
      reason: 'Current Git branch context',
      source: { label: 'Git branch' },
    };
  }
}