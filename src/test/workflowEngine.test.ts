import test from 'node:test';
import assert from 'node:assert/strict';
import { ResolvedContext } from '../domain/context';
import { PromptExecutionProgress, PromptExecutionRecord, PromptExecutionResult } from '../domain/execution';
import { PromptDefinition } from '../domain/prompt';
import { Workflow } from '../domain/workflow';
import { ExecutionEngine, PreparedPromptExecution } from '../services/ExecutionEngine';
import { TokenEstimator } from '../services/TokenEstimator';
import { WorkflowEngine } from '../services/WorkflowEngine';
import { WorkflowHistoryStore } from '../services/WorkflowHistoryStore';
import { MementoLike } from '../services/ExecutionHistoryStore';

class MemoryMemento implements MementoLike {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.store.get(key) as T | undefined) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

function createPrompt(overrides: Partial<PromptDefinition> = {}): PromptDefinition {
  return {
    id: 'prompt-base',
    name: 'Base Prompt',
    category: 'Test',
    tags: ['test'],
    body: 'Base body',
    context: [{ type: 'currentFile', enabled: true }],
    contextBudgetTokens: 400,
    providerId: 'github-copilot',
    modelId: 'model-default',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createWorkflow(steps: Workflow['steps']): Workflow {
  return {
    id: 'workflow-test',
    name: 'Test Workflow',
    description: 'Workflow used by unit tests',
    steps,
    createdAt: 1,
    updatedAt: 1,
  };
}

interface StubOptions {
  outcomeByStep?: Record<string, 'success' | 'error'>;
  blockStep?: string;
}

function createExecutionStub(options: StubOptions = {}) {
  const executed: string[] = [];
  const preparedPrompts: PromptDefinition[] = [];
  const extraContexts: ResolvedContext[][] = [];
  const cancelled: string[] = [];
  let releaseBlocked: (() => void) | undefined;
  let blocked = false;

  const engine = {
    async preparePrompt(prompt: PromptDefinition, extraContext: ResolvedContext[] = []): Promise<PreparedPromptExecution> {
      preparedPrompts.push(prompt);
      extraContexts.push(extraContext);
      return {
        preview: {
          prompt: prompt.body,
          promptTokens: 1,
          contextTokens: 0,
          totalTokens: 1,
          contextBudgetTokens: prompt.contextBudgetTokens ?? 1800,
          totalCandidateContextTokens: 0,
          utilizationPercent: 0,
          excludedContextCount: 0,
          resolvedContext: extraContext,
        },
        request: {
          prompt,
          assembledPrompt: prompt.body,
          resolvedContext: extraContext,
          estimatedInputTokens: 1,
        },
      };
    },

    async executePreparedPrompt(
      prompt: PromptDefinition,
      prepared: PreparedPromptExecution,
      onProgress: (event: PromptExecutionProgress) => void,
    ) {
      executed.push(prompt.name);
      const executionId = `prompt-${prompt.name}`;
      onProgress({
        executionId,
        providerId: prompt.providerId ?? 'github-copilot',
        modelId: prompt.modelId,
        status: 'running',
      });

      if (options.blockStep === prompt.name) {
        blocked = true;
        await new Promise<void>(resolve => {
          releaseBlocked = resolve;
        });
      }

      const outcome = options.outcomeByStep?.[prompt.name] ?? 'success';
      const success = outcome === 'success';
      const result: PromptExecutionResult = {
        success,
        providerId: prompt.providerId ?? 'github-copilot',
        providerName: 'GitHub Copilot',
        modelId: prompt.modelId,
        modelName: prompt.modelId,
        responseText: success ? `${prompt.name}-output` : undefined,
        error: success ? undefined : `${prompt.name} failed`,
        usage: { estimatedInputTokens: 1, outputTokens: success ? 2 : 0 },
      };
      const record: PromptExecutionRecord = {
        id: executionId,
        promptId: prompt.id,
        promptName: prompt.name,
        timestamp: Date.now(),
        providerId: result.providerId,
        providerName: result.providerName ?? 'GitHub Copilot',
        modelId: result.modelId,
        modelName: result.modelName,
        status: success ? 'success' : 'error',
        durationMs: 1,
        usage: result.usage ?? {},
        contextItemCount: prepared.request.resolvedContext.length,
        requestPreview: prepared.preview.prompt,
        responsePreview: result.responseText,
        responseText: result.responseText,
        error: result.error,
      };

      return { preview: prepared.preview, result, record };
    },

    cancel(executionId: string): boolean {
      cancelled.push(executionId);
      releaseBlocked?.();
      return true;
    },
  } as unknown as ExecutionEngine;

  return {
    engine,
    executed,
    preparedPrompts,
    extraContexts,
    cancelled,
    isBlocked: () => blocked,
  };
}

function createEngine(executionEngine: ExecutionEngine, storeHistoryContent = false) {
  const analyticsState = new MemoryMemento();
  const historyState = new MemoryMemento();
  const historyStore = new WorkflowHistoryStore(historyState);
  const workflowEngine = new WorkflowEngine(
    { globalState: analyticsState } as never,
    executionEngine,
    historyStore,
    new TokenEstimator(),
    () => storeHistoryContent,
  );

  return { workflowEngine, historyStore };
}

test('WorkflowEngine executes enabled steps sequentially and chains previous output', async () => {
  const stub = createExecutionStub();
  const { workflowEngine } = createEngine(stub.engine);
  const workflow = createWorkflow([
    { id: 'step-1', name: 'First', inlinePrompt: 'First body', enabled: true },
    { id: 'step-2', name: 'Disabled', inlinePrompt: 'Skip me', enabled: false },
    { id: 'step-3', name: 'Third', inlinePrompt: 'Third body', enabled: true, inputFromPreviousStep: true },
  ]);

  const result = await workflowEngine.runWorkflow(workflow, [], () => undefined);

  assert.equal(result.success, true);
  assert.deepEqual(stub.executed, ['First', 'Third']);
  assert.equal(result.record.steps.length, 2);
  assert.equal(result.record.finalOutput, 'Third-output');
  assert.equal(stub.extraContexts[0].length, 0);
  assert.equal(stub.extraContexts[1][0]?.title, 'Previous Step Output');
  assert.equal(stub.extraContexts[1][0]?.content, 'First-output');
});

test('WorkflowEngine keeps chaining output in the current run without persisting content by default', async () => {
  const stub = createExecutionStub();
  const { workflowEngine, historyStore } = createEngine(stub.engine);
  const workflow = createWorkflow([
    { id: 'step-1', name: 'First', inlinePrompt: 'First body', enabled: true },
    { id: 'step-2', name: 'Second', inlinePrompt: 'Second body', enabled: true, inputFromPreviousStep: true },
  ]);

  const result = await workflowEngine.runWorkflow(workflow, [], () => undefined);
  const stored = historyStore.load()[0];

  assert.equal(result.record.finalOutput, 'Second-output');
  assert.equal(stub.extraContexts[1][0]?.content, 'First-output');
  assert.equal(stored?.finalOutput, undefined);
  assert.equal(stored?.steps[0]?.outputText, undefined);
});

test('WorkflowEngine persists output content only when explicitly enabled', async () => {
  const stub = createExecutionStub();
  const { workflowEngine, historyStore } = createEngine(stub.engine, true);
  const workflow = createWorkflow([
    { id: 'step-1', name: 'First', inlinePrompt: 'First body', enabled: true },
  ]);

  await workflowEngine.runWorkflow(workflow, [], () => undefined);
  const stored = historyStore.load()[0];

  assert.equal(stored?.finalOutput, 'First-output');
  assert.equal(stored?.steps[0]?.outputText, 'First-output');
});

test('WorkflowEngine stops after a failed step by default', async () => {
  const stub = createExecutionStub({ outcomeByStep: { First: 'error' } });
  const { workflowEngine } = createEngine(stub.engine);
  const workflow = createWorkflow([
    { id: 'step-1', name: 'First', inlinePrompt: 'Fail', enabled: true },
    { id: 'step-2', name: 'Second', inlinePrompt: 'Should not run', enabled: true },
  ]);

  const result = await workflowEngine.runWorkflow(workflow, [], () => undefined);

  assert.equal(result.success, false);
  assert.equal(result.record.status, 'error');
  assert.deepEqual(stub.executed, ['First']);
  assert.match(result.record.error ?? '', /First failed/);
});

test('WorkflowEngine continues after failure when continueOnFailure is enabled', async () => {
  const stub = createExecutionStub({ outcomeByStep: { First: 'error' } });
  const { workflowEngine } = createEngine(stub.engine);
  const workflow = createWorkflow([
    { id: 'step-1', name: 'First', inlinePrompt: 'Fail', enabled: true, continueOnFailure: true },
    { id: 'step-2', name: 'Second', inlinePrompt: 'Continue', enabled: true },
  ]);

  const result = await workflowEngine.runWorkflow(workflow, [], () => undefined);

  assert.equal(result.record.status, 'success');
  assert.deepEqual(stub.executed, ['First', 'Second']);
  assert.equal(result.record.steps[0]?.status, 'error');
  assert.equal(result.record.steps[1]?.status, 'success');
});

test('WorkflowEngine applies per-step provider, model, prompt and context overrides', async () => {
  const stub = createExecutionStub();
  const { workflowEngine } = createEngine(stub.engine);
  const base = createPrompt();
  const workflow = createWorkflow([
    {
      id: 'step-1',
      name: 'Override',
      promptId: base.id,
      inlinePrompt: 'Override body',
      providerId: 'provider-step',
      modelId: 'model-step',
      contextBindings: [{ type: 'gitDiff', enabled: true }],
      enabled: true,
    },
  ]);

  await workflowEngine.runWorkflow(workflow, [base], () => undefined);

  const prepared = stub.preparedPrompts[0];
  assert.equal(prepared.body, 'Override body');
  assert.equal(prepared.providerId, 'provider-step');
  assert.equal(prepared.modelId, 'model-step');
  assert.deepEqual(prepared.context, [{ type: 'gitDiff', enabled: true }]);
});

test('WorkflowEngine cancellation propagates to the active prompt execution', async () => {
  const stub = createExecutionStub({ blockStep: 'First' });
  const { workflowEngine } = createEngine(stub.engine);
  const workflow = createWorkflow([
    { id: 'step-1', name: 'First', inlinePrompt: 'Wait', enabled: true },
    { id: 'step-2', name: 'Second', inlinePrompt: 'Never starts', enabled: true },
  ]);
  let workflowExecutionId = '';

  const runPromise = workflowEngine.runWorkflow(workflow, [], event => {
    workflowExecutionId = event.executionId;
  });

  for (let attempt = 0; attempt < 20 && !stub.isBlocked(); attempt += 1) {
    await Promise.resolve();
  }

  assert.equal(stub.isBlocked(), true);
  assert.equal(workflowExecutionId.length > 0, true);
  assert.equal(workflowEngine.cancel(workflowExecutionId), true);

  const result = await runPromise;

  assert.deepEqual(stub.cancelled, ['prompt-First']);
  assert.equal(result.record.status, 'cancelled');
  assert.deepEqual(stub.executed, ['First']);
});

test('WorkflowHistoryStore keeps newest 30 records and supports delete and clear', async () => {
  const store = new WorkflowHistoryStore(new MemoryMemento());

  for (let index = 0; index < 35; index += 1) {
    await store.save({
      id: `workflow-exec-${index}`,
      workflowId: 'workflow',
      workflowName: 'Workflow',
      timestamp: index,
      status: 'success',
      durationMs: 1,
      steps: [],
    });
  }

  assert.equal(store.load().length, 30);
  assert.equal(store.load()[0]?.id, 'workflow-exec-34');
  assert.equal(store.load()[29]?.id, 'workflow-exec-5');

  await store.delete('workflow-exec-34');
  assert.equal(store.load().some(item => item.id === 'workflow-exec-34'), false);

  await store.clear();
  assert.deepEqual(store.load(), []);
});
