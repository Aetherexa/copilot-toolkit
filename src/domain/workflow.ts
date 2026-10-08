import { ContextBinding } from './context';

export interface WorkflowStep {
  id: string;
  name: string;
  promptId?: string;
  inlinePrompt?: string;
  skillIds?: string[];
  contextBindings?: ContextBinding[];
  providerId?: string;
  modelId?: string;
  enabled: boolean;
  continueOnFailure?: boolean;
  inputFromPreviousStep?: boolean;
}

export type WorkflowSource = 'builtin' | 'workspace';

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  source?: WorkflowSource;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRepositorySnapshot {
  workflows: Workflow[];
}

export interface WorkflowExportPayload {
  schemaVersion: 1;
  kind: 'workflow';
  workflow: Workflow;
}