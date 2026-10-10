import { randomBytes } from 'crypto';
import { PromptDefinition, PromptPreview } from '../domain/prompt';
import { PreparedPromptExecution } from './ExecutionEngine';

export interface StoredPreparedRequest {
  prompt: PromptDefinition;
  prepared: PreparedPromptExecution;
}

type EditPreparedRequest = (
  prompt: PromptDefinition,
  prepared: PreparedPromptExecution,
  assembledPromptOverride: string,
) => PreparedPromptExecution;

export class PreparedRequestStore {
  private readonly entries = new Map<string, StoredPreparedRequest>();

  constructor(
    private readonly maxEntries = 12,
    private readonly idFactory: () => string = () => randomBytes(18).toString('base64url'),
  ) {}

  store(prompt: PromptDefinition, prepared: PreparedPromptExecution): PromptPreview {
    const requestId = this.idFactory();
    this.entries.set(requestId, { prompt, prepared });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.entries.delete(oldest);
    }

    return {
      ...prepared.preview,
      requestId,
    };
  }

  consume(
    requestId: string,
    assembledPromptOverride: string | undefined,
    editPreparedRequest: EditPreparedRequest,
  ): StoredPreparedRequest | undefined {
    const stored = this.entries.get(requestId);
    if (!stored) {
      return undefined;
    }

    this.entries.delete(requestId);
    if (assembledPromptOverride === undefined) {
      return stored;
    }

    return {
      prompt: stored.prompt,
      prepared: editPreparedRequest(
        stored.prompt,
        stored.prepared,
        assembledPromptOverride,
      ),
    };
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
