import { PromptExecutionRecord } from '../types';

interface HistoryPanelProps {
  history: PromptExecutionRecord[];
  selectedExecutionId: string | null;
  onSelect: (executionId: string) => void;
  onDelete: (executionId: string) => void;
  onClear: () => void;
}

export function HistoryPanel({ history, selectedExecutionId, onSelect, onDelete, onClear }: HistoryPanelProps) {
  return (
    <section className="preview-panel">
      <div className="provider-panel-head">
        <div className="section-headline">History</div>
        <button type="button" className="button-secondary compact-button" onClick={onClear} disabled={history.length === 0}>Clear History</button>
      </div>

      {history.length === 0 && <p className="empty-state">Execution history will appear here after runs complete.</p>}

      <div className="history-list">
        {history.map(record => (
          <div key={record.id} className={`history-item${selectedExecutionId === record.id ? ' is-active' : ''}`}>
            <button type="button" className="history-item-main" onClick={() => onSelect(record.id)}>
              <strong>{record.promptName}</strong>
              <span>{new Date(record.timestamp).toLocaleString()}</span>
              <span>{record.providerName} · {record.modelName ?? record.modelId ?? 'Default'}</span>
              <span>{record.status} · {record.durationMs} ms · {record.contextItemCount} context</span>
              <span>{record.responsePreview ?? record.error ?? 'No response preview available.'}</span>
            </button>
            <button type="button" className="ghost-button danger-text" onClick={() => onDelete(record.id)}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}