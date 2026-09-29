import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextRanker } from '../context/ContextRanker';
import { PromptExecutionProgress, PromptExecutionRequest, PromptExecutionResult } from '../domain/execution';
import { PromptDefinition } from '../domain/prompt';
import { PromptAssembler } from '../prompts/PromptAssembler';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { RegisteredProvider } from '../providers/RegisteredProvider';
import { ExecutionEngine } from '../services/ExecutionEngine';
import { ExecutionHistoryStore, MementoLike } from '../services/ExecutionHistoryStore';
import { TokenEstimator } from '../services/TokenEstimator';

function createPrompt(): PromptDefinition {
  return {
    id: 'prompt-1',
    name: 'Prompt',
    category: 'Review',
    tags: ['review'],
    body: 'Review this code',
    context: [],
    contextBudgetTokens: 400,
    providerId: 'github-copilot',
    modelId: 'model-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

class MemoryMemento implements MementoLike {
  private store = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.store.get(key) as T | undefined) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

function createProvider(overrides: Partial<RegisteredProvider> = {}): RegisteredProvider {
  return {
    definition: {
      id: 'github-copilot',
      name: 'GitHub Copilot',
      enabled: true,
      status: 'available',
      models: [{ id: 'model-1', name: 'Model 1', enabled: true }],
    },
    async refreshDefinition() {
      return this.definition;
    },
    async execute(request: PromptExecutionRequest, onProgress: (event: PromptExecutionProgress) => void): Promise<PromptExecutionResult> {
      onProgress({ executionId: '', providerId: 'github-copilot', modelId: 'model-1', status: 'running', chunk: 'hello ' });
      onProgress({ executionId: '', providerId: 'github-copilot', modelId: 'model-1', status: 'running', chunk: 'world' });
      return {
        success: true,
        providerId: 'github-copilot',
        providerName: 'GitHub Copilot',
        modelId: 'model-1',
        modelName: 'Model 1',
        responseText: 'hello world',
        usage: { estimatedInputTokens: request.estimatedInputTokens, outputTokens: 2 },
      };
    },
    ...overrides,
  };
}

function createEngine(provider?: RegisteredProvider, storeHistoryContent = false) {
  const registry = new ProviderRegistry();
  if (provider) {
    registry.register(provider);
  }

  const historyStore = new ExecutionHistoryStore(new MemoryMemento());
  const cancellation = { token: { isCancellationRequested: false }, cancel() { this.token.isCancellationRequested = true; }, dispose() {} };
  const engine = new ExecutionEngine(
    { globalState: new MemoryMemento() } as never,
    {
      async resolve() {
        return {
          items: [],
          budgetTokens: 400,
          totalCandidateTokens: 0,
          includedTokens: 0,
          excludedCount: 0,
          utilizationPercent: 0,
        };
      },
    } as never,
    new PromptAssembler(),
    registry,
    new TokenEstimator(),
    historyStore,
    () => cancellation as never,
    () => ({ languageId: 'typescript', fileName: 'example.ts' }),
    undefined,
    () => storeHistoryContent,
  );

  return { engine, registry, historyStore, cancellation };
}

test('ProviderRegistry refreshes and resolves models', async () => {
  const registry = new ProviderRegistry();
  registry.register(createProvider());

  const providers = await registry.refresh();
  assert.equal(providers.length, 1);
  assert.equal(registry.getModel('github-copilot', 'model-1')?.name, 'Model 1');
});

test('ExecutionHistoryStore enforces bounded retention and serialization', async () => {
  const store = new ExecutionHistoryStore(new MemoryMemento());
  for (let index = 0; index < 55; index += 1) {
    await store.save({
      id: `exec-${index}`,
      promptId: 'p',
      promptName: 'Prompt',
      timestamp: index,
      providerId: 'github-copilot',
      providerName: 'GitHub Copilot',
      status: 'success',
      durationMs: 1,
      usage: {},
      contextItemCount: 0,
      requestPreview: 'request',
    });
  }

  const history = store.load();
  assert.equal(history.length, 50);
  assert.equal(history[0]?.id, 'exec-54');
  assert.equal(history.at(-1)?.id, 'exec-5');
});

test('ExecutionEngine streams progress, stores history, and returns execution metadata', async () => {
  const { engine } = createEngine(createProvider());
  const progress: PromptExecutionProgress[] = [];

  const result = await engine.runPrompt(createPrompt(), event => progress.push(event));

  assert.equal(progress.some(event => event.chunk === 'hello '), true);
  assert.equal(result.record.responseText, 'hello world');
  assert.equal(engine.getHistory().length, 1);
  assert.equal(result.record.status, 'success');
});

test('ExecutionEngine keeps full output for the current run but does not persist content by default', async () => {
  const { engine } = createEngine(createProvider());

  const result = await engine.runPrompt(createPrompt(), () => undefined);
  const stored = engine.getHistory()[0];

  assert.equal(result.record.responseText, 'hello world');
  assert.equal(stored?.requestPreview, '[Content not retained]');
  assert.equal(stored?.responseText, undefined);
});

test('ExecutionEngine can persist content when the user explicitly opts in', async () => {
  const { engine } = createEngine(createProvider(), true);

  await engine.runPrompt(createPrompt(), () => undefined);
  const stored = engine.getHistory()[0];

  assert.match(stored?.requestPreview ?? '', /Review this code/);
  assert.equal(stored?.responseText, 'hello world');
});

test('ExecutionEngine rejects unavailable providers', async () => {
  const { engine } = createEngine();

  await assert.rejects(() => engine.runPrompt(createPrompt(), () => undefined), /Selected provider is unavailable/);
});

test('ExecutionEngine records provider failures', async () => {
  const provider = createProvider({
    async execute() {
      return {
        success: false,
        providerId: 'github-copilot',
        providerName: 'GitHub Copilot',
        modelId: 'model-1',
        error: 'provider failed',
      };
    },
  });
  const { engine } = createEngine(provider);

  const result = await engine.runPrompt(createPrompt(), () => undefined);
  assert.equal(result.record.status, 'error');
  assert.equal(result.record.error, 'provider failed');
});

test('ExecutionEngine cancellation updates provider token state', async () => {
  let release!: () => void;
  const unblock = new Promise<void>(resolve => {
    release = resolve;
  });
  let capturedToken: { isCancellationRequested?: boolean } | undefined;
  const provider = createProvider({
    async execute(_request, onProgress, token) {
      capturedToken = token as never;
      onProgress({ executionId: '', providerId: 'github-copilot', modelId: 'model-1', status: 'running' });
      await unblock;
      return {
        success: false,
        providerId: 'github-copilot',
        providerName: 'GitHub Copilot',
        modelId: 'model-1',
        cancelled: true,
        error: 'Request cancelled.',
      };
    },
  });
  const { engine } = createEngine(provider);
  let executionId = '';

  const runPromise = engine.runPrompt(createPrompt(), event => {
    executionId = event.executionId;
  });

  for (let attempt = 0; attempt < 10 && !executionId; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(executionId.length > 0, true);
  assert.equal(engine.cancel(executionId), true);
  release();
  const result = await runPromise;

  assert.equal(capturedToken?.isCancellationRequested, true);
  assert.equal(result.record.status, 'cancelled');
});