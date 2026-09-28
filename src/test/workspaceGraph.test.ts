import test from 'node:test';
import assert from 'node:assert/strict';
import { FallbackLanguageAnalyzer } from '../analyzers/FallbackLanguageAnalyzer';
import { JsTsLanguageAnalyzer } from '../analyzers/JsTsLanguageAnalyzer';
import { GraphQueryService } from '../services/GraphQueryService';
import { WorkspaceIndexer } from '../services/WorkspaceIndexer';
import { WorkspaceFileInfo } from '../services/WorkspaceIndexService';
import { isTestPath, shouldIndexFile } from '../services/workspaceFileFilters';

function file(relativePath: string, extension = '.ts'): WorkspaceFileInfo {
  return {
    absolutePath: `/repo/${relativePath}`,
    relativePath,
    directory: relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '',
    name: relativePath.split('/').at(-1) ?? relativePath,
    baseName: (relativePath.split('/').at(-1) ?? relativePath).replace(/\.[^.]+$/, ''),
    extension,
    size: 100,
    mtimeMs: 1,
    isTest: isTestPath(relativePath),
    isProjectMetadata: relativePath.endsWith('package.json'),
  };
}

test('workspace file filters ignore generated and large files', () => {
  assert.equal(shouldIndexFile('/repo/node_modules/react/index.js', 100), false);
  assert.equal(shouldIndexFile('/repo/dist/app.js', 100), false);
  assert.equal(shouldIndexFile('/repo/src/app.ts', 600000), false);
  assert.equal(shouldIndexFile('/repo/src/app.ts', 100), true);
});

test('workspace indexer builds entities and relations incrementally', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/a.ts'), languageId: 'typescript', content: "import { b } from './b';\nexport function a() { return b(); }" },
    { info: file('src/b.ts'), languageId: 'typescript', content: 'export function b() { return 1; }' },
  ]);

  assert.equal(indexer.getFiles().length, 2);
  assert.equal(indexer.getRelations().some(relation => relation.type === 'imports'), true);

  await indexer.upsertFile({ info: file('src/c.ts'), languageId: 'typescript', content: 'export const c = 1;' });
  assert.equal(indexer.getFiles().length, 3);

  indexer.removeFile('/repo/src/c.ts');
  assert.equal(indexer.getFiles().length, 2);
});

test('graph query service returns dependencies and reverse dependencies', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/app.ts'), languageId: 'typescript', content: "import { helper } from './helper';\nexport function app() { return helper(); }" },
    { info: file('src/helper.ts'), languageId: 'typescript', content: 'export function helper() { return 1; }' },
  ]);

  const queries = new GraphQueryService(indexer);
  assert.deepEqual(queries.getDependencies('src/app.ts', 1), ['file:src/helper.ts']);
  assert.deepEqual(queries.getReverseDependencies('src/helper.ts', 1), ['file:src/app.ts']);
});

test('graph query service computes shortest dependency path and impacted files', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/app.ts'), languageId: 'typescript', content: "import { helper } from './helper';" },
    { info: file('src/helper.ts'), languageId: 'typescript', content: "import { util } from './util';" },
    { info: file('src/util.ts'), languageId: 'typescript', content: 'export const util = 1;' },
  ]);

  const queries = new GraphQueryService(indexer);
  const path = queries.shortestDependencyPath('src/app.ts', 'src/util');
  assert.equal(path.length >= 2, true);
  assert.equal(queries.getImpactedFiles('src/util.ts', 2).includes('file:src/app.ts'), true);
});

test('fallback analyzer handles unsupported languages gracefully', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/script.swift', '.swift'), languageId: 'swift', content: 'print("hello")' },
  ]);

  assert.equal(indexer.getEntities().length, 1);
  assert.equal(indexer.getEntities()[0].type, 'file');
});