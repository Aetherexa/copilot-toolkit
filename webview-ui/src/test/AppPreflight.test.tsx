import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PromptDefinition, PromptPreview, StudioPersistedState } from '../types';

const prompt: PromptDefinition = {
  id: 'prompt-1',
  name: 'Review Component',
  category: 'Review',
  tags: ['react'],
  body: 'Review this component',
  context: [{ type: 'currentFile', enabled: true, label: 'Current File' }],
  contextBudgetTokens: 1800,
  providerId: 'github-copilot',
  modelId: 'copilot-default',
  createdAt: 1,
  updatedAt: 1,
};

const preparedPreview: PromptPreview = {
  requestId: 'prepared-1',
  prompt: '# Task\n\nReview this component',
  promptTokens: 6,
  contextTokens: 0,
  totalTokens: 6,
  contextBudgetTokens: 1800,
  totalCandidateContextTokens: 0,
  utilizationPercent: 0,
  excludedContextCount: 0,
  resolvedContext: [],
};

const persistedState: StudioPersistedState = {
  tabs: [{
    id: 'tab-1',
    prompt,
    savedPrompt: prompt,
  }],
  activeTabId: 'tab-1',
  selectedCollectionId: null,
  activeNav: 'Prompt Editor',
  searchQuery: '',
  activeWorkbenchTab: 'preview',
  selectedExecutionId: null,
  selectedWorkflowExecutionId: null,
  selectedWorkflowId: null,
  mapReverse: false,
  mapDepth: 2,
};

type AnyProps = Record<string, unknown>;
let capturedPreviewProps: AnyProps | null = null;
let capturedEditorProps: AnyProps | null = null;
let capturedProviderProps: AnyProps | null = null;
const postedMessages: unknown[] = [];

async function loadApp() {
  (globalThis as typeof globalThis & { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage(message: unknown) {
      postedMessages.push(message);
    },
    setState() {},
    getState() {
      return persistedState;
    },
  });

  const previewModule = require('../components/PromptPreview') as { PromptPreview: React.ComponentType<AnyProps> };
  previewModule.PromptPreview = props => {
    capturedPreviewProps = props;
    return <div data-testid="preflight">Pre-flight Request Review</div>;
  };

  const editorModule = require('../components/PromptEditor') as { PromptEditor: React.ComponentType<AnyProps> };
  editorModule.PromptEditor = props => {
    capturedEditorProps = props;
    return <div data-testid="prompt-editor">Review Component</div>;
  };

  const providerModule = require('../components/ProviderSelector') as { ProviderSelector: React.ComponentType<AnyProps> };
  providerModule.ProviderSelector = props => {
    capturedProviderProps = props;
    return <div data-testid="provider-selector">Provider</div>;
  };

  return (await import('../App')).default;
}

test('App exposes review-first execution controls for an active prompt', async () => {
  postedMessages.length = 0;
  const App = await loadApp();
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Review Request/);
  assert.match(html, /Pre-flight Request Review/);
  assert.match(html, /Review Component/);
  assert.ok(capturedPreviewProps);

  (capturedPreviewProps.onRebuild as () => void)();

  assert.deepEqual(postedMessages.at(-1), {
    type: 'context.preview',
    payload: { prompt, context: prompt.context },
  });
});

test('App executes the exact prepared request from pre-flight review', async () => {
  postedMessages.length = 0;
  capturedPreviewProps = null;
  const App = await loadApp();
  const html = renderToStaticMarkup(<App initialPreview={preparedPreview} />);

  assert.match(html, /Run Reviewed Request/);
  assert.ok(capturedPreviewProps);
  assert.equal(capturedPreviewProps.preview, preparedPreview);

  (capturedPreviewProps.onRunReviewed as () => void)();

  assert.deepEqual(postedMessages.at(-1), {
    type: 'prompt.run',
    payload: {
      prompt,
      context: prompt.context,
      preparedRequestId: 'prepared-1',
      assembledPromptOverride: undefined,
    },
  });
});

test('App invalidates prepared review state when prompt or provider inputs change', async () => {
  postedMessages.length = 0;
  capturedPreviewProps = null;
  capturedEditorProps = null;
  capturedProviderProps = null;
  const App = await loadApp();

  renderToStaticMarkup(<App initialPreview={preparedPreview} />);

  assert.ok(capturedEditorProps);
  assert.ok(capturedProviderProps);
  assert.ok(capturedPreviewProps);

  (capturedEditorProps.onChange as (next: PromptDefinition) => void)({
    ...prompt,
    body: 'Review the updated component',
  });
  (capturedProviderProps.onSelect as (providerId: string, modelId: string) => void)(
    'github-copilot',
    'model-2',
  );
  (capturedPreviewProps.onEdit as () => void)();
  (capturedPreviewProps.onCancelEdit as () => void)();

  assert.equal(postedMessages.length, 0);
});
