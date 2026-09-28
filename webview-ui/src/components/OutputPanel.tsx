import { PromptExecutionRecord } from '../types';

interface OutputPanelProps {
  execution?: PromptExecutionRecord | null;
  responseText: string;
  running: boolean;
  onCopy: () => void;
  onClear: () => void;
  onCancel: () => void;
}

function renderMarkdownBlocks(markdown: string): Array<{ type: 'text' | 'code'; content: string; language?: string }> {
  const blocks: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const regex = /```([\w-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: markdown.slice(lastIndex, match.index).trim() });
    }
    blocks.push({ type: 'code', language: match[1] || undefined, content: match[2].trimEnd() });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < markdown.length) {
    blocks.push({ type: 'text', content: markdown.slice(lastIndex).trim() });
  }
  return blocks.filter(block => block.content.length > 0);
}

export function OutputPanel({ execution, responseText, running, onCopy, onClear, onCancel }: OutputPanelProps) {
  const blocks = renderMarkdownBlocks(responseText);

  return (
    <section className="preview-panel">
      <div className="provider-panel-head">
        <div className="section-headline">Output</div>
        <div className="inline-actions">
          {running && <button type="button" className="button-secondary compact-button" onClick={onCancel}>Cancel</button>}
          <button type="button" className="button-secondary compact-button" onClick={onCopy} disabled={!responseText}>Copy</button>
          <button type="button" className="button-secondary compact-button" onClick={onClear} disabled={!responseText && !execution}>Clear</button>
        </div>
      </div>

      {!responseText && !execution && <p className="empty-state">Run a prompt to view streamed output and execution metadata.</p>}

      {execution && (
        <div className="preview-metrics output-metrics">
          <div><span>Status</span><strong>{execution.status}</strong></div>
          <div><span>Duration</span><strong>{execution.durationMs} ms</strong></div>
          <div><span>Provider</span><strong>{execution.providerName}</strong></div>
          <div><span>Model</span><strong>{execution.modelName ?? execution.modelId ?? 'Default'}</strong></div>
          <div><span>Input Tokens</span><strong>~{execution.usage.estimatedInputTokens ?? execution.usage.actualInputTokens ?? 0}</strong></div>
          <div><span>Output Tokens</span><strong>{execution.usage.outputTokens ?? 'n/a'}</strong></div>
        </div>
      )}

      {running && <div className="status-banner">Streaming response...</div>}

      <div className="output-content">
        {blocks.map((block, index) => (
          block.type === 'code' ? (
            <div key={`${block.type}-${index}`} className="output-code-block">
              <div className="output-code-head">
                <span>{block.language ?? 'code'}</span>
                <button type="button" className="ghost-button" onClick={() => navigator.clipboard.writeText(block.content)}>Copy code</button>
              </div>
              <pre>{block.content}</pre>
            </div>
          ) : (
            <div key={`${block.type}-${index}`} className="output-text-block">
              {block.content.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
                <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>
              ))}
            </div>
          )
        ))}
      </div>
    </section>
  );
}