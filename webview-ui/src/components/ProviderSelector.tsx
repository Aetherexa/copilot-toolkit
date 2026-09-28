import { AIProvider } from '../types';

interface ProviderSelectorProps {
  providers: AIProvider[];
  providerId?: string;
  modelId?: string;
  busy?: boolean;
  onSelect: (providerId: string, modelId: string) => void;
  onRefresh: () => void;
}

export function ProviderSelector({ providers, providerId, modelId, busy, onSelect, onRefresh }: ProviderSelectorProps) {
  const activeProvider = providers.find(provider => provider.id === providerId) ?? providers[0];
  const activeModels = activeProvider?.models ?? [];
  const selectedModel = activeModels.find(model => model.id === modelId) ?? activeModels[0];

  return (
    <section className="provider-panel">
      <div className="provider-panel-head">
        <div className="section-headline">Provider</div>
        <button type="button" className="button-secondary compact-button" onClick={onRefresh} disabled={busy}>
          {busy ? 'Refreshing...' : 'Refresh Models'}
        </button>
      </div>

      {providers.length === 0 && <p className="empty-state">No executable providers are currently available.</p>}

      {providers.length > 0 && (
        <div className="provider-form">
          <label className="field compact-field">
            <span>Provider</span>
            <select
              value={activeProvider?.id ?? ''}
              onChange={event => {
                const nextProvider = providers.find(provider => provider.id === event.target.value);
                if (nextProvider) {
                  onSelect(nextProvider.id, nextProvider.models[0]?.id ?? '');
                }
              }}
            >
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.displayName ?? provider.name}</option>
              ))}
            </select>
          </label>

          <label className="field compact-field">
            <span>Model</span>
            <select
              value={selectedModel?.id ?? ''}
              onChange={event => activeProvider && onSelect(activeProvider.id, event.target.value)}
              disabled={activeModels.length === 0}
            >
              {activeModels.map(model => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </label>

          <div className="provider-status-grid">
            <div><span>Status</span><strong>{activeProvider?.status ?? 'unavailable'}</strong></div>
            <div><span>Streaming</span><strong>{activeProvider?.supportsStreaming ? 'Yes' : 'No'}</strong></div>
            <div><span>Token Count</span><strong>{activeProvider?.supportsTokenCounting ? 'Yes' : 'No'}</strong></div>
            <div><span>Cancel</span><strong>{activeProvider?.supportsCancellation ? 'Yes' : 'No'}</strong></div>
          </div>

          {activeProvider?.statusMessage && <p className="empty-state provider-status-message">{activeProvider.statusMessage}</p>}
          {selectedModel && <p className="empty-state provider-status-message">{selectedModel.description ?? 'Model ready.'}</p>}
        </div>
      )}
    </section>
  );
}