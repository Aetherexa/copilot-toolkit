import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltInPrompts } from '../prompts/BuiltInPrompts';
import { getBuiltInWorkflows } from '../workflows/BuiltInWorkflows';

test('global built-in action catalog has unique stable actions across core developer needs', () => {
  const prompts = getBuiltInPrompts();
  const ids = prompts.map(prompt => prompt.id);
  const categories = new Set(prompts.map(prompt => prompt.category));

  assert.ok(prompts.length >= 20);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(categories.size >= 10);
  assert.ok(ids.includes('builtin-code-review'));
  assert.ok(ids.includes('builtin-debug-root-cause'));
  assert.ok(ids.includes('builtin-generate-tests'));
  assert.ok(ids.includes('builtin-security-review'));
  assert.ok(ids.includes('builtin-performance-review'));
  assert.ok(ids.includes('builtin-change-impact'));
  assert.ok(ids.includes('builtin-architecture-review'));
  assert.ok(ids.includes('builtin-documentation-writer'));

  for (const prompt of prompts) {
    assert.equal(prompt.source, 'builtin');
    assert.ok(prompt.name.trim().length > 0);
    assert.ok(prompt.body.trim().length > 80);
    assert.ok(prompt.context.length > 0);
    assert.ok((prompt.contextBudgetTokens ?? 0) >= 1000);
    assert.equal(prompt.providerId, 'github-copilot');
  }
});

test('generic built-in actions dominate the catalog while legacy compatibility remains available', () => {
  const prompts = getBuiltInPrompts();
  const frameworkSpecific = prompts.filter(prompt =>
    /\b(react|angular|vue|svelte|spring|django|\.net)\b/i.test(`${prompt.name} ${prompt.description ?? ''}`),
  );

  assert.ok(frameworkSpecific.length <= 1);
  assert.ok(prompts.some(prompt => prompt.id === 'studio-react-pr-review'));
});

test('built-in workflows are unique, reusable, and only reference available actions', () => {
  const prompts = getBuiltInPrompts();
  const promptIds = new Set(prompts.map(prompt => prompt.id));
  const workflows = getBuiltInWorkflows();
  const workflowIds = workflows.map(workflow => workflow.id);

  assert.ok(workflows.length >= 8);
  assert.equal(new Set(workflowIds).size, workflowIds.length);

  for (const workflow of workflows) {
    assert.equal(workflow.source, 'builtin');
    assert.ok(workflow.name.trim().length > 0);
    assert.ok((workflow.description ?? '').trim().length > 0);
    assert.ok(workflow.steps.length >= 3);
    assert.equal(new Set(workflow.steps.map(step => step.id)).size, workflow.steps.length);

    for (const step of workflow.steps) {
      assert.ok(Boolean(step.promptId || step.inlinePrompt));
      if (step.promptId) {
        assert.ok(promptIds.has(step.promptId), `${workflow.name} references missing prompt ${step.promptId}`);
      }
    }
  }
});

test('built-in workflow catalog covers common end-to-end engineering jobs', () => {
  const ids = new Set(getBuiltInWorkflows().map(workflow => workflow.id));

  for (const id of [
    'workflow-pr-preparation',
    'workflow-debug',
    'workflow-refactor',
    'workflow-test-hardening',
    'workflow-security-hardening',
    'workflow-performance-investigation',
    'workflow-api-change-safety',
    'workflow-dependency-upgrade',
    'workflow-onboarding-docs',
    'workflow-production-readiness',
  ]) {
    assert.ok(ids.has(id), `Missing built-in workflow ${id}`);
  }
});
