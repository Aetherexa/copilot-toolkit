import { EventEmitter } from 'events';
import { LanguageAnalyzer } from '../analyzers/LanguageAnalyzer';
import { CodeEntity, CodeRelation, GraphFileAnalysis, IndexingStatus } from '../domain/graph';
import { WorkspaceFileInfo } from './WorkspaceIndexService';

export interface IndexedWorkspaceFile {
  info: WorkspaceFileInfo;
  languageId: string;
  content: string;
}

function defaultStatus(): IndexingStatus {
  return { state: 'idle', filesIndexed: 0, entities: 0, relationships: 0 };
}

export class WorkspaceIndexer {
  private readonly emitter = new EventEmitter();
  private readonly files = new Map<string, IndexedWorkspaceFile>();
  private readonly analysis = new Map<string, GraphFileAnalysis>();
  private status: IndexingStatus = defaultStatus();

  constructor(
    private readonly analyzers: LanguageAnalyzer[],
    private readonly fallbackAnalyzer: LanguageAnalyzer,
  ) {}

  onDidChange(listener: () => void): () => void {
    this.emitter.on('change', listener);
    return () => this.emitter.off('change', listener);
  }

  getStatus(): IndexingStatus {
    return this.status;
  }

  async initialize(files: IndexedWorkspaceFile[]): Promise<void> {
    this.status = { ...defaultStatus(), state: 'indexing', message: 'Indexing workspace…' };
    this.emitter.emit('change');
    this.files.clear();
    this.analysis.clear();
    for (const file of files) {
      await this.upsertFile(file, false);
    }
    this.refreshStatus('ready', 'Workspace intelligence ready.');
  }

  async upsertFile(file: IndexedWorkspaceFile, emit = true): Promise<void> {
    const analyzer = this.analyzers.find(candidate => candidate.supports(file.languageId, file.info)) ?? this.fallbackAnalyzer;
    const result = await analyzer.analyze(file.info, file.content);
    this.files.set(file.info.absolutePath, {
      ...file,
      // Source text is only needed during analysis. Do not retain full workspace
      // contents in the graph cache after entities/relations are extracted.
      content: '',
    });
    this.analysis.set(file.info.absolutePath, result);
    this.refreshStatus('ready');
    if (emit) {
      this.emitter.emit('change');
    }
  }

  removeFile(absolutePath: string): void {
    this.files.delete(absolutePath);
    this.analysis.delete(absolutePath);
    this.refreshStatus('ready');
    this.emitter.emit('change');
  }

  markError(message: string): void {
    this.refreshStatus('error', message);
    this.emitter.emit('change');
  }

  getFiles(): IndexedWorkspaceFile[] {
    return [...this.files.values()].sort((left, right) => left.info.relativePath.localeCompare(right.info.relativePath));
  }

  getEntities(): CodeEntity[] {
    return [...this.analysis.values()].flatMap(item => item.entities);
  }

  getRelations(): CodeRelation[] {
    return [...this.analysis.values()].flatMap(item => item.relations);
  }

  getAnalysisByFile(absolutePath: string): GraphFileAnalysis | undefined {
    return this.analysis.get(absolutePath);
  }

  getEntityById(entityId: string): CodeEntity | undefined {
    return this.getEntities().find(entity => entity.id === entityId);
  }

  private refreshStatus(state: IndexingStatus['state'], message?: string): void {
    const entities = this.getEntities().length;
    const relationships = this.getRelations().length;
    this.status = {
      state,
      filesIndexed: this.files.size,
      entities,
      relationships,
      lastUpdated: Date.now(),
      message,
    };
  }
}