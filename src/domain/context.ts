export type ContextType =
  | 'currentFile'
  | 'currentSelection'
  | 'selectedFiles'
  | 'relatedFiles'
  | 'openEditors'
  | 'currentFolder'
  | 'changedFiles'
  | 'architectureSummary'
  | 'dependencyGraph'
  | 'currentFeature'
  | 'gitDiff'
  | 'gitBranch'
  | 'recentCommits'
  | 'relatedTests'
  | 'relatedApis'
  | 'workspaceSummary'
  | 'stackGenome';

export interface ContextOptions {
  maxTokens?: number;
  depth?: number;
  maxFiles?: number;
  includeImports?: boolean;
  includeComments?: boolean;
  detail?: 'low' | 'medium' | 'high';
  maxCharacters?: number;
  recentCommitCount?: number;
  includeStaged?: boolean;
  includeUnstaged?: boolean;
  totalBudgetTokens?: number;
  filePaths?: string[];
  stackGenomeProfile?: 'auto' | 'compact' | 'standard' | 'detailed';
}

export interface ContextBinding {
  type: ContextType;
  enabled: boolean;
  label?: string;
  options?: ContextOptions;
}

export interface ContextSource {
  uri?: string;
  path?: string;
  languageId?: string;
  label?: string;
  selection?: {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
}

export type ContextStatus = 'included' | 'excluded';

export interface ResolvedContext {
  type: ContextType;
  title: string;
  content: string;
  tokenEstimate: number;
  truncated: boolean;
  source?: ContextSource;
  status?: ContextStatus;
  relevanceScore?: number;
  reason?: string;
  excludedReason?: string;
  originalTokenEstimate?: number;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface ContextResolutionSummary {
  items: ResolvedContext[];
  budgetTokens: number;
  totalCandidateTokens: number;
  includedTokens: number;
  excludedCount: number;
  utilizationPercent: number;
}

export interface ContextResolver {
  readonly type: ContextType;
  resolve(binding: ContextBinding): Promise<ResolvedContext | ResolvedContext[] | undefined>;
}