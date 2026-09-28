import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GraphQueryService } from '../../services/GraphQueryService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class ArchitectureSummaryResolver implements ContextResolver {
  readonly type = 'architectureSummary' as const;

  constructor(
    private readonly graphQuery: GraphQueryService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(_binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const summary = this.graphQuery.buildArchitectureSummary(activePath);
    return {
      type: this.type,
      title: 'Architecture Summary',
      content: summary.content,
      tokenEstimate: this.tokenEstimator.estimate(summary.content),
      originalTokenEstimate: this.tokenEstimator.estimate(summary.content),
      truncated: false,
      relevanceScore: 66,
      reason: `${summary.reason} Confidence: ${summary.confidence}.`,
      source: { label: 'Workspace intelligence' },
      metadata: { confidence: summary.confidence },
    };
  }
}