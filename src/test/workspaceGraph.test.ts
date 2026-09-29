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

test('workspace indexer publishes status updates for initialize, upsert, and remove', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  let changes = 0;
  const dispose = indexer.onDidChange(() => {
    changes += 1;
  });

  await indexer.initialize([
    { info: file('src/a.ts'), languageId: 'typescript', content: 'export const a = 1;' },
  ]);
  assert.equal(indexer.getStatus().state, 'ready');
  assert.equal(indexer.getStatus().filesIndexed, 1);

  await indexer.upsertFile({
    info: file('src/b.ts'),
    languageId: 'typescript',
    content: "import { a } from './a'; export const b = a;",
  });
  assert.equal(indexer.getStatus().filesIndexed, 2);

  indexer.removeFile('/repo/src/a.ts');
  assert.equal(indexer.getStatus().filesIndexed, 1);
  assert.equal(changes >= 3, true);
  dispose();
});

test('workspace summary reports languages, entry points, tests, entities, and relationships', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/index.ts'), languageId: 'typescript', content: "import { helper } from './helper'; export const app = helper;" },
    { info: file('src/helper.ts'), languageId: 'typescript', content: 'export const helper = 1;' },
    { info: file('src/helper.test.ts'), languageId: 'typescript', content: 'export const test = true;' },
  ]);

  const summary = new GraphQueryService(indexer).buildWorkspaceSummary();

  assert.match(summary, /Indexed files: 3/);
  assert.match(summary, /typescript: 3/);
  assert.match(summary, /Entry points: src\/index\.ts/);
  assert.match(summary, /Tests detected: 1/);
  assert.match(summary, /Entities:/);
  assert.match(summary, /Relationships:/);
});

test('architecture summary reports dependency evidence for an indexed focus file', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/app.ts'), languageId: 'typescript', content: "import { helper } from './helper'; export const app = helper;" },
    { info: file('src/helper.ts'), languageId: 'typescript', content: 'export const helper = 1;' },
  ]);

  const summary = new GraphQueryService(indexer).buildArchitectureSummary('/repo/src/app.ts');

  assert.equal(summary.confidence, 'medium');
  assert.match(summary.content, /Focus: src\/app\.ts/);
  assert.match(summary.content, /src\/helper\.ts/);
  assert.match(summary.reason, /static imports/);
});

test('dependency graph can render forward and reverse bounded views', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/app.ts'), languageId: 'typescript', content: "import { service } from './service';" },
    { info: file('src/service.ts'), languageId: 'typescript', content: "import { util } from './util'; export const service = util;" },
    { info: file('src/util.ts'), languageId: 'typescript', content: 'export const util = 1;' },
  ]);

  const queries = new GraphQueryService(indexer);
  const forward = queries.buildDependencyGraph('/repo/src/app.ts', 1, false);
  const reverse = queries.buildDependencyGraph('/repo/src/util.ts', 2, true);

  assert.equal(forward.nodes.some(node => node.id === 'file:src/app.ts'), true);
  assert.equal(forward.nodes.some(node => node.id === 'file:src/service.ts'), true);
  assert.equal(forward.nodes.some(node => node.id === 'file:src/util.ts'), false);
  assert.equal(reverse.nodes.some(node => node.id === 'file:src/app.ts'), true);
  assert.equal(reverse.edges.length >= 2, true);
});

test('current feature inference stays folder-scoped and exposes confidence', async () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  await indexer.initialize([
    { info: file('src/orders/view.ts'), languageId: 'typescript', content: 'export const view = 1;' },
    { info: file('src/orders/service.ts'), languageId: 'typescript', content: 'export const service = 1;' },
    { info: file('src/users/view.ts'), languageId: 'typescript', content: 'export const userView = 1;' },
  ]);

  const result = new GraphQueryService(indexer).buildCurrentFeatureSummary('/repo/src/orders/view.ts');

  assert.equal(result.confidence, 'medium');
  assert.match(result.content, /Feature folder: src\/orders/);
  assert.match(result.content, /src\/orders\/service\.ts/);
  assert.doesNotMatch(result.content, /src\/users\/view\.ts/);
});


test('workspace indexer exposes an error state and notifies listeners', () => {
  const indexer = new WorkspaceIndexer([new JsTsLanguageAnalyzer()], new FallbackLanguageAnalyzer());
  let changes = 0;
  const dispose = indexer.onDidChange(() => {
    changes += 1;
  });

  indexer.markError('index failed');

  assert.equal(indexer.getStatus().state, 'error');
  assert.equal(indexer.getStatus().message, 'index failed');
  assert.equal(changes, 1);
  dispose();
});
