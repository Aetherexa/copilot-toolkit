import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PromptPreview } from '../components/PromptPreview';
import type { PromptPreview as PromptPreviewModel } from '../types';

const noop = () => undefined;

function makePreview(overrides: Partial<PromptPreviewModel> = {}): PromptPreviewModel {
  return {
    requestId: 'prepared-1',
    prompt: '# Task\n\nReview the component.\n\n# Context\n\n## Current File\nconst value = 1;',
    promptTokens: 12,
    contextTokens: 8,
    totalTokens: 20,
    contextBudgetTokens: 100,
    totalCandidateContextTokens: 30,
    utilizationPercent: 8,
    excludedContextCount: 1,
    resolvedContext: [
      {
        type: 'currentFile',
        title: 'Current File',
        content: 'const value = 1;',
        tokenEstimate: 5,
        originalTokenEstimate: 5,
        truncated: false,
        relevanceScore: 95,
        reason: 'Active editor',
        status: 'included',
        source: { label: 'Editor', path: '/repo/src/value.ts' },
      },
      {
        type: 'workspaceSummary',
        title: 'Low relevance summary',
        content: 'summary',
        tokenEstimate: 3,
        originalTokenEstimate: 3,
        truncated: false,
        relevanceScore: 20,
        excludedReason: 'Outside token budget',
        status: 'excluded',
        source: { label: 'Workspace' },
      },
    ],
    ...overrides,
  };
}

function render(props: Partial<React.ComponentProps<typeof PromptPreview>> = {}): string {
  return renderToStaticMarkup(
    <PromptPreview
      preview={null}
      editedPrompt={null}
      editing={false}
      running={false}
      onEdit={noop}
      onCancelEdit={noop}
      onChangeEditedPrompt={noop}
      onRebuild={noop}
      onRunReviewed={noop}
      {...props}
    />,
  );
}

test('PromptPreview shows a pre-flight empty state before a request is prepared', () => {
  const html = render();

  assert.match(html, /Pre-flight Request Review/);
  assert.match(html, /Build Request Preview/);
  assert.match(html, /resolve context, apply skills, redact secrets/i);
});

test('PromptPreview renders the exact prepared request, metrics and resolved context', () => {
  const html = render({
    preview: makePreview(),
    editedPrompt: makePreview().prompt,
    providerName: 'GitHub Copilot',
    modelName: 'Model 1',
  });

  assert.match(html, /Exact request prepared/);
  assert.match(html, /Prompt Tokens/);
  assert.match(html, /Included Context/);
  assert.match(html, /Candidate Tokens/);
  assert.match(html, /GitHub Copilot/);
  assert.match(html, /Model 1/);
  assert.match(html, /Current File/);
  assert.match(html, /Included · 5 tokens/);
  assert.match(html, /Excluded · 3 tokens/);
  assert.match(html, /Outside token budget/);
  assert.match(html, /Generated from Prompt + Skills + Context/);
  assert.match(html, /Run Reviewed Request/);
});

test('PromptPreview renders manual one-run overrides with updated token estimate and safety notice', () => {
  const preview = makePreview();
  const edited = preview.prompt + '\n\nOnly return critical findings.';
  const html = render({
    preview,
    editedPrompt: edited,
    editing: true,
  });

  assert.match(html, /Edited Total/);
  assert.match(html, /Manual one-run override/);
  assert.match(html, /Manual override applies only to this execution/);
  assert.match(html, /redacted and validated again/);
  assert.match(html, /Reset to Generated/);
  assert.match(html, /Run Edited Request/);
  assert.match(html, /Only return critical findings/);
});

test('PromptPreview exposes running state and disables reviewed execution while active', () => {
  const preview = makePreview();
  const html = render({
    preview,
    editedPrompt: preview.prompt,
    running: true,
    runningMessage: 'Running with github-copilot',
  });

  assert.match(html, /Running with github-copilot/);
  assert.match(html, />Running\.\.\.</);
  assert.match(html, /disabled/);
});
