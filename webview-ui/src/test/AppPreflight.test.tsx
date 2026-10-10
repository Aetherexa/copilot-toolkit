import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PromptDefinition, StudioPersistedState } from '../types';

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

test('App exposes review-first execution controls for an active prompt', async () => {
  (globalThis as typeof globalThis & { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage() {},
    setState() {},
    getState() {
      return persistedState;
    },
  });

  const { default: App } = await import('../App');
  const html = renderToStaticMarkup(<App />);

  assert.match(html, /Review Request/);
  assert.match(html, /Pre-flight Request Review/);
  assert.match(html, /Build Request Preview/);
  assert.match(html, /Review Component/);
});
