import { ContextBinding, ResolvedContext } from './context';
import { PromptExecutionRecord, WorkflowExecutionRecord } from './execution';
import { GraphView, IndexingStatus } from './graph';
import { PromptCollection, PromptDefinition, PromptPreview } from './prompt';
import { AIProvider } from './provider';
import { Workflow } from './workflow';

export interface StudioBootstrapPayload {
  prompts: PromptDefinition[];
  collections: PromptCollection[];
  activePrompt: PromptDefinition;
  providers: AIProvider[];
  executionHistory: PromptExecutionRecord[];
  workflows: Workflow[];
  workflowHistory: WorkflowExecutionRecord[];
  indexingStatus: IndexingStatus;
  unsupportedContextTypes: string[];
}

export interface ContextPreviewRequest {
  type: 'context.preview';
  payload: {
    prompt: PromptDefinition;
    context: ContextBinding[];
  };
}

export interface PromptSaveRequest {
  type: 'prompt.save';
  payload: {
    prompt: PromptDefinition;
    mode?: 'save' | 'saveAs';
  };
}

export interface PromptCreateRequest {
  type: 'prompt.create';
  payload?: {
    name?: string;
  };
}

export interface PromptDeleteRequest {
  type: 'prompt.delete';
  payload: {
    promptId: string;
  };
}

export interface PromptDuplicateRequest {
  type: 'prompt.duplicate';
  payload: {
    promptId: string;
  };
}

export interface PromptFavoriteRequest {
  type: 'prompt.favorite';
  payload: {
    promptId: string;
    favorite: boolean;
  };
}

export interface CollectionCreateRequest {
  type: 'collection.create';
  payload?: {
    name?: string;
  };
}

export interface CollectionRenameRequest {
  type: 'collection.rename';
  payload: {
    collectionId: string;
    name: string;
  };
}

export interface CollectionDeleteRequest {
  type: 'collection.delete';
  payload: {
    collectionId: string;
  };
}

export interface CollectionAddPromptRequest {
  type: 'collection.addPrompt';
  payload: {
    collectionId: string;
    promptId: string;
  };
}

export interface CollectionRemovePromptRequest {
  type: 'collection.removePrompt';
  payload: {
    collectionId: string;
    promptId: string;
  };
}

export interface ImportRequest {
  type: 'import.open';
}

export interface ExportPromptRequest {
  type: 'export.prompt';
  payload: {
    promptId: string;
  };
}

export interface ExportCollectionRequest {
  type: 'export.collection';
  payload: {
    collectionId: string;
  };
}

export interface ProviderRefreshRequest {
  type: 'provider.refresh';
}

export interface ExecutionCancelRequest {
  type: 'execution.cancel';
  payload: {
    executionId: string;
  };
}

export interface ExecutionDeleteRequest {
  type: 'execution.delete';
  payload: {
    executionId: string;
  };
}

export interface ExecutionClearRequest {
  type: 'execution.clear';
}

export interface GraphViewRequest {
  type: 'graph.view';
  payload: {
    filePath?: string;
    depth: number;
    reverse: boolean;
  };
}

export interface OpenFileRequest {
  type: 'workspace.openFile';
  payload: {
    filePath: string;
  };
}

export interface WorkflowSaveRequest {
  type: 'workflow.save';
  payload: {
    workflow: Workflow;
  };
}

export interface WorkflowCreateRequest {
  type: 'workflow.create';
  payload?: {
    name?: string;
  };
}

export interface WorkflowDeleteRequest {
  type: 'workflow.delete';
  payload: {
    workflowId: string;
  };
}

export interface WorkflowDuplicateRequest {
  type: 'workflow.duplicate';
  payload: {
    workflowId: string;
  };
}

export interface WorkflowImportRequest {
  type: 'workflow.import';
}

export interface WorkflowExportRequest {
  type: 'workflow.export';
  payload: {
    workflowId: string;
  };
}

export interface WorkflowRunRequest {
  type: 'workflow.run';
  payload: {
    workflow: Workflow;
  };
}

export interface WorkflowCancelRequest {
  type: 'workflow.cancel';
  payload: {
    executionId: string;
  };
}

export interface WorkflowHistoryDeleteRequest {
  type: 'workflow.history.delete';
  payload: {
    executionId: string;
  };
}

export interface WorkflowHistoryClearRequest {
  type: 'workflow.history.clear';
}

export interface PromptRunRequest {
  type: 'prompt.run';
  payload: {
    prompt: PromptDefinition;
    context: ContextBinding[];
  };
}

export interface StudioReadyRequest {
  type: 'studio.ready';
}

export type StudioWebviewMessage =
  | StudioReadyRequest
  | ContextPreviewRequest
  | PromptSaveRequest
  | PromptRunRequest
  | PromptCreateRequest
  | PromptDeleteRequest
  | PromptDuplicateRequest
  | PromptFavoriteRequest
  | CollectionCreateRequest
  | CollectionRenameRequest
  | CollectionDeleteRequest
  | CollectionAddPromptRequest
  | CollectionRemovePromptRequest
  | ImportRequest
  | ExportPromptRequest
  | ExportCollectionRequest
  | ProviderRefreshRequest
  | ExecutionCancelRequest
  | ExecutionDeleteRequest
  | ExecutionClearRequest
  | GraphViewRequest
  | OpenFileRequest
  | WorkflowSaveRequest
  | WorkflowCreateRequest
  | WorkflowDeleteRequest
  | WorkflowDuplicateRequest
  | WorkflowImportRequest
  | WorkflowExportRequest
  | WorkflowRunRequest
  | WorkflowCancelRequest
  | WorkflowHistoryDeleteRequest
  | WorkflowHistoryClearRequest;

export interface StudioBootstrapMessage {
  type: 'studio.bootstrap';
  payload: StudioBootstrapPayload;
}

export interface ContextPreviewResultMessage {
  type: 'context.previewResult';
  payload: PromptPreview;
}

export interface PromptRunningMessage {
  type: 'prompt.running';
  payload: {
    executionId: string;
    providerId: string;
    modelId?: string;
    providerName?: string;
    modelName?: string;
  };
}

export interface PromptOutputMessage {
  type: 'prompt.output';
  payload: {
    executionId: string;
    chunk: string;
  };
}

export interface PromptResultMessage {
  type: 'prompt.result';
  payload: {
    executionId: string;
    success: boolean;
    prompt: string;
    resolvedContext: ResolvedContext[];
    record?: PromptExecutionRecord;
    message?: string;
  };
}

export interface ExecutionHistoryMessage {
  type: 'execution.history';
  payload: {
    history: PromptExecutionRecord[];
  };
}

export interface ProviderUpdatedMessage {
  type: 'provider.updated';
  payload: {
    providers: AIProvider[];
  };
}

export interface GraphViewResultMessage {
  type: 'graph.viewResult';
  payload: {
    view: GraphView;
    status: IndexingStatus;
  };
}

export interface IndexStatusMessage {
  type: 'index.status';
  payload: {
    status: IndexingStatus;
  };
}

export interface WorkflowProgressMessage {
  type: 'workflow.progress';
  payload: {
    executionId: string;
    workflowId: string;
    stepId?: string;
    stepName?: string;
    status: 'running' | 'success' | 'error' | 'cancelled';
    chunk?: string;
    error?: string;
  };
}

export interface WorkflowResultMessage {
  type: 'workflow.result';
  payload: {
    executionId: string;
    success: boolean;
    record: WorkflowExecutionRecord;
    message?: string;
  };
}

export interface WorkflowHistoryMessage {
  type: 'workflow.history';
  payload: {
    history: WorkflowExecutionRecord[];
  };
}

export interface ErrorMessage {
  type: 'error';
  payload: {
    message: string;
  };
}

export interface NoticeMessage {
  type: 'notice';
  payload: {
    message: string;
  };
}

export type StudioExtensionMessage =
  | StudioBootstrapMessage
  | ContextPreviewResultMessage
  | PromptRunningMessage
  | PromptOutputMessage
  | PromptResultMessage
  | ExecutionHistoryMessage
  | ProviderUpdatedMessage
  | GraphViewResultMessage
  | IndexStatusMessage
  | WorkflowProgressMessage
  | WorkflowResultMessage
  | WorkflowHistoryMessage
  | ErrorMessage
  | NoticeMessage;