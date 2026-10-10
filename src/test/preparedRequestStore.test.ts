import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptDefinition } from '../domain/prompt';
import { PreparedPromptExecution } from '../services/ExecutionEngine';
import { PreparedRequestStore } from '../services/PreparedRequestStore';

function prompt(id: string): PromptDefinition {
  return {
    id,
    name: id,
    category: 'Test',
    tags: [],
    body: 'Review this code',
    context: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function prepared(value: string): PreparedPromptExecution {
  const definition = prompt(value);
  return {
    preview: {
      prompt: value,
      promptTokens: 1,
      contextTokens: 0,
      totalTokens: 1,
      contextBudgetTokens: 100,
      totalCandidateContextTokens: 0,
      utilizationPercent: 0,
      excludedContextCount: 0,
      resolvedContext: [],
    },
    request: {
      prompt: definition,
      assembledPrompt: value,
      resolvedContext: [],
      estimatedInputTokens: 1,
    },
  };
}

test('PreparedRequestStore creates an opaque preview id and consumes the exact prepared request once', () => {
  const ids = ['request-1'];
  const store = new PreparedRequestStore(12, () => ids.shift() ?? 'fallback');
  const definition = prompt('prompt-1');
  const exact = prepared('assembled');

  const preview = store.store(definition, exact);

  assert.equal(preview.requestId, 'request-1');
  assert.equal(preview.prompt, 'assembled');
  assert.equal(store.size, 1);

  const consumed = store.consume('request-1', undefined, () => {
    throw new Error('edit callback should not run');
  });

  assert.equal(consumed?.prompt, definition);
  assert.equal(consumed?.prepared, exact);
  assert.equal(store.size, 0);
  assert.equal(store.consume('request-1', undefined, () => exact), undefined);
});

test('PreparedRequestStore applies a one-run manual override through the supplied validator', () => {
  const store = new PreparedRequestStore(12, () => 'request-edit');
  const definition = prompt('prompt-edit');
  const exact = prepared('generated');
  const edited = prepared('edited');
  let editInput: string | undefined;

  store.store(definition, exact);
  const consumed = store.consume(
    'request-edit',
    'edited request',
    (receivedPrompt, receivedPrepared, override) => {
      assert.equal(receivedPrompt, definition);
      assert.equal(receivedPrepared, exact);
      editInput = override;
      return edited;
    },
  );

  assert.equal(editInput, 'edited request');
  assert.equal(consumed?.prepared, edited);
  assert.equal(store.size, 0);
});

test('PreparedRequestStore evicts oldest previews and keeps the configured bounded size', () => {
  let id = 0;
  const store = new PreparedRequestStore(2, () => `request-${++id}`);

  store.store(prompt('p1'), prepared('one'));
  store.store(prompt('p2'), prepared('two'));
  store.store(prompt('p3'), prepared('three'));

  assert.equal(store.size, 2);
  assert.equal(store.consume('request-1', undefined, () => prepared('unused')), undefined);
  assert.equal(store.consume('request-2', undefined, () => prepared('unused'))?.prepared.preview.prompt, 'two');
  assert.equal(store.consume('request-3', undefined, () => prepared('unused'))?.prepared.preview.prompt, 'three');
});

test('PreparedRequestStore clear removes all cached previews', () => {
  const store = new PreparedRequestStore(12, () => 'request-clear');
  store.store(prompt('p1'), prepared('one'));

  store.clear();

  assert.equal(store.size, 0);
  assert.equal(store.consume('request-clear', undefined, () => prepared('unused')), undefined);
});
