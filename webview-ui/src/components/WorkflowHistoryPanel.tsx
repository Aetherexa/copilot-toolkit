import { WorkflowExecutionRecord } from '../workflowTypes';

interface WorkflowHistoryPanelProps {
  history: WorkflowExecutionRecord[];
  selectedExecutionId: string | null;
  onSelect: (executionId: string) => void;
  onDelete: (executionId: string) => void;
  onClear: () => void;
}

export function WorkflowHistoryPanel({ history, selectedExecutionId, onSelect, onDelete, onClear }: WorkflowHistoryPanelProps) {
  return (
    <section className="preview-panel">
      <div className="provider-panel-head">
        <div className="section-headline">Workflow History</div>
        <button type="button" className="button-secondary compact-button" onClick={onClear} disabled={history.length === 0}>Clear History</button>
      </div>

      {history.length === 0 && <p className="empty-state">Workflow runs will appear here after execution.</p>}

      <div className="history-list">
        {history.map(record => (
          <div key={record.id} className={`history-item${selectedExecutionId === record.id ? ' is-active' : ''}`}>
            <button type="button" className="history-item-main" onClick={() => onSelect(record.id)}>
              <strong>{record.workflowName}</strong>
              <span>{new Date(record.timestamp).toLocaleString()}</span>
              <span>{record.status} · {record.durationMs} ms · {record.steps.length} step{record.steps.length === 1 ? '' : 's'}</span>
              <span>{record.error ?? record.finalOutput?.slice(0, 180) ?? 'No output preview available.'}</span>
            </button>
            <button type="button" className="ghost-button danger-text" onClick={() => onDelete(record.id)}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}