import { ContextBinding, ResolvedContext } from '../types';

interface ContextChipProps {
  binding: ContextBinding;
  resolved?: ResolvedContext;
  onRemove: (type: ContextBinding['type']) => void;
}

export function ContextChip({ binding, resolved, onRemove }: ContextChipProps) {
  const fileName = resolved?.metadata?.fileName;
  const lineCount = resolved?.metadata?.lineCount;

  return (
    <article className="context-chip">
      <div className="context-chip-header">
        <strong>{binding.label ?? binding.type}</strong>
        <button type="button" onClick={() => onRemove(binding.type)} aria-label={`Remove ${binding.label ?? binding.type}`}>
          ×
        </button>
      </div>
      <div className="context-chip-body">
        <div>{typeof fileName === 'string' ? fileName : resolved?.source?.path?.split(/[\\/]/).pop() ?? 'Awaiting preview'}</div>
        <div>{typeof lineCount === 'number' ? `${lineCount} lines` : resolved ? 'Resolved' : 'Not resolved yet'}</div>
        <div>{resolved ? `~${resolved.tokenEstimate} tokens` : 'Preview to estimate tokens'}</div>
      </div>
    </article>
  );
}