import * as path from 'path';
import { CodeEntity, CodeRelation, GraphEdgeView, GraphNodeView, GraphView } from '../domain/graph';
import { WorkspaceIndexer } from './WorkspaceIndexer';

function normalizeFileEntityId(value: string): string {
  return value.startsWith('file:') ? value : `file:${value}`;
}

export class GraphQueryService {
  constructor(private readonly indexer: WorkspaceIndexer) {}

  getDependencies(file: string, depth = 1): string[] {
    return this.walk(normalizeFileEntityId(file), depth, ['imports', 'dependsOn']);
  }

  getReverseDependencies(file: string, depth = 1): string[] {
    return this.walkReverse(normalizeFileEntityId(file), depth, ['imports', 'dependsOn']);
  }

  getReferences(file: string, depth = 1): string[] {
    return this.walk(normalizeFileEntityId(file), depth, ['references']);
  }

  getImpactedFiles(file: string, depth = 2): string[] {
    return this.getReverseDependencies(file, depth);
  }

  shortestDependencyPath(sourceFile: string, targetFile: string): string[] {
    const start = normalizeFileEntityId(sourceFile);
    const target = this.resolveGraphFileId(normalizeFileEntityId(targetFile));
    const relations = this.indexer.getRelations().filter(relation => ['imports', 'dependsOn'].includes(relation.type));
    const queue: Array<{ id: string; path: string[] }> = [{ id: start, path: [start] }];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === target) {
        return current.path;
      }

      for (const relation of relations.filter(item => this.resolveGraphFileId(item.source) === current.id)) {
        const targetId = this.resolveGraphFileId(relation.target);
        if (!visited.has(targetId)) {
          visited.add(targetId);
          queue.push({ id: targetId, path: [...current.path, targetId] });
        }
      }
    }

    return [];
  }

  buildWorkspaceSummary(): string {
    const files = this.indexer.getFiles();
    const entities = this.indexer.getEntities();
    const relations = this.indexer.getRelations();
    const languages = new Map<string, number>();
    const folders = new Map<string, number>();
    for (const file of files) {
      languages.set(file.languageId, (languages.get(file.languageId) ?? 0) + 1);
      const folder = file.info.directory || '.';
      folders.set(folder, (folders.get(folder) ?? 0) + 1);
    }

    const topLanguages = [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([language, count]) => `${language}: ${count}`).join(', ');
    const topFolders = [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([folder, count]) => `${folder} (${count})`).join(', ');
    const entryPoints = files.filter(file => /(^|\/)index\.(ts|tsx|js|jsx|py|java|go|rs|cs)$/i.test(file.info.relativePath)).map(file => file.info.relativePath).slice(0, 8).join(', ') || 'None detected';
    const tests = files.filter(file => file.info.isTest).length;

    return [
      `Indexed files: ${files.length}`,
      `Languages: ${topLanguages || 'unknown'}`,
      `Important folders: ${topFolders || '.'}`,
      `Entities: ${entities.length}`,
      `Relationships: ${relations.length}`,
      `Entry points: ${entryPoints}`,
      `Tests detected: ${tests}`,
    ].join('\n');
  }

  buildArchitectureSummary(filePath?: string): { content: string; confidence: string; reason: string } {
    const target = filePath ? this.findFileEntityId(filePath) : undefined;
    const dependencies = target ? this.getDependencies(target, 2) : [];
    const reverse = target ? this.getReverseDependencies(target, 2) : [];
    const fileName = target ? target.replace(/^file:/, '') : 'workspace';
    const content = [
      `Focus: ${fileName}`,
      target ? `Dependencies: ${dependencies.map(item => item.replace(/^file:/, '')).join(', ') || 'None detected'}` : 'Dependencies: workspace-level summary',
      target ? `Reverse dependencies: ${reverse.map(item => item.replace(/^file:/, '')).join(', ') || 'None detected'}` : '',
      this.buildWorkspaceSummary(),
    ].filter(Boolean).join('\n');
    return {
      content,
      confidence: target ? 'medium' : 'low',
      reason: target ? 'Derived from static imports and folder relationships.' : 'Derived from indexed workspace metadata.',
    };
  }

  buildDependencyGraph(filePath: string, depth = 2, reverse = false): GraphView {
    const focusId = this.findFileEntityId(filePath);
    if (!focusId) {
      return { nodes: [], edges: [] };
    }

    const relationTypes = ['imports', 'dependsOn'];
    const relatedIds = reverse
      ? this.walkReverse(focusId, depth, relationTypes)
      : this.walk(focusId, depth, relationTypes);
    const ids = [focusId, ...relatedIds];
    const nodes = ids.map(id => this.toNode(id)).filter((node): node is GraphNodeView => Boolean(node));
    const idSet = new Set(ids);
    const edges = this.indexer.getRelations()
      .filter(relation => relationTypes.includes(relation.type))
      .map(relation => ({
        source: this.resolveGraphFileId(relation.source),
        target: this.resolveGraphFileId(relation.target),
        type: relation.type,
      }))
      .filter(relation => idSet.has(relation.source) && idSet.has(relation.target));

    return { nodes, edges, focusId };
  }

  buildCurrentFeatureSummary(filePath: string): { content: string; confidence: string; reason: string } {
    const fileEntityId = this.findFileEntityId(filePath);
    if (!fileEntityId) {
      return {
        content: 'No current feature could be inferred.',
        confidence: 'low',
        reason: 'The active file is not part of the indexed workspace.',
      };
    }

    const relativePath = fileEntityId.replace(/^file:/, '');
    const directory = path.posix.dirname(relativePath);
    const related = this.indexer.getFiles().filter(file => file.info.directory === directory).slice(0, 8);
    return {
      content: [
        `Feature folder: ${directory || '.'}`,
        `Files: ${related.map(file => file.info.relativePath).join(', ') || relativePath}`,
      ].join('\n'),
      confidence: related.length > 1 ? 'medium' : 'low',
      reason: 'Inferred from the current file folder and neighboring indexed files.',
    };
  }

  private walk(start: string, depth: number, types: string[]): string[] {
    const queue: Array<{ id: string; depth: number }> = [{ id: start, depth: 0 }];
    const visited = new Set<string>([start]);
    const results: string[] = [];
    const relations = this.indexer.getRelations().filter(relation => types.includes(relation.type));

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= depth) {
        continue;
      }

      for (const relation of relations.filter(item => item.source === current.id)) {
        const targetId = this.resolveGraphFileId(relation.target);
        if (!visited.has(targetId)) {
          visited.add(targetId);
          results.push(targetId);
          queue.push({ id: targetId, depth: current.depth + 1 });
        }
      }
    }

    return results;
  }

  private walkReverse(start: string, depth: number, types: string[]): string[] {
    const queue: Array<{ id: string; depth: number }> = [{ id: start, depth: 0 }];
    const visited = new Set<string>([start]);
    const results: string[] = [];
    const relations = this.indexer.getRelations().filter(relation => types.includes(relation.type));

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= depth) {
        continue;
      }

      for (const relation of relations.filter(item => this.resolveGraphFileId(item.target) === current.id)) {
        const sourceId = this.resolveGraphFileId(relation.source);
        if (!visited.has(sourceId)) {
          visited.add(sourceId);
          results.push(sourceId);
          queue.push({ id: sourceId, depth: current.depth + 1 });
        }
      }
    }

    return results;
  }

  private toNode(id: string): GraphNodeView | undefined {
    const resolvedId = this.resolveGraphFileId(id);
    const entity = this.indexer.getEntityById(resolvedId) ?? this.indexer.getEntities().find(candidate => candidate.id === resolvedId);
    if (!entity) {
      return undefined;
    }

    const indexedFile = this.indexer.getFiles().find(file => file.info.relativePath === entity.file);

    return {
      id: entity.id,
      label: entity.name,
      type: entity.type,
      file: indexedFile?.info.absolutePath ?? entity.file,
      language: entity.language,
      metadata: {
        ...entity.metadata,
        relativePath: entity.file,
      },
    };
  }

  private findFileEntityId(filePath: string): string | undefined {
    const normalized = filePath.replace(/\\/g, '/');
    const match = this.indexer.getFiles().find(file => file.info.absolutePath.replace(/\\/g, '/') === normalized || file.info.relativePath === normalized);
    return match ? `file:${match.info.relativePath}` : undefined;
  }

  private resolveGraphFileId(id: string): string {
    if (!id.startsWith('file:')) {
      return id;
    }

    if (this.indexer.getEntityById(id)) {
      return id;
    }

    const filePath = id.replace(/^file:/, '');
    const match = this.indexer.getFiles().find(file => file.info.relativePath === filePath || file.info.relativePath.startsWith(`${filePath}.`) || file.info.relativePath.startsWith(`${filePath}/index.`));
    return match ? `file:${match.info.relativePath}` : id;
  }
}