import * as vscode from 'vscode';
import { FallbackLanguageAnalyzer } from '../analyzers/FallbackLanguageAnalyzer';
import { JsTsLanguageAnalyzer } from '../analyzers/JsTsLanguageAnalyzer';
import { GraphView, IndexingStatus } from '../domain/graph';
import { GraphQueryService } from './GraphQueryService';
import { WorkspaceIndexService } from './WorkspaceIndexService';
import { WorkspaceIndexer } from './WorkspaceIndexer';

export class WorkspaceIntelligenceService {
  readonly indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  readonly graphQuery = new GraphQueryService(this.indexer);
  private readonly statusEmitter = new vscode.EventEmitter<IndexingStatus>();
  private initialization: Promise<void> | undefined;
  readonly onDidChangeStatus = this.statusEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceIndex: WorkspaceIndexService,
  ) {
    const notify = () => this.statusEmitter.fire(this.getStatus());
    this.indexer.onDidChange(notify);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
      void this.upsertPath(document.uri.fsPath, document.getText());
    }));
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(event => {
      for (const file of event.files) {
        void this.upsertPath(file.fsPath);
      }
    }));
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(event => {
      for (const file of event.files) {
        this.workspaceIndex.removeFileInfo(file.fsPath);
        this.indexer.removeFile(file.fsPath);
      }
      notify();
    }));
    context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => {
      for (const file of event.files) {
        this.workspaceIndex.removeFileInfo(file.oldUri.fsPath);
        this.indexer.removeFile(file.oldUri.fsPath);
        void this.upsertPath(file.newUri.fsPath);
      }
    }));
  }

  ensureInitialized(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.initialize().finally(() => {
        if (this.indexer.getStatus().state === 'error') {
          this.initialization = undefined;
        }
      });
    }
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    try {
      const files = await this.workspaceIndex.getWorkspaceFiles();
      const indexed = [] as Array<Parameters<WorkspaceIndexer['initialize']>[0][number]>;
      for (const file of files) {
        const content = await this.workspaceIndex.readFullText(file.absolutePath);
        if (!content) {
          continue;
        }
        indexed.push({
          info: file,
          languageId: this.workspaceIndex.inferLanguageId(file),
          content,
        });
      }
      await this.indexer.initialize(indexed);
      this.statusEmitter.fire(this.getStatus());
    } catch (error) {
      this.statusEmitter.fire({
        state: 'error',
        filesIndexed: 0,
        entities: 0,
        relationships: 0,
        message: error instanceof Error ? error.message : 'Workspace indexing failed.',
      });
    }
  }

  getStatus(): IndexingStatus {
    return this.indexer.getStatus();
  }

  async upsertPath(filePath: string, contentOverride?: string): Promise<void> {
    const info = await this.workspaceIndex.upsertFileInfo(filePath);
    if (!info) {
      return;
    }
    const content = contentOverride ?? await this.workspaceIndex.readFullText(info.absolutePath);
    if (!content) {
      return;
    }
    await this.indexer.upsertFile({
      info,
      languageId: this.workspaceIndex.inferLanguageId(info),
      content,
    });
    this.statusEmitter.fire(this.getStatus());
  }

  async getMapView(filePath: string, depth: number, reverse: boolean): Promise<GraphView> {
    await this.ensureInitialized();
    return this.graphQuery.buildDependencyGraph(filePath, depth, reverse);
  }

  async openFile(filePath: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document, { preview: false });
  }
}