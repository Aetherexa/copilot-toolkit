import { PromptPreview as PromptPreviewModel } from '../types';

interface PromptPreviewProps {
  preview: PromptPreviewModel | null;
  runningMessage?: string;
  providerName?: string;
  modelName?: string;
  editedPrompt: string | null;
  editing: boolean;
  running: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onChangeEditedPrompt: (value: string) => void;
  onRebuild: () => void;
  onRunReviewed: () => void;
}

function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

export function PromptPreview({
  preview,
  runningMessage,
  providerName,
  modelName,
  editedPrompt,
  editing,
  running,
  onEdit,
  onCancelEdit,
  onChangeEditedPrompt,
  onRebuild,
  onRunReviewed,
}: PromptPreviewProps) {
  const finalPrompt = editedPrompt ?? preview?.prompt ?? '';
  const manuallyEdited = Boolean(preview && editedPrompt !== null && editedPrompt !== preview.prompt);
  const effectiveTotalTokens = manuallyEdited ? estimateTokens(finalPrompt) : (preview?.totalTokens ?? 0);

  return (
    <section className="preview-panel">
      <div className="preflight-heading">
        <div>
          <div className="section-headline">Pre-flight Request Review</div>
          <p className="field-help">Inspect the exact request before it is sent to the selected AI provider.</p>
        </div>
        {preview?.requestId && <span className="preflight-badge">Exact request prepared</span>}
      </div>

      {runningMessage && <div className="status-banner">{runningMessage}</div>}
      {!preview && (
        <div className="preflight-empty">
          <p className="empty-state">Build a preview to resolve context, apply skills, redact secrets, and inspect token usage before execution.</p>
          <button type="button" className="button-primary" onClick={onRebuild}>Build Request Preview</button>
        </div>
      )}

      {preview && (
        <>
          <div className="preview-metrics">
            <div><span>Prompt Tokens</span><strong>~{preview.promptTokens}</strong></div>
            <div><span>Included Context</span><strong>~{preview.contextTokens}</strong></div>
            <div><span>{manuallyEdited ? 'Edited Total' : 'Total'}</span><strong>~{effectiveTotalTokens}</strong></div>
            <div><span>Budget</span><strong>~{preview.contextBudgetTokens}</strong></div>
            <div><span>Utilization</span><strong>{preview.utilizationPercent}%</strong></div>
            <div><span>Excluded</span><strong>{preview.excludedContextCount}</strong></div>
            <div><span>Candidate Tokens</span><strong>~{preview.totalCandidateContextTokens}</strong></div>
            <div><span>Provider</span><strong>{providerName ?? 'Unknown'}</strong></div>
            <div><span>Model</span><strong>{modelName ?? 'Default'}</strong></div>
          </div>

          <div className="preview-context-list">
            {preview.resolvedContext.map(item => (
              <details key={`${item.type}-${item.source?.path ?? item.title}`} className="preview-item">
                <summary>
                  <span>{item.title}</span>
                  <span>{item.status === 'excluded' ? 'Excluded' : 'Included'} · {item.tokenEstimate} tokens</span>
                </summary>
                <div className="preview-item-meta">
                  <span>{item.source?.label ?? item.source?.path ?? 'Unavailable source'}</span>
                  <span>Relevance {item.relevanceScore ?? 0}</span>
                  <span>{item.reason ?? item.excludedReason ?? 'No reason provided'}</span>
                  <span>{item.status === 'excluded' ? item.excludedReason ?? 'Excluded' : item.truncated ? 'Trimmed' : 'Included'}{item.originalTokenEstimate && item.originalTokenEstimate !== item.tokenEstimate ? ` · from ${item.originalTokenEstimate}` : ''}</span>
                </div>
                <pre>{item.content}</pre>
              </details>
            ))}
          </div>

          <div className="preflight-request">
            <div className="preflight-request-head">
              <div>
                <strong>Final Request</strong>
                <span>{manuallyEdited ? 'Manual one-run override' : 'Generated from Prompt + Skills + Context'}</span>
              </div>
              <div className="preflight-request-actions">
                {!editing ? (
                  <button type="button" className="button-secondary" onClick={onEdit}>Edit Final Request</button>
                ) : (
                  <button type="button" className="button-secondary" onClick={onCancelEdit}>Reset to Generated</button>
                )}
              </div>
            </div>

            {editing ? (
              <>
                <textarea
                  className="preflight-editor"
                  value={finalPrompt}
                  onChange={event => onChangeEditedPrompt(event.target.value)}
                  spellCheck={false}
                  aria-label="Editable final AI request"
                />
                <div className="preflight-warning">
                  Manual override applies only to this execution. The edited request is redacted and validated again before it reaches the provider.
                </div>
              </>
            ) : (
              <pre className="preflight-code">{finalPrompt}</pre>
            )}
          </div>

          <div className="preflight-actions">
            <button type="button" className="button-secondary" onClick={onRebuild} disabled={running}>Rebuild Preview</button>
            <button type="button" className="button-primary" onClick={onRunReviewed} disabled={running || !preview.requestId}>
              {running ? 'Running...' : manuallyEdited ? 'Run Edited Request' : 'Run Reviewed Request'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
