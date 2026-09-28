import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GraphQueryService } from '../../services/GraphQueryService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class CurrentFeatureResolver implements ContextResolver {
  readonly type = 'currentFeature' as const;

  constructor(
    private readonly graphQuery: GraphQueryService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(_binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activePath) {
      return undefined;
    }

    const summary = this.graphQuery.buildCurrentFeatureSummary(activePath);
    return {
      type: this.type,
      title: 'Current Feature',
      content: summary.content,
      tokenEstimate: this.tokenEstimator.estimate(summary.content),
      originalTokenEstimate: this.tokenEstimator.estimate(summary.content),
      truncated: false,
      relevanceScore: 62,
      reason: `${summary.reason} Confidence: ${summary.confidence}.`,
      source: { label: 'Feature inference' },
      metadata: { confidence: summary.confidence },
    };
  }
}