import { PromptExecutionRecord } from '../domain/execution';

const EXECUTION_HISTORY_KEY = 'copilotToolkit.executionHistory';
const MAX_HISTORY = 50;

export interface MementoLike {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

export class ExecutionHistoryStore {
  constructor(private readonly state: MementoLike) {}

  load(): PromptExecutionRecord[] {
    return this.state.get<PromptExecutionRecord[]>(EXECUTION_HISTORY_KEY, []);
  }

  async save(record: PromptExecutionRecord): Promise<PromptExecutionRecord[]> {
    const next = [record, ...this.load().filter(item => item.id !== record.id)].slice(0, MAX_HISTORY);
    await this.state.update(EXECUTION_HISTORY_KEY, next);
    return next;
  }

  async delete(executionId: string): Promise<PromptExecutionRecord[]> {
    const next = this.load().filter(item => item.id !== executionId);
    await this.state.update(EXECUTION_HISTORY_KEY, next);
    return next;
  }

  async clear(): Promise<void> {
    await this.state.update(EXECUTION_HISTORY_KEY, []);
  }
}