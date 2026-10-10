import type { CancellationToken, ExtensionContext } from 'vscode';
import { ContextEngine } from '../context/ContextEngine';
import { ResolvedContext } from '../domain/context';
import { PromptExecutionProgress, PromptExecutionRecord, PromptExecutionRequest, PromptExecutionResult } from '../domain/execution';
import { PromptDefinition, PromptPreview } from '../domain/prompt';
import { PromptAssembler } from '../prompts/PromptAssembler';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { TokenEstimator } from './TokenEstimator';
import { ExecutionHistoryStore } from './ExecutionHistoryStore';
import { recordExecution } from '../analytics';
import { redactSecrets } from './SecretRedactor';

export interface ExecutionRunResult {
  preview: PromptPreview;
  result: PromptExecutionResult;
  record: PromptExecutionRecord;
}

export interface PreparedPromptExecution {
  preview: PromptPreview;
  request: PromptExecutionRequest;
}

export interface CancellationSourceLike {
  token: CancellationToken;
  cancel(): void;
  dispose(): void;
}

export interface EditorSnapshot {
  languageId: string;
  fileName: string;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function previewText(value: string | undefined): string | undefined {
  return value ? value.slice(0, 1200) : undefined;
}

export class ExecutionEngine {
  private readonly active = new Map<string, CancellationSourceLike>();

  constructor(
    private readonly context: ExtensionContext,
    private readonly contextEngine: ContextEngine,
    private readonly promptAssembler: PromptAssembler,
    private readonly providerRegistry: ProviderRegistry,
    private readonly tokenEstimator: TokenEstimator,
    private readonly historyStore: ExecutionHistoryStore,
    private readonly cancellationFactory: () => CancellationSourceLike,
    private readonly getEditorSnapshot: () => EditorSnapshot,
    private readonly beforeContextResolve?: (prompt: PromptDefinition) => Promise<void>,
    private readonly shouldStoreHistoryContent: () => boolean = () => false,
  ) {}

  getHistory(): PromptExecutionRecord[] {
    return this.historyStore.load();
  }

  async deleteHistory(executionId: string): Promise<PromptExecutionRecord[]> {
    return this.historyStore.delete(executionId);
  }

  async clearHistory(): Promise<void> {
    await this.historyStore.clear();
  }

  async runPrompt(
    prompt: PromptDefinition,
    onProgress: (event: PromptExecutionProgress) => void,
  ): Promise<ExecutionRunResult> {
    const prepared = await this.preparePrompt(prompt);
    return this.executePreparedPrompt(prompt, prepared, onProgress);
  }

  async preparePrompt(prompt: PromptDefinition, extraContext: ResolvedContext[] = []): Promise<PreparedPromptExecution> {
    await this.beforeContextResolve?.(prompt);
    const requestedContextBudget = prompt.contextBudgetTokens ?? 1800;
    const promptTokens = this.tokenEstimator.estimate(this.promptAssembler.assemble(prompt, []));
    const providerId = prompt.providerId ?? 'github-copilot';
    const model = this.providerRegistry.getModel(providerId, prompt.modelId);
    const effectiveContextBudget = model?.maxInputTokens
      ? Math.min(requestedContextBudget, Math.max(0, model.maxInputTokens - promptTokens - 256))
      : requestedContextBudget;
    const resolution = await this.contextEngine.resolve(
      prompt.context,
      effectiveContextBudget,
      extraContext,
    );
    const mergedContext = resolution.items;
    const contextTokens = resolution.includedTokens;
    const assembledPrompt = this.promptAssembler.assemble(prompt, mergedContext);
    const sanitizedPrompt = redactSecrets(assembledPrompt).text;
    const estimatedInputTokens = this.tokenEstimator.estimate(sanitizedPrompt);
    if (model?.maxInputTokens && estimatedInputTokens > model.maxInputTokens) {
      throw new Error(
        `Assembled request exceeds the selected model input limit (${estimatedInputTokens}/${model.maxInputTokens} tokens estimated).`,
      );
    }
    return {
      preview: {
        prompt: sanitizedPrompt,
        promptTokens,
        contextTokens,
        totalTokens: estimatedInputTokens,
        contextBudgetTokens: effectiveContextBudget,
        totalCandidateContextTokens: resolution.totalCandidateTokens,
        utilizationPercent: resolution.utilizationPercent,
        excludedContextCount: mergedContext.filter(item => item.status === 'excluded').length,
        resolvedContext: mergedContext,
      },
      request: {
        prompt,
        assembledPrompt: sanitizedPrompt,
        resolvedContext: mergedContext,
        estimatedInputTokens,
      },
    };
  }

  prepareEditedPrompt(
    prompt: PromptDefinition,
    prepared: PreparedPromptExecution,
    assembledPrompt: string,
  ): PreparedPromptExecution {
    const sanitizedPrompt = redactSecrets(assembledPrompt).text;
    const estimatedInputTokens = this.tokenEstimator.estimate(sanitizedPrompt);
    const providerId = prompt.providerId ?? 'github-copilot';
    const model = this.providerRegistry.getModel(providerId, prompt.modelId);

    if (model?.maxInputTokens && estimatedInputTokens > model.maxInputTokens) {
      throw new Error(
        `Edited request exceeds the selected model input limit (${estimatedInputTokens}/${model.maxInputTokens} tokens estimated).`,
      );
    }

    return {
      preview: {
        ...prepared.preview,
        prompt: sanitizedPrompt,
        totalTokens: estimatedInputTokens,
      },
      request: {
        ...prepared.request,
        prompt,
        assembledPrompt: sanitizedPrompt,
        estimatedInputTokens,
      },
    };
  }

  async executePreparedPrompt(
    prompt: PromptDefinition,
    prepared: PreparedPromptExecution,
    onProgress: (event: PromptExecutionProgress) => void,
  ): Promise<ExecutionRunResult> {
    const executionId = createId();
    const cancellation = this.cancellationFactory();
    this.active.set(executionId, cancellation);
    const startedAt = Date.now();

    try {
      const provider = this.providerRegistry.get(prompt.providerId ?? 'github-copilot');
      if (!provider) {
        throw new Error('Selected provider is unavailable.');
      }

      const model = this.providerRegistry.getModel(provider.definition.id, prompt.modelId);
      onProgress({
        executionId,
        providerId: provider.definition.id,
        modelId: model?.id,
        providerName: provider.definition.displayName ?? provider.definition.name,
        modelName: model?.name,
        status: 'running',
      });

      const result = await provider.execute(
        prepared.request,
        event => onProgress({ ...event, executionId }),
        cancellation.token,
      );
      const durationMs = Date.now() - startedAt;
      const record: PromptExecutionRecord = {
        id: executionId,
        promptId: prompt.id,
        promptName: prompt.name,
        timestamp: Date.now(),
        providerId: result.providerId,
        providerName: result.providerName ?? provider.definition.displayName ?? provider.definition.name,
        modelId: result.modelId,
        modelName: result.modelName ?? model?.name,
        status: result.cancelled ? 'cancelled' : result.success ? 'success' : 'error',
        durationMs,
        usage: {
          estimatedInputTokens: prepared.request.estimatedInputTokens,
          actualInputTokens: result.usage?.actualInputTokens,
          outputTokens: result.usage?.outputTokens,
        },
        contextItemCount: prepared.request.resolvedContext.filter(item => item.status !== 'excluded').length,
        requestPreview: prepared.preview.prompt,
        responsePreview: previewText(result.responseText),
        responseText: result.responseText,
        error: result.error,
      };

      const persistedRecord = this.shouldStoreHistoryContent()
        ? record
        : {
          ...record,
          requestPreview: '[Content not retained]',
          responsePreview: undefined,
          responseText: undefined,
        };
      await this.historyStore.save(persistedRecord);
      const editor = this.getEditorSnapshot();
      await recordExecution(this.context.globalState, {
        mode: 'single',
        skillNames: (prompt.skillIds?.length ?? 0) > 0 ? prompt.skillIds! : ['studio'],
        promptLabel: prompt.name,
        languageId: editor.languageId,
        fileName: editor.fileName,
        providerId: record.providerId,
        modelId: record.modelId,
        success: result.success,
        durationMs,
        inputTokens: prepared.request.estimatedInputTokens,
        outputTokens: result.usage?.outputTokens,
        contextItems: record.contextItemCount,
      });

      return { preview: prepared.preview, result: { ...result, durationMs }, record };
    } finally {
      this.active.delete(executionId);
      cancellation.dispose();
    }
  }

  cancel(executionId: string): boolean {
    const source = this.active.get(executionId);
    if (!source) {
      return false;
    }

    source.cancel();
    this.active.delete(executionId);
    return true;
  }
}