import * as path from 'path';
import { CodeEntity, CodeRelation, GraphFileAnalysis } from '../domain/graph';
import { WorkspaceFileInfo } from '../services/WorkspaceIndexService';
import { LanguageAnalyzer } from './LanguageAnalyzer';

function fileEntityId(file: WorkspaceFileInfo): string {
  return `file:${file.relativePath}`;
}

function moduleLanguage(file: WorkspaceFileInfo): string {
  return file.extension.replace('.', '') || 'unknown';
}

function symbolEntityId(file: WorkspaceFileInfo, type: string, name: string): string {
  return `${fileEntityId(file)}:${type}:${name}`;
}

function resolveImportTarget(file: WorkspaceFileInfo, specifier: string): string {
  const directory = file.directory ? `${file.directory}/` : '';
  return specifier.startsWith('.')
    ? path.posix.normalize(path.posix.join('/', directory, specifier)).replace(/^\//, '')
    : specifier;
}

export class JsTsLanguageAnalyzer implements LanguageAnalyzer {
  supports(languageId: string, file: WorkspaceFileInfo): boolean {
    return ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(languageId)
      || ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(file.extension);
  }

  async analyze(file: WorkspaceFileInfo, content: string): Promise<GraphFileAnalysis> {
    const entities: CodeEntity[] = [];
    const relations: CodeRelation[] = [];
    const rootId = fileEntityId(file);
    const language = moduleLanguage(file);

    entities.push({
      id: rootId,
      type: 'file',
      name: file.name,
      file: file.relativePath,
      language,
      metadata: {
        directory: file.directory,
        entryPoint: /(^|\/)index\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file.relativePath),
      },
    });

    const declarations = [
      { regex: /export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g, type: 'class' },
      { regex: /export\s+interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/g, type: 'interface' },
      { regex: /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g, type: 'function' },
      { regex: /export\s+const\s+(\w+)\s*=/g, type: 'const' },
      { regex: /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g, type: 'class' },
      { regex: /function\s+(\w+)\s*\(/g, type: 'function' },
      { regex: /const\s+(\w+)\s*=\s*(?:async\s*)?\(/g, type: 'function' },
    ] as const;

    for (const declaration of declarations) {
      for (const match of content.matchAll(declaration.regex)) {
        const name = match[1];
        const id = symbolEntityId(file, declaration.type, name);
        if (!entities.some(entity => entity.id === id)) {
          entities.push({ id, type: declaration.type, name, file: file.relativePath, language });
          relations.push({ source: rootId, target: id, type: 'contains' });
        }

        const extendsClause = match[2];
        if (extendsClause) {
          relations.push({ source: id, target: `${rootId}:symbol:${extendsClause}`, type: 'extends' });
        }

        const implementsClause = match[3];
        if (implementsClause) {
          for (const iface of implementsClause.split(',').map(value => value.trim()).filter(Boolean)) {
            relations.push({ source: id, target: `${rootId}:symbol:${iface}`, type: 'implements' });
          }
        }
      }
    }

    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) {
        continue;
      }

      relations.push({
        source: rootId,
        target: `file:${resolveImportTarget(file, specifier)}`,
        type: 'imports',
        metadata: { specifier },
      });
      relations.push({
        source: rootId,
        target: `file:${resolveImportTarget(file, specifier)}`,
        type: 'dependsOn',
        metadata: { specifier },
      });
    }

    const localEntities = entities.filter(entity => entity.file === file.relativePath && entity.type !== 'file');
    const localEntityByName = new Map(localEntities.map(entity => [entity.name, entity]));

    for (const relation of relations.filter(item => item.type === 'extends' || item.type === 'implements')) {
      const marker = ':symbol:';
      const markerIndex = relation.target.lastIndexOf(marker);
      if (markerIndex < 0) {
        continue;
      }

      const symbolName = relation.target.slice(markerIndex + marker.length);
      const localTarget = localEntityByName.get(symbolName);
      if (localTarget) {
        relation.target = localTarget.id;
        continue;
      }

      if (!entities.some(entity => entity.id === relation.target)) {
        entities.push({
          id: relation.target,
          type: 'symbol',
          name: symbolName,
          file: file.relativePath,
          language,
          metadata: { unresolved: true },
        });
      }
    }

    for (const entity of localEntities.filter(item => item.type === 'function')) {
      const callRegex = new RegExp(`\\b${entity.name}\\s*\\(`, 'g');
      if ([...content.matchAll(callRegex)].length > 1) {
        relations.push({ source: rootId, target: entity.id, type: 'calls' });
        relations.push({ source: rootId, target: entity.id, type: 'references' });
      }
    }

    return { entities, relations };
  }
}