import { WorkflowExecutionRecord } from '../domain/execution';
import { MementoLike } from './ExecutionHistoryStore';

const WORKFLOW_HISTORY_KEY = 'copilotToolkit.workflowExecutionHistory';
const MAX_WORKFLOW_HISTORY = 30;

export class WorkflowHistoryStore {
  constructor(private readonly state: MementoLike) {}

  load(): WorkflowExecutionRecord[] {
    return this.state.get<WorkflowExecutionRecord[]>(WORKFLOW_HISTORY_KEY, []);
  }

  async save(record: WorkflowExecutionRecord): Promise<WorkflowExecutionRecord[]> {
    const next = [record, ...this.load().filter(item => item.id !== record.id)].slice(0, MAX_WORKFLOW_HISTORY);
    await this.state.update(WORKFLOW_HISTORY_KEY, next);
    return next;
  }

  async delete(executionId: string): Promise<WorkflowExecutionRecord[]> {
    const next = this.load().filter(item => item.id !== executionId);
    await this.state.update(WORKFLOW_HISTORY_KEY, next);
    return next;
  }

  async clear(): Promise<void> {
    await this.state.update(WORKFLOW_HISTORY_KEY, []);
  }
}