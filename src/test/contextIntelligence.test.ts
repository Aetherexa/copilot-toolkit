import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextEngine } from '../context/ContextEngine';
import { ContextRanker } from '../context/ContextRanker';
import { ContextRegistry } from '../context/ContextRegistry';
import { RelatedFilesEngine } from '../context/RelatedFilesEngine';
import { GitDiffResolver } from '../context/resolvers/GitDiffResolver';
import { SelectedFilesResolver } from '../context/resolvers/SelectedFilesResolver';
import { ContextBinding, ContextResolver, ResolvedContext } from '../domain/context';
import { TokenEstimator } from '../services/TokenEstimator';
import { WorkspaceFileInfo } from '../services/WorkspaceIndexService';

class StubResolver implements ContextResolver {
  constructor(
    readonly type: ContextBinding['type'],
    private readonly value?: ResolvedContext | ResolvedContext[],
  ) {}

  async resolve(): Promise<ResolvedContext | ResolvedContext[] | undefined> {
    return this.value;
  }
}

function createFile(absolutePath: string, relativePath: string, options: Partial<WorkspaceFileInfo> = {}): WorkspaceFileInfo {
  return {
    absolutePath,
    relativePath,
    directory: relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '',
    name: relativePath.split('/').at(-1) ?? relativePath,
    baseName: (relativePath.split('/').at(-1) ?? relativePath).replace(/\.[^.]+$/, ''),
    extension: '.ts',
    size: 100,
    mtimeMs: 1,
    isTest: false,
    isProjectMetadata: false,
    ...options,
  };
}

test('ContextEngine enforces budget and trims lower value context', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('currentSelection', {
    type: 'currentSelection',
    title: 'Selection',
    content: 'x'.repeat(200),
    tokenEstimate: 50,
    truncated: false,
    relevanceScore: 100,
  }));
  registry.register(new StubResolver('relatedFiles', {
    type: 'relatedFiles',
    title: 'Related',
    content: 'y'.repeat(1000),
    tokenEstimate: 250,
    truncated: false,
    relevanceScore: 40,
  }));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([
    { type: 'currentSelection', enabled: true },
    { type: 'relatedFiles', enabled: true },
  ], 100);

  assert.equal(result.includedTokens <= 100, true);
  assert.equal(result.items[0].status, 'included');
  assert.equal(result.items[1].truncated || result.items[1].status === 'excluded', true);
});

test('ContextEngine removes duplicate context entries deterministically', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('openEditors', [
    {
      type: 'openEditors',
      title: 'A',
      content: 'same-content',
      tokenEstimate: 3,
      truncated: false,
      source: { path: '/a.ts' },
      relevanceScore: 70,
    },
    {
      type: 'openEditors',
      title: 'A duplicate',
      content: 'same-content',
      tokenEstimate: 3,
      truncated: false,
      source: { path: '/a.ts' },
      relevanceScore: 60,
    },
  ]));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([{ type: 'openEditors', enabled: true }], 200);
  assert.equal(result.items.filter(item => item.status === 'included').length, 1);
  assert.equal(result.items.filter(item => item.status === 'excluded').length, 1);
});

test('RelatedFilesEngine ranking is deterministic', async () => {
  const target = createFile('/repo/src/app.ts', 'src/app.ts');
  const helper = createFile('/repo/src/app.helpers.ts', 'src/app.helpers.ts');
  const other = createFile('/repo/src/other.ts', 'src/other.ts');
  const workspaceIndex = {
    getFileInfo: async (filePath: string) => [target, helper, other].find(file => file.absolutePath === filePath),
    getWorkspaceFiles: async () => [target, helper, other],
    resolveRelativeImports: async (filePath: string) => filePath === target.absolutePath ? [helper.absolutePath] : [],
    getNameTokens: (file: WorkspaceFileInfo) => file.baseName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    getOpenEditorFiles: async () => [helper],
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService;
  const gitService = {
    wasFileRecentlyChanged: async (filePath: string) => filePath === helper.absolutePath,
  } as never;

  const engine = new RelatedFilesEngine(workspaceIndex, gitService, {
    getDependencies: () => [],
    getReverseDependencies: () => [],
    getReferences: () => [],
  } as never);
  const result = await engine.rankRelatedFiles(target.absolutePath, 5);
  assert.equal(result[0]?.file.absolutePath, helper.absolutePath);
});

test('RelatedFilesEngine detects related tests using common naming patterns', async () => {
  const source = createFile('/repo/src/userService.ts', 'src/userService.ts');
  const testFile = createFile('/repo/src/__tests__/userService.test.ts', 'src/__tests__/userService.test.ts', { isTest: true });
  const unrelatedTest = createFile('/repo/tests/other.spec.ts', 'tests/other.spec.ts', { isTest: true });
  const workspaceIndex = {
    getFileInfo: async (filePath: string) => [source, testFile, unrelatedTest].find(file => file.absolutePath === filePath),
    getWorkspaceFiles: async () => [source, testFile, unrelatedTest],
    getNameTokens: (file: WorkspaceFileInfo) => file.baseName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService;
  const engine = new RelatedFilesEngine(workspaceIndex, {} as never, {
    getDependencies: () => [],
    getReverseDependencies: () => [],
    getReferences: () => [],
  } as never);

  const result = await engine.rankRelatedTests(source.absolutePath, 5);
  assert.equal(result[0]?.file.absolutePath, testFile.absolutePath);
});

test('SelectedFilesResolver resolves only explicitly selected files in requested order', async () => {
  const first = createFile('/repo/src/first.ts', 'src/first.ts');
  const second = createFile('/repo/src/second.ts', 'src/second.ts');
  const ignored = createFile('/repo/src/ignored.ts', 'src/ignored.ts');
  const workspaceIndex = {
    getWorkspaceFiles: async () => [first, second, ignored],
    readFileExcerpt: async (filePath: string) => ({
      content: `content:${filePath}`,
      truncated: false,
      tokenEstimate: 10,
      originalTokenEstimate: 10,
      lineCount: 1,
    }),
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService;

  const resolver = new SelectedFilesResolver(workspaceIndex);
  const result = await resolver.resolve({
    type: 'selectedFiles',
    enabled: true,
    options: {
      filePaths: ['src/second.ts', 'src/first.ts'],
      maxTokens: 200,
    },
  });

  assert.deepEqual(result.map(item => item.source?.label), ['src/second.ts', 'src/first.ts']);
  assert.equal(result.every(item => item.reason === 'Manually selected by developer'), true);
  assert.equal(result.some(item => item.source?.label === 'src/ignored.ts'), false);
});

test('ContextEngine prioritizes selected files ahead of automatic related files', async () => {
  const registry = new ContextRegistry();
  registry.register(new StubResolver('selectedFiles', {
    type: 'selectedFiles',
    title: 'Pinned',
    content: 'p'.repeat(160),
    tokenEstimate: 40,
    truncated: false,
  }));
  registry.register(new StubResolver('relatedFiles', {
    type: 'relatedFiles',
    title: 'Related',
    content: 'r'.repeat(400),
    tokenEstimate: 100,
    truncated: false,
  }));
  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());

  const result = await engine.resolve([
    { type: 'relatedFiles', enabled: true },
    { type: 'selectedFiles', enabled: true },
  ], 50);

  assert.equal(result.items[0].type, 'selectedFiles');
  assert.equal(result.items[0].status, 'included');
});

test('Git-backed resolvers handle unavailable repositories gracefully', async () => {
  const resolver = new GitDiffResolver({
    getDiff: async () => undefined,
  } as never, new TokenEstimator());

  assert.equal(await resolver.resolve({ type: 'gitDiff', enabled: true }), undefined);
});

test('RelatedFilesEngine returns no candidates when the target file is not indexed', async () => {
  const engine = new RelatedFilesEngine({
    getFileInfo: async () => undefined,
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService, {} as never, {
    getDependencies: () => [],
    getReverseDependencies: () => [],
    getReferences: () => [],
  } as never);

  assert.deepEqual(await engine.rankRelatedFiles('/repo/missing.ts', 5), []);
  assert.deepEqual(await engine.rankRelatedTests('/repo/missing.ts', 5), []);
});

test('RelatedFilesEngine combines graph, path, open-editor, git, metadata, and reverse-import signals', async () => {
  const target = createFile('/repo/src/feature/orderService.ts', 'src/feature/orderService.ts');
  const strongest = createFile('/repo/src/feature/orderRepository.ts', 'src/feature/orderRepository.ts', { isProjectMetadata: true });
  const parentFeature = createFile('/repo/src/shared/orderMapper.ts', 'src/shared/orderMapper.ts');
  const testFile = createFile('/repo/src/feature/orderService.test.ts', 'src/feature/orderService.test.ts', { isTest: true });
  const workspaceIndex = {
    getFileInfo: async (filePath: string) => [target, strongest, parentFeature, testFile].find(file => file.absolutePath === filePath),
    getWorkspaceFiles: async () => [target, strongest, parentFeature, testFile],
    resolveRelativeImports: async (filePath: string) => {
      if (filePath === target.absolutePath) return [strongest.absolutePath];
      if (filePath === strongest.absolutePath) return [target.absolutePath];
      return [];
    },
    getNameTokens: (file: WorkspaceFileInfo) => file.baseName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
    getOpenEditorFiles: async () => [strongest],
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService;
  const gitService = {
    wasFileRecentlyChanged: async (filePath: string) => filePath === strongest.absolutePath,
  } as never;
  const graph = {
    getDependencies: () => [`file:${strongest.relativePath}`],
    getReverseDependencies: () => [`file:${strongest.relativePath}`],
    getReferences: () => [`file:${strongest.relativePath}`],
  } as never;

  const engine = new RelatedFilesEngine(workspaceIndex, gitService, graph);
  const result = await engine.rankRelatedFiles(target.absolutePath, 1);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.file.absolutePath, strongest.absolutePath);
  assert.match(result[0]?.reason ?? '', /Imported by active file/);
  assert.match(result[0]?.reason ?? '', /Direct dependency in code graph/);
  assert.match(result[0]?.reason ?? '', /Reverse dependency in code graph/);
  assert.match(result[0]?.reason ?? '', /Referenced in graph/);
  assert.match(result[0]?.reason ?? '', /References active file/);
  assert.match(result[0]?.reason ?? '', /Same folder/);
  assert.match(result[0]?.reason ?? '', /Filename similarity/);
  assert.match(result[0]?.reason ?? '', /Currently open/);
  assert.match(result[0]?.reason ?? '', /Recently changed in Git/);
  assert.match(result[0]?.reason ?? '', /Project metadata/);
});

test('RelatedFilesEngine scores shared feature paths without requiring same folder', async () => {
  const target = createFile('/repo/src/features/orders/ui/orderView.ts', 'src/features/orders/ui/orderView.ts');
  const related = createFile('/repo/src/features/orders/data/orderStore.ts', 'src/features/orders/data/orderStore.ts');
  const workspaceIndex = {
    getFileInfo: async () => target,
    getWorkspaceFiles: async () => [target, related],
    resolveRelativeImports: async () => [],
    getNameTokens: (file: WorkspaceFileInfo) => file.baseName.toLowerCase().match(/[a-z]+/g) ?? [],
    getOpenEditorFiles: async () => [],
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService;
  const engine = new RelatedFilesEngine(workspaceIndex, {
    wasFileRecentlyChanged: async () => false,
  } as never, {
    getDependencies: () => [],
    getReverseDependencies: () => [],
    getReferences: () => [],
  } as never);

  const result = await engine.rankRelatedFiles(target.absolutePath, 5);

  assert.equal(result[0]?.file.absolutePath, related.absolutePath);
  assert.match(result[0]?.reason ?? '', /Same feature path/);
});

test('RelatedFilesEngine related-test ranking combines nearby, graph, token, and filename evidence', async () => {
  const source = createFile('/repo/src/user/userService.ts', 'src/user/userService.ts');
  const direct = createFile('/repo/src/user/__tests__/userService.test.ts', 'src/user/__tests__/userService.test.ts', { isTest: true });
  const nearby = createFile('/repo/src/user/__tests__/misc.test.ts', 'src/user/__tests__/misc.test.ts', { isTest: true });
  const workspaceIndex = {
    getFileInfo: async () => source,
    getWorkspaceFiles: async () => [source, direct, nearby],
    getNameTokens: (file: WorkspaceFileInfo) => file.baseName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService;
  const graph = {
    getDependencies: () => [`file:${direct.relativePath}`],
  } as never;

  const engine = new RelatedFilesEngine(workspaceIndex, {} as never, graph);
  const result = await engine.rankRelatedTests(source.absolutePath, 1);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.file.absolutePath, direct.absolutePath);
  assert.match(result[0]?.reason ?? '', /Nearby test folder/);
  assert.match(result[0]?.reason ?? '', /Dependency-adjacent test/);
  assert.match(result[0]?.reason ?? '', /Test name matches feature/);
  assert.match(result[0]?.reason ?? '', /Direct filename match/);
});

test('SelectedFilesResolver returns empty context when no file paths are configured', async () => {
  let workspaceRead = false;
  const resolver = new SelectedFilesResolver({
    getWorkspaceFiles: async () => {
      workspaceRead = true;
      return [];
    },
  } as unknown as import('../services/WorkspaceIndexService').WorkspaceIndexService);

  const result = await resolver.resolve({ type: 'selectedFiles', enabled: true });

  assert.deepEqual(result, []);
  assert.equal(workspaceRead, false);
});


test('ContextEngine propagates the total token budget to resolvers', async () => {
  let observedBudget: number | undefined;
  const registry = new ContextRegistry();
  registry.register({
    type: 'stackGenome',
    async resolve(binding) {
      observedBudget = binding.options?.totalBudgetTokens;
      return {
        type: 'stackGenome',
        title: 'StackGenome',
        content: 'ecosystem',
        tokenEstimate: 3,
        truncated: false,
      };
    },
  });

  const engine = new ContextEngine(registry, new ContextRanker(), new TokenEstimator());
  await engine.resolve([{ type: 'stackGenome', enabled: true }], 900);

  assert.equal(observedBudget, 900);
});
