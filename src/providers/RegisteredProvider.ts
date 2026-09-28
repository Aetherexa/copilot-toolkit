import type { CancellationToken } from 'vscode';
import { PromptExecutionProgress, PromptExecutionRequest, PromptExecutionResult } from '../domain/execution';
import { AIProvider } from '../domain/provider';

export interface RegisteredProvider {
  definition: AIProvider;
  refreshDefinition(): Promise<AIProvider>;
  execute(
    request: PromptExecutionRequest,
    onProgress: (event: PromptExecutionProgress) => void,
    token?: CancellationToken,
  ): Promise<PromptExecutionResult>;
}