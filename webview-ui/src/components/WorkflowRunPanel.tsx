import { WorkflowExecutionRecord } from '../workflowTypes';

interface WorkflowRunPanelProps {
  record: WorkflowExecutionRecord | null;
  runningExecutionId: string | null;
  streamingStepOutputs: Record<string, string>;
  onCancel: () => void;
}

export function WorkflowRunPanel({ record, runningExecutionId, streamingStepOutputs, onCancel }: WorkflowRunPanelProps) {
  return (
    <section className="preview-panel">
      <div className="provider-panel-head">
        <div className="section-headline">Workflow Output</div>
        {runningExecutionId && <button type="button" className="button-secondary compact-button" onClick={onCancel}>Cancel Workflow</button>}
      </div>

      {!record && !runningExecutionId && <p className="empty-state">Run a workflow to inspect step-by-step execution and final output.</p>}

      {record && (
        <div className="preview-metrics output-metrics">
          <div><span>Status</span><strong>{record.status}</strong></div>
          <div><span>Duration</span><strong>{record.durationMs} ms</strong></div>
          <div><span>Steps</span><strong>{record.steps.length}</strong></div>
          <div><span>Workflow</span><strong>{record.workflowName}</strong></div>
        </div>
      )}

      <div className="history-list">
        {record?.steps.map(step => (
          <div key={step.stepId} className="history-item">
            <div className="history-item-main">
              <strong>{step.stepName}</strong>
              <span>{step.status} · {step.durationMs} ms</span>
              <span>{step.providerName ?? step.providerId ?? 'Default provider'} · {step.modelName ?? step.modelId ?? 'Default model'}</span>
              <span>{step.error ?? step.outputPreview ?? streamingStepOutputs[step.stepId] ?? 'No output captured.'}</span>
            </div>
          </div>
        ))}
      </div>

      {record?.finalOutput && (
        <details className="preview-item" open>
          <summary>
            <span>Final Result</span>
            <span>{record.workflowName}</span>
          </summary>
          <pre>{record.finalOutput}</pre>
        </details>
      )}
    </section>
  );
}