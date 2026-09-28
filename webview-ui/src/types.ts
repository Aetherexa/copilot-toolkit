import { ContextBinding, ContextType, ResolvedContext } from '@shared/domain/context';
import { PromptExecutionRecord, WorkflowExecutionRecord } from '@shared/domain/execution';
import { GraphView, IndexingStatus } from '@shared/domain/graph';
import { StudioBootstrapPayload, StudioExtensionMessage, StudioWebviewMessage } from '@shared/domain/messages';
import { PromptCollection, PromptDefinition, PromptPreview } from '@shared/domain/prompt';
import { AIProvider } from '@shared/domain/provider';
import { Workflow, WorkflowStep } from '@shared/domain/workflow';

export type { ContextBinding, ContextType, ResolvedContext, PromptExecutionRecord, WorkflowExecutionRecord, PromptCollection, PromptDefinition, PromptPreview, AIProvider, GraphView, IndexingStatus, Workflow, WorkflowStep, StudioBootstrapPayload, StudioExtensionMessage, StudioWebviewMessage };

export interface StudioAppState {
  prompts: PromptDefinition[];
  collections: PromptCollection[];
  activePrompt: PromptDefinition | null;
  providers: AIProvider[];
  preview: PromptPreview | null;
  executionHistory: PromptExecutionRecord[];
  workflows: Workflow[];
  workflowHistory: WorkflowExecutionRecord[];
  indexingStatus: IndexingStatus;
  unsupportedContextTypes: string[];
}

export interface PromptTabState {
  id: string;
  prompt: PromptDefinition;
  savedPrompt: PromptDefinition | null;
}

export interface StudioPersistedState {
  tabs: PromptTabState[];
  activeTabId: string | null;
  selectedCollectionId: string | null;
  activeNav: string;
  searchQuery: string;
  activeWorkbenchTab: 'preview' | 'output' | 'history' | 'map';
  selectedExecutionId: string | null;
  selectedWorkflowExecutionId: string | null;
  selectedWorkflowId: string | null;
  mapReverse: boolean;
  mapDepth: number;
}