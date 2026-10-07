import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSuggestedContextTypes } from '../context/ContextSuggestionEngine';

test('context suggestions include StackGenome for dependency and library intents', () => {
  const suggestions = detectSuggestedContextTypes({
    name: 'Choose validation library',
    category: 'implementation',
    body: 'Does this project already have a package for API validation?',
  });

  assert.equal(suggestions.includes('stackGenome'), true);
  assert.equal(suggestions.includes('relatedFiles'), true);
});

test('context suggestions include StackGenome alongside review context for dependency audits', () => {
  const suggestions = detectSuggestedContextTypes({
    name: 'Dependency audit',
    category: 'review',
    body: 'Review this PR for package compatibility issues.',
  });

  assert.deepEqual(suggestions, ['gitDiff', 'relatedFiles', 'relatedTests', 'stackGenome']);
});

test('ordinary code-only prompts do not add StackGenome context', () => {
  const suggestions = detectSuggestedContextTypes({
    name: 'Explain function',
    category: 'explain',
    body: 'Explain what the selected function does.',
  });

  assert.equal(suggestions.includes('stackGenome'), false);
  assert.deepEqual(suggestions, ['currentFile', 'openEditors', 'workspaceSummary']);
});

test('null prompt has no context suggestions', () => {
  assert.deepEqual(detectSuggestedContextTypes(null), []);
});
