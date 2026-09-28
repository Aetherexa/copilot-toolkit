import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { TokenEstimator } from '../../services/TokenEstimator';

export class CurrentSelectionResolver implements ContextResolver {
  readonly type = 'currentSelection' as const;

  constructor(private readonly tokenEstimator: TokenEstimator) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return undefined;
    }

    const document = editor.document;
    const selectedText = document.getText(editor.selection);
    if (!selectedText.trim()) {
      return undefined;
    }

    const maxCharacters = binding.options?.maxCharacters ?? Math.min((binding.options?.maxTokens ?? 800) * 4, 12000);
    const truncated = selectedText.length > maxCharacters;
    const content = truncated ? `${selectedText.slice(0, maxCharacters)}\n\n[Truncated]` : selectedText;

    return {
      type: this.type,
      title: 'Selected Code',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(selectedText),
      truncated,
      relevanceScore: 100,
      reason: 'Explicitly selected source code',
      source: {
        uri: document.uri.toString(),
        path: document.uri.fsPath,
        languageId: document.languageId,
        label: document.fileName.split(/[\\/]/).pop(),
        selection: {
          startLine: editor.selection.start.line + 1,
          startCharacter: editor.selection.start.character + 1,
          endLine: editor.selection.end.line + 1,
          endCharacter: editor.selection.end.character + 1,
        },
      },
      metadata: {
        fileName: document.fileName.split(/[\\/]/).pop(),
        lineCount: editor.selection.end.line - editor.selection.start.line + 1,
      },
    };
  }
}