import { ContextBinding } from './context';

export type PromptSource = 'workspace' | 'imported' | 'builtin';

export interface PromptDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  body: string;
  skillIds?: string[];
  favorite?: boolean;
  context: ContextBinding[];
  contextBudgetTokens?: number;
  providerId?: string;
  modelId?: string;
  source?: PromptSource;
  createdAt: number;
  updatedAt: number;
}

export interface PromptCollection {
  id: string;
  name: string;
  promptIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptRepositorySnapshot {
  prompts: PromptDefinition[];
  collections: PromptCollection[];
}

export interface PromptExportPayload {
  schemaVersion: 1;
  kind: 'prompt';
  prompt: PromptDefinition;
}

export interface CollectionExportPayload {
  schemaVersion: 1;
  kind: 'collection';
  collection: PromptCollection;
  prompts: PromptDefinition[];
}

export interface PromptPreview {
  /** Opaque identifier for the exact prepared request represented by this preview. */
  requestId?: string;
  prompt: string;
  promptTokens: number;
  contextTokens: number;
  totalTokens: number;
  contextBudgetTokens: number;
  totalCandidateContextTokens: number;
  utilizationPercent: number;
  excludedContextCount: number;
  resolvedContext: import('./context').ResolvedContext[];
}