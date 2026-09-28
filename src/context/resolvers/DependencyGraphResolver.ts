import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { GraphQueryService } from '../../services/GraphQueryService';
import { TokenEstimator } from '../../services/TokenEstimator';

export class DependencyGraphResolver implements ContextResolver {
  readonly type = 'dependencyGraph' as const;

  constructor(
    private readonly graphQuery: GraphQueryService,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activePath) {
      return undefined;
    }

    const depth = binding.options?.depth ?? 2;
    const graph = this.graphQuery.buildDependencyGraph(activePath, depth, false);
    const content = [
      'Nodes:',
      ...graph.nodes.map(node => `- ${node.label} (${node.file})`),
      'Edges:',
      ...graph.edges.map(edge => `- ${edge.source} -> ${edge.target} [${edge.type}]`),
    ].join('\n');

    return {
      type: this.type,
      title: 'Dependency Graph',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(content),
      truncated: false,
      relevanceScore: 64,
      reason: 'Bounded static dependency graph for the current file.',
      source: { label: 'Workspace graph' },
    };
  }
}