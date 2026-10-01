import test from 'node:test';
import assert from 'node:assert/strict';
import { AIProvider } from '../domain/provider';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { RegisteredProvider } from '../providers/RegisteredProvider';
import { ExecutionHistoryStore, MementoLike } from '../services/ExecutionHistoryStore';
import { redactSecrets } from '../services/SecretRedactor';
import { isSensitiveFilePath, isTestPath, PROJECT_METADATA_FILES, shouldIndexFile } from '../services/workspaceFileFilters';

class MemoryMemento implements MementoLike {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.store.get(key) as T | undefined) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

function executionRecord(id: string, timestamp = 1) {
  return {
    id,
    promptId: 'prompt',
    promptName: 'Prompt',
    timestamp,
    providerId: 'provider',
    providerName: 'Provider',
    status: 'success' as const,
    durationMs: 10,
    usage: {},
    contextItemCount: 0,
    requestPreview: 'request',
  };
}

function providerDefinition(id: string, enabled = true): AIProvider {
  return {
    id,
    name: id,
    enabled,
    models: [
      { id: `${id}-primary`, name: 'Primary', enabled: true },
      { id: `${id}-secondary`, name: 'Secondary', enabled: true },
    ],
  };
}

function registeredProvider(initial: AIProvider, refreshed: AIProvider = initial): RegisteredProvider {
  return {
    definition: initial,
    async refreshDefinition() {
      return refreshed;
    },
    async execute() {
      return {
        success: true,
        providerId: initial.id,
        responseText: 'ok',
      };
    },
  };
}

test('ExecutionHistoryStore saves newest records first and de-duplicates an execution id', async () => {
  const store = new ExecutionHistoryStore(new MemoryMemento());

  await store.save(executionRecord('a', 1));
  await store.save(executionRecord('b', 2));
  await store.save(executionRecord('a', 3));

  assert.deepEqual(store.load().map(item => item.id), ['a', 'b']);
  assert.equal(store.load()[0]?.timestamp, 3);
});

test('ExecutionHistoryStore caps history at 50 records', async () => {
  const store = new ExecutionHistoryStore(new MemoryMemento());

  for (let index = 0; index < 55; index += 1) {
    await store.save(executionRecord(`record-${index}`, index));
  }

  assert.equal(store.load().length, 50);
  assert.equal(store.load()[0]?.id, 'record-54');
  assert.equal(store.load().at(-1)?.id, 'record-5');
});

test('ExecutionHistoryStore delete and clear persist their results', async () => {
  const store = new ExecutionHistoryStore(new MemoryMemento());
  await store.save(executionRecord('a'));
  await store.save(executionRecord('b'));

  const afterDelete = await store.delete('a');
  assert.deepEqual(afterDelete.map(item => item.id), ['b']);

  await store.clear();
  assert.deepEqual(store.load(), []);
});

test('ProviderRegistry registers providers and lists only enabled definitions', () => {
  const registry = new ProviderRegistry();
  registry.register(registeredProvider(providerDefinition('enabled')));
  registry.register(registeredProvider(providerDefinition('disabled', false)));

  assert.equal(registry.get('enabled')?.definition.id, 'enabled');
  assert.equal(registry.get('missing'), undefined);
  assert.deepEqual(registry.list().map(item => item.id), ['enabled']);
});

test('ProviderRegistry refresh filters disabled refreshed providers', async () => {
  const registry = new ProviderRegistry();
  registry.register(registeredProvider(providerDefinition('one'), providerDefinition('one', true)));
  registry.register(registeredProvider(providerDefinition('two'), providerDefinition('two', false)));

  const refreshed = await registry.refresh();

  assert.deepEqual(refreshed.map(item => item.id), ['one']);
});

test('ProviderRegistry resolves requested, fallback, and missing models', () => {
  const registry = new ProviderRegistry();
  registry.register(registeredProvider(providerDefinition('provider')));

  assert.equal(registry.getModel('provider', 'provider-secondary')?.id, 'provider-secondary');
  assert.equal(registry.getModel('provider', 'does-not-exist')?.id, 'provider-primary');
  assert.equal(registry.getModel('missing', 'model'), undefined);
});

test('redactSecrets leaves ordinary and empty content unchanged', () => {
  assert.deepEqual(redactSecrets(''), { text: '', redactionCount: 0 });
  assert.deepEqual(redactSecrets('const greeting = "hello";'), {
    text: 'const greeting = "hello";',
    redactionCount: 0,
  });
});

test('redactSecrets handles environment, object, authorization, AWS, GitHub, and private-key formats', () => {
  const input = [
    'API_KEY=super-secret-value',
    'password: "password-value"',
    'Authorization: Bearer bearer-value',
    'AKIA1234567890ABCDEF',
    'github_pat_abcdefghijklmnopqrstuvwxyz123456',
    '-----BEGIN PRIVATE KEY-----',
    'private-material',
    '-----END PRIVATE KEY-----',
  ].join('\n');

  const result = redactSecrets(input);

  assert.ok(result.redactionCount >= 6);
  assert.doesNotMatch(result.text, /super-secret-value/);
  assert.doesNotMatch(result.text, /password-value/);
  assert.doesNotMatch(result.text, /bearer-value/);
  assert.doesNotMatch(result.text, /AKIA1234567890ABCDEF/);
  assert.doesNotMatch(result.text, /github_pat_abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result.text, /private-material/);
  assert.match(result.text, /\[REDACTED\]/);
});

test('isTestPath recognizes common JavaScript, Python, and test-folder conventions', () => {
  assert.equal(isTestPath('src/__tests__/service.ts'), true);
  assert.equal(isTestPath('src/service.test.ts'), true);
  assert.equal(isTestPath('src/service.spec.ts'), true);
  assert.equal(isTestPath('tests/service_test.py'), true);
  assert.equal(isTestPath('tests/test.py'), true);
  assert.equal(isTestPath('src/service.ts'), false);
});

test('isSensitiveFilePath detects credential directories and common secret file names', () => {
  for (const filePath of [
    '/repo/.ssh/id_rsa',
    '/repo/.aws/credentials',
    '/repo/.azure/config',
    '/repo/.gnupg/private-keys-v1.d/key',
    '/repo/.kube/config',
    '/repo/.env',
    '/repo/.env.production',
    '/repo/.npmrc',
    '/repo/.pypirc',
    '/repo/.netrc',
    '/repo/credentials.json',
    '/repo/secrets.yml',
    '/repo/service-account.json',
    '/repo/id_ed25519',
    '/repo/cert.pem',
    '/repo/client.p12',
    'C:\\repo\\.ssh\\id_rsa',
  ]) {
    assert.equal(isSensitiveFilePath(filePath), true, filePath);
  }

  assert.equal(isSensitiveFilePath('/repo/src/config.ts'), false);
});

test('shouldIndexFile accepts supported source and project metadata files', () => {
  assert.equal(shouldIndexFile('/repo/src/app.ts', 100), true);
  assert.equal(shouldIndexFile('/repo/src/styles.scss', 100), true);
  assert.equal(shouldIndexFile('/repo/Makefile', 100), false);
  assert.equal(shouldIndexFile('/repo/package.json', 100), true);
  assert.equal(PROJECT_METADATA_FILES.has('readme.md'), true);
});

test('shouldIndexFile rejects generated folders, sensitive files, huge files, and unknown extensions', () => {
  assert.equal(shouldIndexFile('/repo/node_modules/pkg/index.js', 100), false);
  assert.equal(shouldIndexFile('/repo/dist/app.js', 100), false);
  assert.equal(shouldIndexFile('/repo/build/app.js', 100), false);
  assert.equal(shouldIndexFile('/repo/out/app.js', 100), false);
  assert.equal(shouldIndexFile('/repo/coverage/report.json', 100), false);
  assert.equal(shouldIndexFile('/repo/.next/app.js', 100), false);
  assert.equal(shouldIndexFile('/repo/.env', 100), false);
  assert.equal(shouldIndexFile('/repo/src/app.ts', 512_001), false);
  assert.equal(shouldIndexFile('/repo/image.png', 100), false);
});
