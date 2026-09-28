import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CollectionAddPromptRequest,
  CollectionCreateRequest,
  CollectionDeleteRequest,
  CollectionRemovePromptRequest,
  CollectionRenameRequest,
  ContextPreviewRequest,
  ExecutionCancelRequest,
  ExecutionClearRequest,
  ExecutionDeleteRequest,
  ErrorMessage,
  ExportCollectionRequest,
  ExportPromptRequest,
  GraphViewRequest,
  ImportRequest,
  IndexStatusMessage,
  NoticeMessage,
  OpenFileRequest,
  PromptOutputMessage,
  PromptCreateRequest,
  PromptDeleteRequest,
  PromptDuplicateRequest,
  PromptFavoriteRequest,
  PromptRunRequest,
  PromptSaveRequest,
  ProviderRefreshRequest,
  StudioExtensionMessage,
  StudioWebviewMessage,
  WorkflowCancelRequest,
  WorkflowCreateRequest,
  WorkflowDeleteRequest,
  WorkflowDuplicateRequest,
  WorkflowExportRequest,
  WorkflowHistoryClearRequest,
  WorkflowHistoryDeleteRequest,
  WorkflowImportRequest,
  WorkflowRunRequest,
  WorkflowSaveRequest,
} from '../domain/messages';
import { ServiceContainer } from '../app/serviceContainer';

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}

export class PromptStudioPanel {
  private static current: PromptStudioPanel | undefined;

  static createOrReveal(services: ServiceContainer): PromptStudioPanel {
    if (PromptStudioPanel.current) {
      PromptStudioPanel.current.panel.reveal(vscode.ViewColumn.One);
      return PromptStudioPanel.current;
    }

    const extensionUri = services.context.extensionUri;
    const assetsRoot = vscode.Uri.joinPath(extensionUri, 'media', 'studio');
    const panel = vscode.window.createWebviewPanel(
      'copilotToolkitStudio',
      'Copilot Toolkit — AI Workflow Studio',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [assetsRoot],
      },
    );

    PromptStudioPanel.current = new PromptStudioPanel(panel, services, assetsRoot);
    return PromptStudioPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly services: ServiceContainer,
    private readonly assetsRoot: vscode.Uri,
  ) {
    this.panel.onDidDispose(() => {
      PromptStudioPanel.current = undefined;
    }, null, this.services.context.subscriptions);

    this.services.workspaceIntelligence.onDidChangeStatus(status => {
      const payload: IndexStatusMessage = {
        type: 'index.status',
        payload: { status },
      };
      this.postMessage(payload);
    });

    this.panel.webview.onDidReceiveMessage(message => {
      void this.handleMessage(message as StudioWebviewMessage);
    }, null, this.services.context.subscriptions);

    this.panel.webview.html = this.render();
    void this.bootstrap();
  }

  private render(): string {
    const scriptPath = path.join(this.assetsRoot.fsPath, 'main.js');
    const stylePath = path.join(this.assetsRoot.fsPath, 'main.css');
    if (!fs.existsSync(scriptPath) || !fs.existsSync(stylePath)) {
      return this.renderMissingAssetState();
    }

    const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.file(scriptPath));
    const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.file(stylePath));
    const scriptNonce = createNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} data:; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${scriptNonce}'; font-src ${this.panel.webview.cspSource};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Copilot Toolkit</title>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${scriptNonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private renderMissingAssetState(): string {
    const styleNonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'nonce-${styleNonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Copilot Toolkit</title>
    <style nonce="${styleNonce}">
      body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); padding: 24px; }
      .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 20px; max-width: 640px; background: var(--vscode-sideBar-background); }
      h1 { font-size: 18px; margin: 0 0 12px; }
      p { line-height: 1.5; }
      code { background: var(--vscode-textBlockQuote-background); padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>AI Workflow Studio assets are missing</h1>
      <p>Run <code>npm run compile</code> to build the extension host and the Studio webview bundle into <code>media/studio</code>.</p>
    </div>
  </body>
</html>`;
  }

  private async bootstrap(): Promise<void> {
    this.postMessage({
      type: 'studio.bootstrap',
      payload: await this.services.loadBootstrap(),
    });
  }

  private async handleMessage(message: StudioWebviewMessage): Promise<void> {
    switch (message.type) {
      case 'studio.ready':
        await this.bootstrap();
        return;
      case 'context.preview':
        await this.handlePreview(message);
        return;
      case 'prompt.save':
        await this.handleSave(message);
        return;
      case 'prompt.run':
        await this.handleRun(message);
        return;
      case 'prompt.create':
        await this.handleCreatePrompt(message);
        return;
      case 'prompt.delete':
        await this.handleDeletePrompt(message);
        return;
      case 'prompt.duplicate':
        await this.handleDuplicatePrompt(message);
        return;
      case 'prompt.favorite':
        await this.handleFavoritePrompt(message);
        return;
      case 'collection.create':
        await this.handleCreateCollection(message);
        return;
      case 'collection.rename':
        await this.handleRenameCollection(message);
        return;
      case 'collection.delete':
        await this.handleDeleteCollection(message);
        return;
      case 'collection.addPrompt':
        await this.handleCollectionAddPrompt(message);
        return;
      case 'collection.removePrompt':
        await this.handleCollectionRemovePrompt(message);
        return;
      case 'import.open':
        await this.handleImport();
        return;
      case 'export.prompt':
        await this.handleExportPrompt(message);
        return;
      case 'export.collection':
        await this.handleExportCollection(message);
        return;
      case 'provider.refresh':
        await this.handleProviderRefresh(message);
        return;
      case 'execution.cancel':
        await this.handleExecutionCancel(message);
        return;
      case 'execution.delete':
        await this.handleExecutionDelete(message);
        return;
      case 'execution.clear':
        await this.handleExecutionClear(message);
        return;
      case 'graph.view':
        await this.handleGraphView(message);
        return;
      case 'workspace.openFile':
        await this.handleOpenFile(message);
        return;
      case 'workflow.save':
        await this.handleWorkflowSave(message);
        return;
      case 'workflow.create':
        await this.handleWorkflowCreate(message);
        return;
      case 'workflow.delete':
        await this.handleWorkflowDelete(message);
        return;
      case 'workflow.duplicate':
        await this.handleWorkflowDuplicate(message);
        return;
      case 'workflow.import':
        await this.handleWorkflowImport(message);
        return;
      case 'workflow.export':
        await this.handleWorkflowExport(message);
        return;
      case 'workflow.run':
        await this.handleWorkflowRun(message);
        return;
      case 'workflow.cancel':
        await this.handleWorkflowCancel(message);
        return;
      case 'workflow.history.delete':
        await this.handleWorkflowHistoryDelete(message);
        return;
      case 'workflow.history.clear':
        await this.handleWorkflowHistoryClear(message);
        return;
      default:
        this.postError('Invalid Studio message received.');
    }
  }

  private async handlePreview(message: ContextPreviewRequest): Promise<void> {
    if (!message.payload?.prompt) {
      this.postError('Context preview payload is missing the prompt definition.');
      return;
    }

    const preview = await this.services.buildPreview({
      ...message.payload.prompt,
      context: message.payload.context,
    });
    this.postMessage({ type: 'context.previewResult', payload: preview });
  }

  private async handleSave(message: PromptSaveRequest): Promise<void> {
    if (!message.payload?.prompt?.id || !message.payload.prompt.name) {
      this.postError('Prompt save failed because required fields were missing.');
      return;
    }

    try {
      const result = await this.services.promptRepository.savePrompt(message.payload.prompt, message.payload.mode);
      await this.postBootstrap(result.snapshot, result.savedPrompt.id);
      this.postNotice(`Saved ${result.savedPrompt.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Prompt save failed.');
    }
  }

  private async handleRun(message: PromptRunRequest): Promise<void> {
    if (!message.payload?.prompt?.id || !message.payload.prompt.body) {
      this.postError('Prompt execution failed because the request was incomplete.');
      return;
    }

    const prompt = {
      ...message.payload.prompt,
      context: message.payload.context,
    };

    this.postMessage({
      type: 'prompt.running',
      payload: {
        executionId: 'pending',
        providerId: prompt.providerId ?? 'github-copilot',
        modelId: prompt.modelId ?? 'copilot-default',
      },
    });

    const { preview, result, record } = await this.services.runPrompt(prompt, event => {
      if (event.chunk) {
        const payload: PromptOutputMessage = {
          type: 'prompt.output',
          payload: {
            executionId: event.executionId,
            chunk: event.chunk,
          },
        };
        this.postMessage(payload);
      } else {
        this.postMessage({
          type: 'prompt.running',
          payload: {
            executionId: event.executionId,
            providerId: event.providerId,
            modelId: event.modelId,
            providerName: event.providerName,
            modelName: event.modelName,
          },
        });
      }
    });
    if (!result.success && result.error) {
      vscode.window.showWarningMessage(`Copilot Toolkit: ${result.error}`);
    }

    this.postMessage({
      type: 'context.previewResult',
      payload: preview,
    });

    this.postMessage({
      type: 'prompt.result',
      payload: {
        executionId: record.id,
        success: result.success,
        prompt: preview.prompt,
        resolvedContext: preview.resolvedContext,
        record,
        message: result.error,
      },
    });
    this.postExecutionHistory();
  }

  private async handleCreatePrompt(message: PromptCreateRequest): Promise<void> {
    try {
      const result = await this.services.promptRepository.createPrompt(message.payload?.name);
      await this.postBootstrap(result.snapshot, result.prompt.id);
      this.postNotice(`Created ${result.prompt.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Prompt creation failed.');
    }
  }

  private async handleDeletePrompt(message: PromptDeleteRequest): Promise<void> {
    if (!message.payload?.promptId) {
      this.postError('Prompt delete request was incomplete.');
      return;
    }

    try {
      const snapshot = await this.services.promptRepository.deletePrompt(message.payload.promptId);
      await this.postBootstrap(snapshot);
      this.postNotice('Prompt deleted.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Prompt delete failed.');
    }
  }

  private async handleDuplicatePrompt(message: PromptDuplicateRequest): Promise<void> {
    if (!message.payload?.promptId) {
      this.postError('Prompt duplicate request was incomplete.');
      return;
    }

    try {
      const result = await this.services.promptRepository.duplicatePrompt(message.payload.promptId);
      await this.postBootstrap(result.snapshot, result.duplicatedPrompt.id);
      this.postNotice(`Duplicated ${result.duplicatedPrompt.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Prompt duplication failed.');
    }
  }

  private async handleFavoritePrompt(message: PromptFavoriteRequest): Promise<void> {
    if (!message.payload?.promptId) {
      this.postError('Prompt favorite request was incomplete.');
      return;
    }

    try {
      const snapshot = await this.services.promptRepository.setFavorite(message.payload.promptId, message.payload.favorite);
      await this.postBootstrap(snapshot, message.payload.promptId);
      this.postNotice(message.payload.favorite ? 'Prompt added to favorites.' : 'Prompt removed from favorites.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Favorite update failed.');
    }
  }

  private async handleCreateCollection(message: CollectionCreateRequest): Promise<void> {
    try {
      const result = await this.services.promptRepository.createCollection(message.payload?.name);
      await this.postBootstrap(result.snapshot);
      this.postNotice(`Created collection ${result.collection.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Collection creation failed.');
    }
  }

  private async handleRenameCollection(message: CollectionRenameRequest): Promise<void> {
    if (!message.payload?.collectionId || !message.payload.name) {
      this.postError('Collection rename request was incomplete.');
      return;
    }

    try {
      const snapshot = await this.services.promptRepository.renameCollection(message.payload.collectionId, message.payload.name);
      await this.postBootstrap(snapshot);
      this.postNotice('Collection renamed.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Collection rename failed.');
    }
  }

  private async handleDeleteCollection(message: CollectionDeleteRequest): Promise<void> {
    if (!message.payload?.collectionId) {
      this.postError('Collection delete request was incomplete.');
      return;
    }

    try {
      const snapshot = await this.services.promptRepository.deleteCollection(message.payload.collectionId);
      await this.postBootstrap(snapshot);
      this.postNotice('Collection deleted.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Collection delete failed.');
    }
  }

  private async handleCollectionAddPrompt(message: CollectionAddPromptRequest): Promise<void> {
    if (!message.payload?.collectionId || !message.payload.promptId) {
      this.postError('Collection add request was incomplete.');
      return;
    }

    try {
      const snapshot = await this.services.promptRepository.addPromptToCollection(message.payload.collectionId, message.payload.promptId);
      await this.postBootstrap(snapshot, message.payload.promptId);
      this.postNotice('Prompt added to collection.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Adding prompt to collection failed.');
    }
  }

  private async handleCollectionRemovePrompt(message: CollectionRemovePromptRequest): Promise<void> {
    if (!message.payload?.collectionId || !message.payload.promptId) {
      this.postError('Collection remove request was incomplete.');
      return;
    }

    try {
      const snapshot = await this.services.promptRepository.removePromptFromCollection(message.payload.collectionId, message.payload.promptId);
      await this.postBootstrap(snapshot, message.payload.promptId);
      this.postNotice('Prompt removed from collection.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Removing prompt from collection failed.');
    }
  }

  private async handleImport(): Promise<void> {
    try {
      const result = await this.services.promptRepository.importFromJson();
      await this.postBootstrap(result.snapshot, result.importedPromptIds[0]);
      this.postNotice('Import completed.');
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  private async handleExportPrompt(message: ExportPromptRequest): Promise<void> {
    if (!message.payload?.promptId) {
      this.postError('Prompt export request was incomplete.');
      return;
    }

    try {
      const target = await this.services.promptRepository.exportPrompt(message.payload.promptId);
      this.postNotice(`Prompt exported to ${target}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Prompt export failed.');
    }
  }

  private async handleExportCollection(message: ExportCollectionRequest): Promise<void> {
    if (!message.payload?.collectionId) {
      this.postError('Collection export request was incomplete.');
      return;
    }

    try {
      const target = await this.services.promptRepository.exportCollection(message.payload.collectionId);
      this.postNotice(`Collection exported to ${target}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Collection export failed.');
    }
  }

  private async handleProviderRefresh(_message: ProviderRefreshRequest): Promise<void> {
    await this.services.providerRegistry.refresh();
    this.postMessage({
      type: 'provider.updated',
      payload: {
        providers: this.services.providerRegistry.list(),
      },
    });
    this.postNotice('Provider models refreshed.');
  }

  private async handleExecutionCancel(message: ExecutionCancelRequest): Promise<void> {
    if (!message.payload?.executionId) {
      this.postError('Execution cancel request was incomplete.');
      return;
    }

    const cancelled = this.services.executionEngine.cancel(message.payload.executionId);
    if (!cancelled) {
      this.postError('Execution could not be cancelled.');
      return;
    }

    this.postNotice('Execution cancelled.');
  }

  private async handleExecutionDelete(message: ExecutionDeleteRequest): Promise<void> {
    if (!message.payload?.executionId) {
      this.postError('Execution delete request was incomplete.');
      return;
    }

    await this.services.executionEngine.deleteHistory(message.payload.executionId);
    this.postExecutionHistory();
    this.postNotice('Execution deleted.');
  }

  private async handleExecutionClear(_message: ExecutionClearRequest): Promise<void> {
    await this.services.executionEngine.clearHistory();
    this.postExecutionHistory();
    this.postNotice('Execution history cleared.');
  }

  private async handleGraphView(message: GraphViewRequest): Promise<void> {
    const activeFilePath = message.payload?.filePath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activeFilePath) {
      this.postError('No active file available for workspace map focus.');
      return;
    }

    this.postMessage({
      type: 'graph.viewResult',
      payload: {
        view: this.services.workspaceIntelligence.getMapView(activeFilePath, message.payload.depth, message.payload.reverse),
        status: this.services.workspaceIntelligence.getStatus(),
      },
    });
  }

  private async handleOpenFile(message: OpenFileRequest): Promise<void> {
    if (!message.payload?.filePath) {
      this.postError('Open file request was incomplete.');
      return;
    }

    await this.services.workspaceIntelligence.openFile(message.payload.filePath);
  }

  private async handleWorkflowSave(message: WorkflowSaveRequest): Promise<void> {
    if (!message.payload?.workflow?.id || !message.payload.workflow.name) {
      this.postError('Workflow save failed because required fields were missing.');
      return;
    }

    try {
      const workflowResult = await this.services.workflowRepository.saveWorkflow(message.payload.workflow);
      const promptSnapshot = await this.services.promptRepository.loadSnapshot();
      this.postMessage({
        type: 'studio.bootstrap',
        payload: this.services.toBootstrap(promptSnapshot, workflowResult.snapshot.workflows),
      });
      this.postNotice(`Saved workflow ${workflowResult.workflow.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Workflow save failed.');
    }
  }

  private async handleWorkflowCreate(message: WorkflowCreateRequest): Promise<void> {
    try {
      const result = await this.services.workflowRepository.createWorkflow(message.payload?.name);
      const promptSnapshot = await this.services.promptRepository.loadSnapshot();
      this.postMessage({ type: 'studio.bootstrap', payload: this.services.toBootstrap(promptSnapshot, result.snapshot.workflows) });
      this.postNotice(`Created workflow ${result.workflow.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Workflow creation failed.');
    }
  }

  private async handleWorkflowDelete(message: WorkflowDeleteRequest): Promise<void> {
    if (!message.payload?.workflowId) {
      this.postError('Workflow delete request was incomplete.');
      return;
    }
    const snapshot = await this.services.workflowRepository.deleteWorkflow(message.payload.workflowId);
    const promptSnapshot = await this.services.promptRepository.loadSnapshot();
    this.postMessage({ type: 'studio.bootstrap', payload: this.services.toBootstrap(promptSnapshot, snapshot.workflows) });
    this.postNotice('Workflow deleted.');
  }

  private async handleWorkflowDuplicate(message: WorkflowDuplicateRequest): Promise<void> {
    if (!message.payload?.workflowId) {
      this.postError('Workflow duplicate request was incomplete.');
      return;
    }
    const result = await this.services.workflowRepository.duplicateWorkflow(message.payload.workflowId);
    const promptSnapshot = await this.services.promptRepository.loadSnapshot();
    this.postMessage({ type: 'studio.bootstrap', payload: this.services.toBootstrap(promptSnapshot, result.snapshot.workflows) });
    this.postNotice(`Duplicated workflow ${result.workflow.name}.`);
  }

  private async handleWorkflowImport(_message: WorkflowImportRequest): Promise<void> {
    try {
      const result = await this.services.workflowRepository.importFromJson();
      const promptSnapshot = await this.services.promptRepository.loadSnapshot();
      this.postMessage({ type: 'studio.bootstrap', payload: this.services.toBootstrap(promptSnapshot, result.snapshot.workflows) });
      this.postNotice(`Imported workflow ${result.workflow.name}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Workflow import failed.');
    }
  }

  private async handleWorkflowExport(message: WorkflowExportRequest): Promise<void> {
    if (!message.payload?.workflowId) {
      this.postError('Workflow export request was incomplete.');
      return;
    }
    try {
      const target = await this.services.workflowRepository.exportWorkflow(message.payload.workflowId);
      this.postNotice(`Workflow exported to ${target}.`);
    } catch (error) {
      this.postError(error instanceof Error ? error.message : 'Workflow export failed.');
    }
  }

  private async handleWorkflowRun(message: WorkflowRunRequest): Promise<void> {
    if (!message.payload?.workflow?.id) {
      this.postError('Workflow execution failed because the request was incomplete.');
      return;
    }

    const promptSnapshot = await this.services.promptRepository.loadSnapshot();
    const result = await this.services.workflowEngine.runWorkflow(message.payload.workflow, promptSnapshot.prompts, event => {
      this.postMessage({
        type: 'workflow.progress',
        payload: {
          executionId: event.executionId,
          workflowId: event.workflowId,
          stepId: event.stepId,
          stepName: event.stepName,
          status: event.status,
          chunk: event.chunk,
          error: event.error,
        },
      });
    });

    this.postMessage({
      type: 'workflow.result',
      payload: {
        executionId: result.record.id,
        success: result.success,
        record: result.record,
        message: result.record.error,
      },
    });
    this.postWorkflowHistory();
  }

  private async handleWorkflowCancel(message: WorkflowCancelRequest): Promise<void> {
    if (!message.payload?.executionId) {
      this.postError('Workflow cancel request was incomplete.');
      return;
    }
    if (!this.services.workflowEngine.cancel(message.payload.executionId)) {
      this.postError('Workflow could not be cancelled.');
      return;
    }
    this.postNotice('Workflow cancelled.');
  }

  private async handleWorkflowHistoryDelete(message: WorkflowHistoryDeleteRequest): Promise<void> {
    if (!message.payload?.executionId) {
      this.postError('Workflow history delete request was incomplete.');
      return;
    }
    await this.services.workflowEngine.deleteHistory(message.payload.executionId);
    this.postWorkflowHistory();
    this.postNotice('Workflow execution deleted.');
  }

  private async handleWorkflowHistoryClear(_message: WorkflowHistoryClearRequest): Promise<void> {
    await this.services.workflowEngine.clearHistory();
    this.postWorkflowHistory();
    this.postNotice('Workflow execution history cleared.');
  }

  private async postBootstrap(snapshot: Parameters<ServiceContainer['toBootstrap']>[0], activePromptId?: string): Promise<void> {
    const workflows = (await this.services.workflowRepository.loadSnapshot()).workflows;
    this.postMessage({
      type: 'studio.bootstrap',
      payload: this.services.toBootstrap(snapshot, workflows, activePromptId),
    });
  }

  private postNotice(message: string): void {
    const payload: NoticeMessage = {
      type: 'notice',
      payload: { message },
    };
    this.postMessage(payload);
  }

  private postMessage(message: StudioExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private postError(message: string): void {
    const payload: ErrorMessage = {
      type: 'error',
      payload: { message },
    };
    this.postMessage(payload);
  }

  private postExecutionHistory(): void {
    this.postMessage({
      type: 'execution.history',
      payload: {
        history: this.services.executionEngine.getHistory(),
      },
    });
  }

  private postWorkflowHistory(): void {
    this.postMessage({
      type: 'workflow.history',
      payload: {
        history: this.services.workflowEngine.getHistory(),
      },
    });
  }
}