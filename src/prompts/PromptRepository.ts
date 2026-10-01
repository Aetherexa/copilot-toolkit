import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ContextBinding } from '../domain/context';
import {
  CollectionExportPayload,
  PromptCollection,
  PromptDefinition,
  PromptExportPayload,
  PromptRepositorySnapshot,
} from '../domain/prompt';
import { getConfigPath } from '../app/workspace';
import { getBuiltInPrompts } from './BuiltInPrompts';

const PROMPTS_KEY = 'copilotToolkit.studioPrompts';
const COLLECTIONS_KEY = 'copilotToolkit.promptCollections';
const FAVORITES_KEY = 'copilotToolkit.favoritePromptIds';

interface StoredPromptState {
  prompts: PromptDefinition[];
  collections: PromptCollection[];
}

type ImportPayload = PromptExportPayload | CollectionExportPayload;

function defaultContextBindings(): ContextBinding[] {
  return [
    {
      type: 'currentFile',
      enabled: true,
      label: 'Current File',
      options: { maxTokens: 1200, detail: 'medium' },
    },
    {
      type: 'currentSelection',
      enabled: false,
      label: 'Selected Code',
      options: { maxTokens: 800, detail: 'high' },
    },
  ];
}

function timestamp(): number {
  return Date.now();
}

function createId(prefix: string): string {
  return `${prefix}-${timestamp()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePrompt(input: PromptDefinition): PromptDefinition {
  const now = timestamp();
  return {
    ...input,
    id: input.id || createId('prompt'),
    description: input.description ?? '',
    category: input.category || 'Custom Prompt',
    tags: [...new Set((input.tags ?? []).map(tag => tag.trim()).filter(Boolean))],
    skillIds: [...new Set((input.skillIds ?? []).map(skillId => skillId.trim().toLowerCase()).filter(Boolean))],
    context: input.context?.length ? input.context : defaultContextBindings(),
    contextBudgetTokens: input.contextBudgetTokens ?? 1800,
    providerId: input.providerId ?? 'github-copilot',
    modelId: input.modelId ?? 'copilot-default',
    source: input.source ?? 'workspace',
    favorite: Boolean(input.favorite),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

function normalizeCollection(collection: PromptCollection): PromptCollection {
  const now = timestamp();
  return {
    ...collection,
    id: collection.id || createId('collection'),
    promptIds: [...new Set(collection.promptIds)],
    createdAt: collection.createdAt || now,
    updatedAt: now,
  };
}

export function createSeedPrompt(): PromptDefinition {
  const prompts = getBuiltInPrompts();
  return prompts.find(prompt => prompt.id === 'studio-react-pr-review') ?? prompts[0];
}

function toImportedPrompt(filePath: string, body: string): PromptDefinition {
  const now = timestamp();
  const fileName = path.basename(filePath, '.md');
  return {
    id: `import:${fileName.toLowerCase()}`,
    name: fileName,
    description: `Imported from ${filePath}`,
    category: 'Imported Prompt',
    tags: ['imported', 'markdown'],
    body,
    favorite: false,
    skillIds: [],
    context: defaultContextBindings(),
    contextBudgetTokens: 1800,
    providerId: 'github-copilot',
    modelId: 'copilot-default',
    source: 'imported',
    createdAt: now,
    updatedAt: now,
  };
}

function validatePromptDefinition(payload: unknown): payload is PromptDefinition {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<PromptDefinition>;
  return typeof candidate.name === 'string'
    && typeof candidate.category === 'string'
    && typeof candidate.body === 'string'
    && Array.isArray(candidate.tags)
    && Array.isArray(candidate.context);
}

function validatePromptCollection(payload: unknown): payload is PromptCollection {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<PromptCollection>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.promptIds);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'copilot-toolkit-export';
}

export class PromptRepository {
  constructor(private readonly state: vscode.Memento) {}

  async loadSnapshot(): Promise<PromptRepositorySnapshot> {
    const stored = this.loadStoredState();
    const imported = this.loadImportedPrompts();
    const favoriteIds = new Set(this.state.get<string[]>(FAVORITES_KEY, []));

    // Preserve favorites created before favorite IDs were stored independently.
    for (const prompt of stored.prompts) {
      if (prompt.favorite) {
        favoriteIds.add(prompt.id);
      }
    }

    const merged = new Map<string, PromptDefinition>();
    for (const prompt of [...getBuiltInPrompts(), ...stored.prompts, ...imported]) {
      if (!merged.has(prompt.id)) {
        merged.set(prompt.id, {
          ...prompt,
          favorite: favoriteIds.has(prompt.id),
        });
      }
    }

    return {
      prompts: [...merged.values()],
      collections: stored.collections,
    };
  }

  async loadPrompts(): Promise<PromptDefinition[]> {
    return (await this.loadSnapshot()).prompts;
  }

  async createPrompt(name = 'Untitled Prompt'): Promise<{ snapshot: PromptRepositorySnapshot; prompt: PromptDefinition }> {
    const prompt = normalizePrompt({
      id: createId('prompt'),
      name,
      description: '',
      category: 'My Prompt',
      tags: [],
      body: '',
      skillIds: [],
      favorite: false,
      context: defaultContextBindings(),
      contextBudgetTokens: 1800,
      providerId: 'github-copilot',
      modelId: 'copilot-default',
      source: 'workspace',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });

    const stored = this.loadStoredState();
    stored.prompts.unshift(prompt);
    await this.saveStoredState(stored);
    return { snapshot: await this.loadSnapshot(), prompt };
  }

  async savePrompt(prompt: PromptDefinition, mode: 'save' | 'saveAs' = 'save'): Promise<{ snapshot: PromptRepositorySnapshot; savedPrompt: PromptDefinition }> {
    const stored = this.loadStoredState();
    const shouldClone = mode === 'saveAs' || prompt.source === 'imported' || prompt.source === 'builtin';
    const normalized = normalizePrompt({
      ...prompt,
      id: shouldClone ? createId('prompt') : prompt.id,
      source: 'workspace',
      createdAt: shouldClone ? timestamp() : prompt.createdAt,
    });
    const index = stored.prompts.findIndex(item => item.id === normalized.id);

    if (index >= 0) {
      stored.prompts[index] = normalized;
    } else {
      stored.prompts.unshift(normalized);
    }

    await this.saveStoredState(stored);
    return { snapshot: await this.loadSnapshot(), savedPrompt: normalized };
  }

  async deletePrompt(promptId: string): Promise<PromptRepositorySnapshot> {
    const stored = this.loadStoredState();
    stored.prompts = stored.prompts.filter(prompt => prompt.id !== promptId);
    stored.collections = stored.collections.map(collection => ({
      ...collection,
      promptIds: collection.promptIds.filter(id => id !== promptId),
      updatedAt: timestamp(),
    }));
    await this.saveStoredState(stored);
    return this.loadSnapshot();
  }

  async duplicatePrompt(promptId: string): Promise<{ snapshot: PromptRepositorySnapshot; duplicatedPrompt: PromptDefinition }> {
    const snapshot = await this.loadSnapshot();
    const source = snapshot.prompts.find(prompt => prompt.id === promptId);
    if (!source) {
      throw new Error('Prompt not found.');
    }

    const result = await this.savePrompt({
      ...source,
      id: createId('prompt'),
      name: `${source.name} Copy`,
      favorite: false,
      source: 'workspace',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    }, 'saveAs');

    return { snapshot: result.snapshot, duplicatedPrompt: result.savedPrompt };
  }

  async setFavorite(promptId: string, favorite: boolean): Promise<PromptRepositorySnapshot> {
    const snapshot = await this.loadSnapshot();
    if (!snapshot.prompts.some(prompt => prompt.id === promptId)) {
      throw new Error('Prompt not found.');
    }

    const favoriteIds = new Set(this.state.get<string[]>(FAVORITES_KEY, []));
    if (favorite) {
      favoriteIds.add(promptId);
    } else {
      favoriteIds.delete(promptId);
    }
    await this.state.update(FAVORITES_KEY, [...favoriteIds]);

    // Keep the legacy flag synchronized for saved workspace prompts.
    const stored = this.loadStoredState();
    const workspacePrompt = stored.prompts.find(item => item.id === promptId);
    if (workspacePrompt) {
      workspacePrompt.favorite = favorite;
      workspacePrompt.updatedAt = timestamp();
      await this.saveStoredState(stored);
    }

    return this.loadSnapshot();
  }

  async createCollection(name = 'New Collection'): Promise<{ snapshot: PromptRepositorySnapshot; collection: PromptCollection }> {
    const stored = this.loadStoredState();
    const collection = normalizeCollection({
      id: createId('collection'),
      name,
      promptIds: [],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });

    stored.collections.unshift(collection);
    await this.saveStoredState(stored);
    return { snapshot: await this.loadSnapshot(), collection };
  }

  async renameCollection(collectionId: string, name: string): Promise<PromptRepositorySnapshot> {
    const stored = this.loadStoredState();
    const collection = stored.collections.find(item => item.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found.');
    }

    collection.name = name.trim() || collection.name;
    collection.updatedAt = timestamp();
    await this.saveStoredState(stored);
    return this.loadSnapshot();
  }

  async deleteCollection(collectionId: string): Promise<PromptRepositorySnapshot> {
    const stored = this.loadStoredState();
    stored.collections = stored.collections.filter(collection => collection.id !== collectionId);
    await this.saveStoredState(stored);
    return this.loadSnapshot();
  }

  async addPromptToCollection(collectionId: string, promptId: string): Promise<PromptRepositorySnapshot> {
    const stored = this.loadStoredState();
    const collection = stored.collections.find(item => item.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found.');
    }

    if (!collection.promptIds.includes(promptId)) {
      collection.promptIds.push(promptId);
      collection.updatedAt = timestamp();
      await this.saveStoredState(stored);
    }

    return this.loadSnapshot();
  }

  async removePromptFromCollection(collectionId: string, promptId: string): Promise<PromptRepositorySnapshot> {
    const stored = this.loadStoredState();
    const collection = stored.collections.find(item => item.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found.');
    }

    collection.promptIds = collection.promptIds.filter(id => id !== promptId);
    collection.updatedAt = timestamp();
    await this.saveStoredState(stored);
    return this.loadSnapshot();
  }

  async importFromJson(): Promise<{ snapshot: PromptRepositorySnapshot; importedPromptIds: string[]; importedCollectionIds: string[] }> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: 'Import Copilot Toolkit JSON',
    });

    if (!picked || picked.length === 0) {
      throw new Error('Import cancelled.');
    }

    const raw = await vscode.workspace.fs.readFile(picked[0]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(raw).toString('utf8')) as unknown;
    } catch {
      throw new Error('Selected file is not valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Selected file is malformed.');
    }

    const payload = parsed as Partial<ImportPayload>;
    if (payload.schemaVersion !== 1 || (payload.kind !== 'prompt' && payload.kind !== 'collection')) {
      throw new Error('Unsupported import schema.');
    }

    const stored = this.loadStoredState();
    const importedPromptIds: string[] = [];
    const importedCollectionIds: string[] = [];

    if (payload.kind === 'prompt') {
      if (!validatePromptDefinition(payload.prompt)) {
        throw new Error('Prompt export is malformed.');
      }

      const saved = normalizePrompt({
        ...payload.prompt,
        id: createId('prompt'),
        source: 'workspace',
      });
      if (stored.prompts.some(prompt => prompt.name === saved.name)) {
        saved.name = `${saved.name} Imported`;
      }
      stored.prompts.unshift(saved);
      importedPromptIds.push(saved.id);
    }

    if (payload.kind === 'collection') {
      if (!validatePromptCollection(payload.collection) || !Array.isArray(payload.prompts) || !payload.prompts.every(validatePromptDefinition)) {
        throw new Error('Collection export is malformed.');
      }

      const importedCollectionPayload = payload.collection;

      const promptIdMap = new Map<string, string>();
      for (const prompt of payload.prompts) {
        const saved = normalizePrompt({
          ...prompt,
          id: createId('prompt'),
          source: 'workspace',
        });
        if (stored.prompts.some(existing => existing.name === saved.name)) {
          saved.name = `${saved.name} Imported`;
        }
        stored.prompts.unshift(saved);
        importedPromptIds.push(saved.id);
        promptIdMap.set(prompt.id, saved.id);
      }

      const importedCollection = normalizeCollection({
        ...importedCollectionPayload,
        id: createId('collection'),
        name: stored.collections.some(collection => collection.name === importedCollectionPayload.name)
          ? `${importedCollectionPayload.name} Imported`
          : importedCollectionPayload.name,
        promptIds: importedCollectionPayload.promptIds.map(id => promptIdMap.get(id)).filter((id): id is string => Boolean(id)),
      });
      stored.collections.unshift(importedCollection);
      importedCollectionIds.push(importedCollection.id);
    }

    await this.saveStoredState(stored);
    return { snapshot: await this.loadSnapshot(), importedPromptIds, importedCollectionIds };
  }

  async exportPrompt(promptId: string): Promise<string> {
    const snapshot = await this.loadSnapshot();
    const prompt = snapshot.prompts.find(item => item.id === promptId);
    if (!prompt) {
      throw new Error('Prompt not found.');
    }

    return this.exportJson(`${sanitizeFileName(prompt.name)}.json`, {
      schemaVersion: 1,
      kind: 'prompt',
      prompt,
    });
  }

  async exportCollection(collectionId: string): Promise<string> {
    const snapshot = await this.loadSnapshot();
    const collection = snapshot.collections.find(item => item.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found.');
    }

    const prompts = snapshot.prompts.filter(prompt => collection.promptIds.includes(prompt.id));
    return this.exportJson(`${sanitizeFileName(collection.name)}.json`, {
      schemaVersion: 1,
      kind: 'collection',
      collection,
      prompts,
    });
  }

  private async exportJson(defaultFileName: string, payload: ImportPayload): Promise<string> {
    const baseDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const target = await vscode.window.showSaveDialog({
      saveLabel: 'Export Copilot Toolkit JSON',
      defaultUri: vscode.Uri.file(path.join(baseDir, defaultFileName)),
      filters: { JSON: ['json'] },
    });

    if (!target) {
      throw new Error('Export cancelled.');
    }

    await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
    return target.fsPath;
  }

  private loadStoredState(): StoredPromptState {
    const persistedPrompts = this.state.get<PromptDefinition[]>(PROMPTS_KEY, []);
    const persistedCollections = this.state.get<PromptCollection[]>(COLLECTIONS_KEY, []);
    const prompts = persistedPrompts.map(prompt => normalizePrompt({
      ...prompt,
      updatedAt: prompt.updatedAt || prompt.createdAt,
    }));

    return {
      prompts,
      collections: persistedCollections.map(collection => normalizeCollection({ ...collection, updatedAt: collection.updatedAt || collection.createdAt })),
    };
  }

  private async saveStoredState(state: StoredPromptState): Promise<void> {
    await this.state.update(PROMPTS_KEY, state.prompts);
    await this.state.update(COLLECTIONS_KEY, state.collections);
  }

  private loadImportedPrompts(): PromptDefinition[] {
    const promptFolder = getConfigPath('promptFolder');
    if (!promptFolder || !fs.existsSync(promptFolder)) {
      return [];
    }

    try {
      return fs.readdirSync(promptFolder)
        .filter(file => file.endsWith('.md'))
        .map(file => path.join(promptFolder, file))
        .map(filePath => {
          try {
            const body = fs.readFileSync(filePath, 'utf8').trim();
            return body ? toImportedPrompt(filePath, body) : undefined;
          } catch {
            return undefined;
          }
        })
        .filter((prompt): prompt is PromptDefinition => Boolean(prompt));
    } catch {
      return [];
    }
  }
}