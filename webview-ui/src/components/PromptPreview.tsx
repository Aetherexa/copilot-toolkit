import { PromptPreview as PromptPreviewModel } from '../types';

interface PromptPreviewProps {
  preview: PromptPreviewModel | null;
  runningMessage?: string;
  providerName?: string;
  modelName?: string;
}

export function PromptPreview({ preview, runningMessage, providerName, modelName }: PromptPreviewProps) {
  return (
    <section className="preview-panel">
      <div className="section-headline">Preview & Estimate</div>
      {runningMessage && <div className="status-banner">{runningMessage}</div>}
      {!preview && <p className="empty-state">Preview context to inspect resolved sources and token totals.</p>}
      {preview && (
        <>
          <div className="preview-metrics">
            <div><span>Prompt Tokens</span><strong>~{preview.promptTokens}</strong></div>
            <div><span>Included Context</span><strong>~{preview.contextTokens}</strong></div>
            <div><span>Total</span><strong>~{preview.totalTokens}</strong></div>
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
          <details className="preview-item">
            <summary>
              <span>Prompt Assembly</span>
              <span>View full request</span>
            </summary>
            <pre>{preview.prompt}</pre>
          </details>
        </>
      )}
    </section>
  );
}