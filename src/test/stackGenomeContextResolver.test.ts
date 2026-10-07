import test from 'node:test';
import assert from 'node:assert/strict';
import { StackGenomeContextResolver } from '../context/resolvers/StackGenomeContextResolver';
import { TokenEstimator } from '../services/TokenEstimator';

test('StackGenomeContextResolver resolves versioned project intelligence', async () => {
  const calls: string[] = [];
  const resolver = new StackGenomeContextResolver(
    new TokenEstimator(),
    async () => ({
      apiVersion: '1.0',
      async getAIContext(profile) {
        calls.push(profile ?? 'standard');
        return {
          schemaVersion: '1.0',
          profile,
          project: { name: 'demo', ecosystems: ['node', 'npm'] },
          instructions: {
            reuse: ['Reuse zod for validation.'],
            prefer: [],
            avoid: ['Do not add redundant validation dependencies.'],
          },
        };
      },
    }),
  );

  const result = await resolver.resolve({
    type: 'stackGenome',
    enabled: true,
    options: { stackGenomeProfile: 'compact' },
  });

  assert.deepEqual(calls, ['compact']);
  assert.equal(result?.type, 'stackGenome');
  assert.equal(result?.title, 'StackGenome Project Intelligence');
  assert.match(result?.content ?? '', /Reuse zod for validation/);
  assert.equal(result?.metadata?.stackGenomeProfile, 'compact');
  assert.equal(result?.metadata?.stackGenomeApiVersion, '1.0');
  assert.equal((result?.tokenEstimate ?? 0) > 0, true);
});

test('StackGenomeContextResolver defaults to standard profile', async () => {
  let selectedProfile: string | undefined;
  const resolver = new StackGenomeContextResolver(
    new TokenEstimator(),
    async () => ({
      apiVersion: '1.0',
      async getAIContext(profile) {
        selectedProfile = profile;
        return { schemaVersion: '1.0', profile };
      },
    }),
  );

  const result = await resolver.resolve({
    type: 'stackGenome',
    enabled: true,
  });

  assert.equal(selectedProfile, 'standard');
  assert.equal(result?.metadata?.stackGenomeProfile, 'standard');
});

test('StackGenomeContextResolver gracefully skips a missing provider', async () => {
  const resolver = new StackGenomeContextResolver(
    new TokenEstimator(),
    async () => undefined,
  );

  const result = await resolver.resolve({
    type: 'stackGenome',
    enabled: true,
  });

  assert.equal(result, undefined);
});

test('StackGenomeContextResolver gracefully skips incompatible API versions', async () => {
  let contextRequested = false;
  const resolver = new StackGenomeContextResolver(
    new TokenEstimator(),
    async () => ({
      apiVersion: '2.0',
      async getAIContext() {
        contextRequested = true;
        return {};
      },
    }),
  );

  const result = await resolver.resolve({
    type: 'stackGenome',
    enabled: true,
  });

  assert.equal(result, undefined);
  assert.equal(contextRequested, false);
});

test('StackGenomeContextResolver treats provider errors as optional-context fallback', async () => {
  const resolver = new StackGenomeContextResolver(
    new TokenEstimator(),
    async () => {
      throw new Error('activation failed');
    },
  );

  const result = await resolver.resolve({
    type: 'stackGenome',
    enabled: true,
  });

  assert.equal(result, undefined);
});
