import * as path from 'path';
import * as vscode from 'vscode';
import { ContextBinding, ContextResolver, ResolvedContext } from '../../domain/context';
import { TokenEstimator } from '../../services/TokenEstimator';

export class CurrentFileResolver implements ContextResolver {
  readonly type = 'currentFile' as const;

  constructor(private readonly tokenEstimator: TokenEstimator) {}

  async resolve(binding: ContextBinding): Promise<ResolvedContext | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    const document = editor.document;
    if (document.isUntitled && document.getText().trim().length === 0) {
      return undefined;
    }

    const maxCharacters = binding.options?.maxCharacters ?? Math.min((binding.options?.maxTokens ?? 1200) * 4, 16000);
    const fullText = document.getText();
    const truncated = fullText.length > maxCharacters;
    const content = truncated ? `${fullText.slice(0, maxCharacters)}\n\n[Truncated]` : fullText;

    return {
      type: this.type,
      title: 'Current File',
      content,
      tokenEstimate: this.tokenEstimator.estimate(content),
      originalTokenEstimate: this.tokenEstimator.estimate(fullText),
      truncated,
      relevanceScore: 95,
      reason: 'Primary active file context',
      source: {
        uri: document.uri.toString(),
        path: document.uri.fsPath,
        languageId: document.languageId,
        label: path.basename(document.fileName),
      },
      metadata: {
        fileName: path.basename(document.fileName),
        lineCount: document.lineCount,
      },
    };
  }
}