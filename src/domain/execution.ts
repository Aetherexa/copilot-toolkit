import { PromptDefinition } from './prompt';
import { ResolvedContext } from './context';
import { Workflow, WorkflowStep } from './workflow';

export interface PromptExecutionRequest {
  prompt: PromptDefinition;
  assembledPrompt: string;
  resolvedContext: ResolvedContext[];
  estimatedInputTokens?: number;
}

export type PromptExecutionStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface PromptExecutionUsage {
  estimatedInputTokens?: number;
  actualInputTokens?: number;
  outputTokens?: number;
}

export interface PromptExecutionRecord {
  id: string;
  promptId: string;
  promptName: string;
  timestamp: number;
  providerId: string;
  providerName: string;
  modelId?: string;
  modelName?: string;
  status: PromptExecutionStatus;
  durationMs: number;
  usage: PromptExecutionUsage;
  contextItemCount: number;
  requestPreview: string;
  responsePreview?: string;
  responseText?: string;
  error?: string;
}

export interface WorkflowStepExecutionRecord {
  stepId: string;
  stepName: string;
  status: PromptExecutionStatus;
  durationMs: number;
  providerId?: string;
  providerName?: string;
  modelId?: string;
  modelName?: string;
  usage: PromptExecutionUsage;
  outputPreview?: string;
  outputText?: string;
  error?: string;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  timestamp: number;
  status: PromptExecutionStatus;
  durationMs: number;
  steps: WorkflowStepExecutionRecord[];
  finalOutput?: string;
  error?: string;
}

export interface PromptExecutionResult {
  success: boolean;
  providerId: string;
  modelId?: string;
  providerName?: string;
  modelName?: string;
  responseText?: string;
  usage?: PromptExecutionUsage;
  durationMs?: number;
  cancelled?: boolean;
  error?: string;
}

export interface PromptExecutionProgress {
  executionId: string;
  providerId: string;
  modelId?: string;
  providerName?: string;
  modelName?: string;
  chunk?: string;
  status: PromptExecutionStatus;
  usage?: PromptExecutionUsage;
  error?: string;
}

export interface WorkflowExecutionRequest {
  workflow: Workflow;
  prompts: PromptDefinition[];
}

export interface WorkflowExecutionProgress {
  executionId: string;
  workflowId: string;
  stepId?: string;
  stepName?: string;
  status: PromptExecutionStatus;
  chunk?: string;
  error?: string;
}

export interface WorkflowExecutionResult {
  success: boolean;
  cancelled?: boolean;
  record: WorkflowExecutionRecord;
}