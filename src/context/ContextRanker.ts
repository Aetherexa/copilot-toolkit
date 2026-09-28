import { ResolvedContext } from '../domain/context';

const DEFAULT_SCORES: Partial<Record<ResolvedContext['type'], number>> = {
  currentSelection: 100,
  currentFile: 95,
  gitDiff: 90,
  relatedFiles: 80,
  relatedTests: 76,
  openEditors: 74,
  currentFolder: 70,
  changedFiles: 68,
  workspaceSummary: 60,
  recentCommits: 58,
  gitBranch: 40,
};

export class ContextRanker {
  rank(items: ResolvedContext[]): ResolvedContext[] {
    return [...items].sort((left, right) => {
      const leftScore = left.relevanceScore ?? DEFAULT_SCORES[left.type] ?? 50;
      const rightScore = right.relevanceScore ?? DEFAULT_SCORES[right.type] ?? 50;
      return rightScore - leftScore
        || left.type.localeCompare(right.type)
        || (left.source?.path ?? left.title).localeCompare(right.source?.path ?? right.title);
    });
  }
}