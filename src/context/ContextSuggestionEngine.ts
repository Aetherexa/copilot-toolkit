import { ContextType } from '../domain/context';

export interface ContextSuggestionPrompt {
  name?: string;
  category?: string;
  body?: string;
}

const ECOSYSTEM_INTENT =
  /\b(package|packages|dependency|dependencies|library|libraries|framework|runtime|tooling|toolchain|sdk|version|versions|upgrade|compatibility|compatible|validation|validator|http|api|authentication|auth|state management|form|forms|database|orm|cache|caching)\b/i;

function withStackGenome(types: ContextType[], haystack: string): ContextType[] {
  if (!ECOSYSTEM_INTENT.test(haystack) || types.includes('stackGenome')) {
    return types;
  }
  return [...types, 'stackGenome'];
}

export function detectSuggestedContextTypes(prompt: ContextSuggestionPrompt | null): ContextType[] {
  if (!prompt) {
    return [];
  }

  const haystack = `${prompt.name ?? ''} ${prompt.category ?? ''} ${prompt.body ?? ''}`.toLowerCase();
  let suggested: ContextType[];

  if (/review|audit|\bpr\b/.test(haystack)) {
    suggested = ['gitDiff', 'relatedFiles', 'relatedTests'];
  } else if (/debug|bug|fix|error/.test(haystack)) {
    suggested = ['currentFile', 'currentSelection', 'relatedFiles', 'recentCommits'];
  } else if (/explain|understand|document/.test(haystack)) {
    suggested = ['currentFile', 'openEditors', 'workspaceSummary'];
  } else if (/test|coverage/.test(haystack)) {
    suggested = ['relatedTests', 'relatedFiles', 'gitDiff'];
  } else if (/refactor|cleanup|modernize/.test(haystack)) {
    suggested = ['currentFile', 'relatedFiles', 'openEditors'];
  } else {
    suggested = ['currentFile', 'relatedFiles'];
  }

  return withStackGenome(suggested, haystack);
}
