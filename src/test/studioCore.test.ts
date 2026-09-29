import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine } from '../context/ContextEngine';
import { ContextRanker } from '../context/ContextRanker';
import { ContextRegistry } from '../context/ContextRegistry';
import { ContextBinding, ContextResolver, ResolvedContext } from '../domain/context';
import { PromptDefinition } from '../domain/prompt';
import { PromptAssembler } from '../prompts/PromptAssembler';
import { TokenEstimator } from '../services/TokenEstimator';
import { redactSecrets } from '../services/SecretRedactor';

class StubResolver implements ContextResolver {
  constructor(
    readonly type: ContextBinding['type'],
    private readonly value?: ResolvedContext | ResolvedContext[],
  ) {}

  async resolve(): Promise<ResolvedContext | ResolvedContext[] | undefined> {
    return this.value;
  }
}

function makePrompt(context: ContextBinding[] = []): PromptDefinition {
  return {
    id: 'prompt-1',
    name: 'Prompt',
    category: 'Review',
    tags: [],
    body: 'Inspect this code.',
    context,
    createdAt: 1,
    updatedAt: 1,
  };
}

test('TokenEstimator is deterministic and uses a character heuristic', () => {
  const estimator = new TokenEstimator();
  assert.equal(estimator.estimate(''), 0);
  assert.equal(estimator.estimate('abcd'), 1);
  assert.equal(estimator.estimate('abcdefgh'), 2);
});

test('ContextRegistry returns registered resolvers by type', () => {
  const registry = new ContextRegistry();
  const resolver = new StubResolver('currentFile');
  registry.register(resolver);
  assert.equal(registry.get('currentFile'), resolver);
  assert.equal(registry.get('gitDiff'), undefined);
});

test('ContextEngine ignores disabled bindings and unavailable resolvers', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('currentFile', {
    type: 'currentFile',
    title: 'Current File',
    content: 'const a = 1;',
    tokenEstimate: 3,
    truncated: false,
  }));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([
    { type: 'currentSelection', enabled: false },
    { type: 'currentFile', enabled: true },
    { type: 'gitDiff', enabled: true },
  ]);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].type, 'currentFile');
});

test('ContextEngine preserves binding order across multiple resolvers', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('currentSelection', {
    type: 'currentSelection',
    title: 'Selected Code',
    content: 'line 2',
    tokenEstimate: 2,
    truncated: false,
  }));
  registry.register(new StubResolver('currentFile', {
    type: 'currentFile',
    title: 'Current File',
    content: 'line 1',
    tokenEstimate: 2,
    truncated: false,
  }));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([
    { type: 'currentSelection', enabled: true },
    { type: 'currentFile', enabled: true },
  ]);

  assert.deepEqual(result.items.map(item => item.type), ['currentSelection', 'currentFile']);
});

test('secret redactor removes common credential values before provider assembly', () => {
  const result = redactSecrets([
    'API_KEY=super-secret-value',
    'Authorization: Bearer abc.def.ghi',
    'github_pat_abcdefghijklmnopqrstuvwxyz123456',
  ].join('\n'));

  assert.equal(result.redactionCount, 3);
  assert.doesNotMatch(result.text, /super-secret-value/);
  assert.doesNotMatch(result.text, /abc\.def\.ghi/);
  assert.doesNotMatch(result.text, /github_pat_abcdefghijklmnopqrstuvwxyz123456/);
  assert.match(result.text, /\[REDACTED\]/);
});

test('ContextEngine excludes sensitive files and redacts secret-like values', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('currentFile', {
    type: 'currentFile',
    title: 'Current File',
    content: 'PASSWORD=do-not-send',
    tokenEstimate: 5,
    truncated: false,
    source: { path: '/repo/.env' },
  }));
  registry.register(new StubResolver('gitDiff', {
    type: 'gitDiff',
    title: 'Git Diff',
    content: 'client_secret = visible-secret',
    tokenEstimate: 5,
    truncated: false,
  }));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([
    { type: 'currentFile', enabled: true },
    { type: 'gitDiff', enabled: true },
  ]);

  const sensitive = result.items.find(item => item.type === 'currentFile');
  const diff = result.items.find(item => item.type === 'gitDiff');
  assert.equal(sensitive?.status, 'excluded');
  assert.match(sensitive?.excludedReason ?? '', /Sensitive file/);
  assert.doesNotMatch(diff?.content ?? '', /visible-secret/);
  assert.match(diff?.content ?? '', /\[REDACTED\]/);
});

test('ContextEngine deduplicates the same file across context categories', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('relatedFiles', {
    type: 'relatedFiles',
    title: 'service.ts',
    content: 'export const service = 1;',
    tokenEstimate: 6,
    truncated: false,
    source: { path: '/repo/src/service.ts' },
  }));
  registry.register(new StubResolver('openEditors', {
    type: 'openEditors',
    title: 'service.ts',
    content: 'export const service = 1;',
    tokenEstimate: 6,
    truncated: false,
    source: { path: '/repo/src/service.ts' },
  }));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([
    { type: 'relatedFiles', enabled: true },
    { type: 'openEditors', enabled: true },
  ]);

  assert.equal(result.items.filter(item => item.status === 'included').length, 1);
  assert.equal(result.items.filter(item => item.status === 'excluded').length, 1);
});

test('ContextEngine budgets additional workflow context instead of appending it outside the limit', async () => {
  const engine = new ContextEngine(new ContextRegistry(), new ContextRanker(), new TokenEstimator());
  const extra: ResolvedContext = {
    type: 'workspaceSummary',
    title: 'Previous Step Output',
    content: 'x'.repeat(800),
    tokenEstimate: 200,
    originalTokenEstimate: 200,
    truncated: false,
    relevanceScore: 85,
  };

  const result = await engine.resolve([], 100, [extra]);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, 'included');
  assert.equal(result.items[0].truncated, true);
  assert.ok(result.includedTokens <= 100);
  assert.equal(result.totalCandidateTokens, 200);
});

test('PromptAssembler allows empty context', () => {
  const assembler = new PromptAssembler();
  const output = assembler.assemble(makePrompt(), []);
  assert.equal(output, '# Task\n\nInspect this code.');
});

test('PromptAssembler assembles multiple context sections predictably', () => {
  const assembler = new PromptAssembler();
  const output = assembler.assemble(makePrompt(), [
    { type: 'currentFile', title: 'Current File', content: 'const a = 1;', tokenEstimate: 3, truncated: false },
    { type: 'currentSelection', title: 'Selected Code', content: 'a += 1;', tokenEstimate: 2, truncated: false },
  ]);

  assert.match(output, /# Task/);
  assert.match(output, /# Context/);
  assert.match(output, /## Current File/);
  assert.match(output, /## Selected Code/);
});

test('PromptAssembler excludes contexts marked as excluded', () => {
  const assembler = new PromptAssembler();
  const output = assembler.assemble(makePrompt(), [
    { type: 'currentFile', title: 'Current File', content: 'const a = 1;', tokenEstimate: 3, truncated: false, status: 'included' },
    { type: 'gitDiff', title: 'Git Diff', content: 'diff --git', tokenEstimate: 2, truncated: false, status: 'excluded' },
  ]);

  assert.match(output, /Current File/);
  assert.doesNotMatch(output, /Git Diff/);
});