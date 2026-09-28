import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GraphQueryService } from '../../services/GraphQueryService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class WorkspaceSummaryResolver implements ContextResolver {
  readonly type = 'workspaceSummary' as const;

  constructor(
    private readonly graphQuery: GraphQueryService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(_binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const content = this.graphQuery.buildWorkspaceSummary();
    if (!content) {
      return undefined;
    }

    return {
      type: this.type,
      title: 'Workspace Summary',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(content),
      truncated: false,
      relevanceScore: 60,
      reason: 'High-level workspace and project metadata summary',
      source: { label: 'Workspace index' },
    };
  }
}