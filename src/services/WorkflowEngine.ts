import type { ExtensionContext } from 'vscode';
import { ResolvedContext } from '../domain/context';
import {
  WorkflowExecutionProgress,
  WorkflowExecutionRecord,
  WorkflowExecutionResult,
  WorkflowStepExecutionRecord,
} from '../domain/execution';
import { PromptDefinition } from '../domain/prompt';
import { Workflow, WorkflowStep } from '../domain/workflow';
import { ExecutionEngine } from './ExecutionEngine';
import { TokenEstimator } from './TokenEstimator';
import { WorkflowHistoryStore } from './WorkflowHistoryStore';
import { recordExecution } from '../analytics';

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function previousOutputContext(previousOutput: string, tokenEstimator: TokenEstimator): ResolvedContext {
  return {
    type: 'workspaceSummary',
    title: 'Previous Step Output',
    content: previousOutput,
    tokenEstimate: tokenEstimator.estimate(previousOutput),
    originalTokenEstimate: tokenEstimator.estimate(previousOutput),
    truncated: false,
    relevanceScore: 85,
    reason: 'Previous workflow step output chained into this step',
    source: { label: 'Workflow chaining' },
  };
}

function buildStepPrompt(step: WorkflowStep, promptDefinition: PromptDefinition | undefined): PromptDefinition {
  const now = Date.now();
  return {
    id: promptDefinition?.id ?? `workflow-inline-${step.id}`,
    name: step.name,
    description: promptDefinition?.description ?? '',
    category: promptDefinition?.category ?? 'Workflow Step',
    tags: promptDefinition?.tags ?? ['workflow'],
    body: step.inlinePrompt ?? promptDefinition?.body ?? '',
    favorite: false,
    context: step.contextBindings ?? promptDefinition?.context ?? [],
    contextBudgetTokens: promptDefinition?.contextBudgetTokens ?? 1800,
    providerId: step.providerId ?? promptDefinition?.providerId,
    modelId: step.modelId ?? promptDefinition?.modelId,
    source: 'workspace',
    createdAt: promptDefinition?.createdAt ?? now,
    updatedAt: now,
  };
}

export class WorkflowEngine {
  private readonly active = new Map<string, { cancelled: boolean; currentExecutionId?: string }>();

  constructor(
    private readonly context: ExtensionContext,
    private readonly executionEngine: ExecutionEngine,
    private readonly historyStore: WorkflowHistoryStore,
    private readonly tokenEstimator: TokenEstimator,
    private readonly shouldStoreHistoryContent: () => boolean = () => false,
  ) {}

  getHistory(): WorkflowExecutionRecord[] {
    return this.historyStore.load();
  }

  async deleteHistory(executionId: string): Promise<WorkflowExecutionRecord[]> {
    return this.historyStore.delete(executionId);
  }

  async clearHistory(): Promise<void> {
    await this.historyStore.clear();
  }

  async runWorkflow(
    workflow: Workflow,
    prompts: PromptDefinition[],
    onProgress: (event: WorkflowExecutionProgress) => void,
  ): Promise<WorkflowExecutionResult> {
    const executionId = createId();
    const control: { cancelled: boolean; currentExecutionId?: string } = { cancelled: false };
    this.active.set(executionId, control);
    const startedAt = Date.now();
    const stepRecords: WorkflowStepExecutionRecord[] = [];
    let previousOutput = '';
    let fatalError: string | undefined;

    try {
      for (const step of workflow.steps) {
        if (!step.enabled) {
          continue;
        }

        if (control.cancelled) {
          break;
        }

        onProgress({ executionId, workflowId: workflow.id, stepId: step.id, stepName: step.name, status: 'running' });
        const promptDefinition = prompts.find(prompt => prompt.id === step.promptId);
        const stepPrompt = buildStepPrompt(step, promptDefinition);
        const extraContext = step.inputFromPreviousStep && previousOutput
          ? [previousOutputContext(previousOutput, this.tokenEstimator)]
          : [];

        try {
          const prepared = await this.executionEngine.preparePrompt(stepPrompt, extraContext);
          const run = await this.executionEngine.executePreparedPrompt(stepPrompt, prepared, event => {
            control.currentExecutionId = event.executionId || control.currentExecutionId;
            if (event.chunk) {
              onProgress({
                executionId,
                workflowId: workflow.id,
                stepId: step.id,
                stepName: step.name,
                status: event.status,
                chunk: event.chunk,
              });
            }
          });
          control.currentExecutionId = undefined;

          const stepRecord: WorkflowStepExecutionRecord = {
            stepId: step.id,
            stepName: step.name,
            status: run.record.status,
            durationMs: run.record.durationMs,
            providerId: run.record.providerId,
            providerName: run.record.providerName,
            modelId: run.record.modelId,
            modelName: run.record.modelName,
            usage: run.record.usage,
            outputPreview: run.record.responsePreview,
            outputText: run.record.responseText,
            error: run.record.error,
          };
          stepRecords.push(stepRecord);
          previousOutput = run.record.responseText ?? previousOutput;
          onProgress({ executionId, workflowId: workflow.id, stepId: step.id, stepName: step.name, status: stepRecord.status });

          if (stepRecord.status !== 'success' && !step.continueOnFailure) {
            fatalError = stepRecord.error ?? `${step.name} failed.`;
            break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : `${step.name} failed.`;
          const failed: WorkflowStepExecutionRecord = {
            stepId: step.id,
            stepName: step.name,
            status: control.cancelled ? 'cancelled' : 'error',
            durationMs: 0,
            usage: {},
            error: message,
          };
          stepRecords.push(failed);
          onProgress({ executionId, workflowId: workflow.id, stepId: step.id, stepName: step.name, status: failed.status, error: message });
          if (!step.continueOnFailure) {
            fatalError = message;
            break;
          }
        }
      }

      const status = control.cancelled
        ? 'cancelled'
        : fatalError
          ? 'error'
          : 'success';
      const record: WorkflowExecutionRecord = {
        id: executionId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        timestamp: Date.now(),
        status,
        durationMs: Date.now() - startedAt,
        steps: stepRecords,
        finalOutput: previousOutput,
        error: fatalError,
      };

      const persistedRecord = this.shouldStoreHistoryContent()
        ? record
        : {
          ...record,
          steps: record.steps.map(step => ({
            ...step,
            outputPreview: undefined,
            outputText: undefined,
          })),
          finalOutput: undefined,
        };
      await this.historyStore.save(persistedRecord);
      await recordExecution(this.context.globalState, {
        mode: 'workflow',
        skillNames: ['workflow'],
        promptLabel: workflow.name,
        languageId: 'workflow',
        fileName: workflow.name,
        success: status === 'success',
        durationMs: record.durationMs,
        inputTokens: stepRecords.reduce((sum, step) => sum + (step.usage.estimatedInputTokens ?? 0), 0),
        outputTokens: stepRecords.reduce((sum, step) => sum + (step.usage.outputTokens ?? 0), 0),
        contextItems: stepRecords.length,
      });

      return {
        success: status === 'success',
        cancelled: status === 'cancelled',
        record,
      };
    } finally {
      this.active.delete(executionId);
    }
  }

  cancel(executionId: string): boolean {
    const control = this.active.get(executionId);
    if (!control) {
      return false;
    }
    control.cancelled = true;
    if (control.currentExecutionId) {
      this.executionEngine.cancel(control.currentExecutionId);
    }
    return true;
  }
}