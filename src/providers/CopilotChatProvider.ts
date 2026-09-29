import * as vscode from 'vscode';
import { PromptExecutionProgress, PromptExecutionRequest, PromptExecutionResult } from '../domain/execution';
import { AIProvider, ProviderModel } from '../domain/provider';
import { RegisteredProvider } from './RegisteredProvider';

export class CopilotChatProvider implements RegisteredProvider {
  readonly definition: AIProvider = {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    displayName: 'GitHub Copilot',
    enabled: true,
    description: 'Executes with VS Code language models and falls back to Copilot Chat handoff when needed.',
    supportsStreaming: true,
    supportsTokenCounting: true,
    supportsCancellation: true,
    status: 'fallback',
    statusMessage: 'Using Copilot Chat fallback until language models are discovered.',
    models: [],
  };

  constructor(private readonly extension: vscode.ExtensionContext) {
    void this.refreshDefinition();
  }

  async refreshDefinition(): Promise<AIProvider> {
    const models = await this.getModels();
    this.definition.models = models;
    this.definition.enabled = models.length > 0 || true;
    this.definition.status = models.length > 0 ? 'available' : 'fallback';
    this.definition.statusMessage = models.length > 0
      ? `${models.length} Copilot model${models.length === 1 ? '' : 's'} available`
      : 'Language model API unavailable, falling back to Copilot Chat handoff.';
    this.definition.supportsStreaming = models.length > 0;
    this.definition.supportsTokenCounting = models.length > 0;
    this.definition.supportsCancellation = models.length > 0;
    return this.definition;
  }

  async execute(
    request: PromptExecutionRequest,
    onProgress: (event: PromptExecutionProgress) => void,
    token?: vscode.CancellationToken,
  ): Promise<PromptExecutionResult> {
    const models = await this.getModels();
    const selectedModel = models.find(model => model.id === request.prompt.modelId) ?? models[0];

    if (selectedModel) {
      const chatModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      const chatModel = chatModels.find(model => model.id === selectedModel.id) ?? chatModels[0];

      if (chatModel) {
        const access = this.extension.languageModelAccessInformation.canSendRequest(chatModel);
        const promptMessage = vscode.LanguageModelChatMessage.User(request.assembledPrompt);
        try {
          const response = await chatModel.sendRequest([promptMessage], undefined, token);
          let responseText = '';
          for await (const chunk of response.text) {
            responseText += chunk;
            onProgress({
              executionId: '',
              providerId: this.definition.id,
              modelId: chatModel.id,
              providerName: this.definition.displayName ?? this.definition.name,
              modelName: chatModel.name,
              chunk,
              status: 'running',
            });
          }

          const actualInputTokens = access === false ? request.estimatedInputTokens : await chatModel.countTokens(promptMessage, token);
          const outputTokens = responseText ? await chatModel.countTokens(vscode.LanguageModelChatMessage.Assistant(responseText), token) : 0;
          return {
            success: true,
            providerId: this.definition.id,
            modelId: chatModel.id,
            providerName: this.definition.displayName ?? this.definition.name,
            modelName: chatModel.name,
            responseText,
            usage: {
              estimatedInputTokens: request.estimatedInputTokens,
              actualInputTokens,
              outputTokens,
            },
          };
        } catch (error) {
          if (token?.isCancellationRequested) {
            return {
              success: false,
              providerId: this.definition.id,
              modelId: chatModel.id,
              providerName: this.definition.displayName ?? this.definition.name,
              modelName: chatModel.name,
              cancelled: true,
              error: 'Request cancelled.',
            };
          }

          if (error instanceof vscode.LanguageModelError && error.code !== vscode.LanguageModelError.NoPermissions().code) {
            return {
              success: false,
              providerId: this.definition.id,
              modelId: chatModel.id,
              providerName: this.definition.displayName ?? this.definition.name,
              modelName: chatModel.name,
              error: error.message,
            };
          }
        }
      }
    }

    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: request.assembledPrompt,
      });

      return {
        success: true,
        providerId: this.definition.id,
        modelId: request.prompt.modelId ?? 'copilot-chat-fallback',
        providerName: this.definition.displayName ?? this.definition.name,
        modelName: 'Copilot Chat',
        responseText: 'Opened Copilot Chat with the assembled request. Response streaming is unavailable in fallback mode.',
        usage: {
          estimatedInputTokens: request.estimatedInputTokens,
        },
      };
    } catch (error) {
      const copyAction = 'Copy Request';
      const choice = await vscode.window.showWarningMessage(
        'Copilot Chat could not be opened. Copy the assembled request to the clipboard?',
        copyAction,
      );
      const copied = choice === copyAction;
      if (copied) {
        await vscode.env.clipboard.writeText(request.assembledPrompt);
      }

      return {
        success: false,
        providerId: this.definition.id,
        modelId: request.prompt.modelId ?? 'copilot-chat-fallback',
        providerName: this.definition.displayName ?? this.definition.name,
        modelName: 'Copilot Chat',
        error: error instanceof Error
          ? `${error.message}.${copied ? ' The assembled request was copied to your clipboard.' : ''}`
          : copied
            ? 'Copilot Chat could not be opened. The assembled request was copied to your clipboard.'
            : 'Copilot Chat could not be opened.',
      };
    }
  }

  private async getModels(): Promise<ProviderModel[]> {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      return models.map(model => ({
        id: model.id,
        name: model.name,
        enabled: true,
        description: `${model.family}${model.version ? ` • ${model.version}` : ''}`,
        vendor: model.vendor,
        family: model.family,
        version: model.version,
        maxInputTokens: model.maxInputTokens,
        supportsStreaming: true,
        supportsTokenCounting: true,
      }));
    } catch {
      return [];
    }
  }
}