interface TokenSummaryProps {
  totalTokens: number;
  contextItems: number;
  provider: string;
  model: string;
}

export function TokenSummary({ totalTokens, contextItems, provider, model }: TokenSummaryProps) {
  return (
    <section className="token-summary">
      <div className="summary-row"><span>Estimated Tokens</span><strong>~{totalTokens}</strong></div>
      <div className="summary-row"><span>Context Items</span><strong>{contextItems}</strong></div>
      <div className="summary-row"><span>Provider</span><strong>{provider}</strong></div>
      <div className="summary-row"><span>Model</span><strong>{model}</strong></div>
    </section>
  );
}