import { ContextBinding, ContextResolutionSummary, ResolvedContext } from '../domain/context';
import { TokenEstimator } from '../services/TokenEstimator';
import { ContextRanker } from './ContextRanker';
import { ContextRegistry } from './ContextRegistry';

export class ContextEngine {
  constructor(
    private readonly registry: ContextRegistry,
    private readonly ranker: ContextRanker,
    private readonly tokenEstimator: TokenEstimator,
  ) {}

  async resolve(bindings: ContextBinding[], budgetTokens = 1800): Promise<ContextResolutionSummary> {
    const resolved: ResolvedContext[] = [];

    for (const binding of bindings) {
      if (!binding.enabled) {
        continue;
      }

      const resolver = this.registry.get(binding.type);
      if (!resolver) {
        continue;
      }

      const result = await resolver.resolve(binding);
      if (result) {
        resolved.push(...(Array.isArray(result) ? result : [result]));
      }
    }

    const ranked = this.ranker.rank(this.removeSelectionDuplication(resolved).map(item => ({
      ...item,
      status: item.status ?? 'included',
      originalTokenEstimate: item.originalTokenEstimate ?? item.tokenEstimate,
    })));
    const deduped = this.excludeDuplicates(ranked);
    const totalCandidateTokens = deduped
      .filter(item => item.status !== 'excluded')
      .reduce((sum, item) => sum + item.tokenEstimate, 0);
    const budgeted = this.applyBudget(deduped, budgetTokens);
    const includedTokens = budgeted
      .filter(item => item.status === 'included')
      .reduce((sum, item) => sum + item.tokenEstimate, 0);
    const excludedCount = budgeted.filter(item => item.status === 'excluded').length;

    return {
      items: budgeted,
      budgetTokens,
      totalCandidateTokens,
      includedTokens,
      excludedCount,
      utilizationPercent: budgetTokens > 0 ? Math.min(100, Math.round((includedTokens / budgetTokens) * 100)) : 0,
    };
  }

  private excludeDuplicates(items: ResolvedContext[]): ResolvedContext[] {
    const seenPaths = new Set<string>();
    const seenContent = new Set<string>();

    return items.map(item => {
      const pathKey = item.source?.path?.toLowerCase();
      const contentKey = item.content.trim().slice(0, 512);
      const duplicateByPath = Boolean(pathKey && seenPaths.has(`${item.type}:${pathKey}`));
      const duplicateByContent = Boolean(contentKey && seenContent.has(`${item.type}:${contentKey}`));

      if (duplicateByPath || duplicateByContent) {
        return {
          ...item,
          status: 'excluded',
          excludedReason: 'Duplicate context omitted',
        };
      }

      if (pathKey) {
        seenPaths.add(`${item.type}:${pathKey}`);
      }
      if (contentKey) {
        seenContent.add(`${item.type}:${contentKey}`);
      }

      return item;
    });
  }

  private applyBudget(items: ResolvedContext[], budgetTokens: number): ResolvedContext[] {
    let remaining = budgetTokens;

    return items.map(item => {
      if (item.status === 'excluded') {
        return item;
      }

      if (item.tokenEstimate <= remaining) {
        remaining -= item.tokenEstimate;
        return { ...item, status: 'included' };
      }

      const allowedCharacters = Math.max(0, remaining * 4);
      if (remaining >= 80 && item.content.length > allowedCharacters) {
        const content = `${item.content.slice(0, allowedCharacters)}\n\n[Trimmed to fit budget]`;
        const tokenEstimate = this.tokenEstimator.estimate(content);
        remaining = Math.max(0, remaining - tokenEstimate);
        return {
          ...item,
          content,
          tokenEstimate,
          truncated: true,
          status: 'included',
          reason: item.reason ? `${item.reason}; trimmed for token budget` : 'Trimmed for token budget',
        };
      }

      return {
        ...item,
        status: 'excluded',
        excludedReason: 'Skipped to stay within context budget',
      };
    });
  }

  private removeSelectionDuplication(items: ResolvedContext[]): ResolvedContext[] {
    const selected = items.find(item => item.type === 'currentSelection' && item.source?.path && item.content);
    if (!selected?.source?.path) {
      return items;
    }

    return items.map(item => {
      if (item.type !== 'currentFile' || item.source?.path !== selected.source?.path) {
        return item;
      }

      const duplicateText = selected.content.trim();
      if (!duplicateText || !item.content.includes(duplicateText)) {
        return item;
      }

      const content = item.content.replace(duplicateText, '[Selected code omitted here to avoid duplication]');
      return {
        ...item,
        content,
        tokenEstimate: this.tokenEstimator.estimate(content),
        originalTokenEstimate: item.originalTokenEstimate ?? item.tokenEstimate,
      };
    });
  }
}