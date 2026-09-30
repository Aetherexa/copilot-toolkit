import { ContextBinding, ContextType } from '../types';

interface ContextBuilderProps {
  context: ContextBinding[];
  unsupportedContextTypes: string[];
  contextBudgetTokens: number;
  suggestions: ContextType[];
  onToggle: (type: ContextType) => void;
  onUpdateOptions: (type: ContextType, options: Partial<NonNullable<ContextBinding['options']>>) => void;
  onBudgetChange: (tokens: number) => void;
  onApplySuggestion: (type: ContextType) => void;
  onPickFiles: () => void;
  onRemoveSelectedFile: (filePath: string) => void;
  onPreview: () => void;
  previewBusy: boolean;
}

const sections: Array<{ title: string; items: Array<{ type: ContextType; label: string }> }> = [
  {
    title: 'Files',
    items: [
      { type: 'currentFile', label: 'Current File' },
      { type: 'currentSelection', label: 'Selected Code' },
      { type: 'selectedFiles', label: 'Selected Files' },
      { type: 'relatedFiles', label: 'Related Files' },
      { type: 'openEditors', label: 'Open Editors' },
      { type: 'currentFolder', label: 'Current Folder' },
    ],
  },
  {
    title: 'Git',
    items: [
      { type: 'gitDiff', label: 'Git Diff' },
      { type: 'changedFiles', label: 'Changed Files' },
      { type: 'recentCommits', label: 'Recent Commits' },
      { type: 'gitBranch', label: 'Current Branch' },
    ],
  },
  {
    title: 'Architecture',
    items: [
      { type: 'architectureSummary', label: 'Architecture Summary' },
      { type: 'dependencyGraph', label: 'Dependency Graph' },
      { type: 'currentFeature', label: 'Current Feature' },
    ],
  },
  {
    title: 'Testing',
    items: [{ type: 'relatedTests', label: 'Related Tests' }],
  },
  {
    title: 'API',
    items: [{ type: 'relatedApis', label: 'Related APIs' }],
  },
  {
    title: 'Workspace',
    items: [{ type: 'workspaceSummary', label: 'Workspace Summary' }],
  },
];

function getBinding(context: ContextBinding[], type: ContextType): ContextBinding | undefined {
  return context.find(binding => binding.type === type);
}

function renderOptions(
  binding: ContextBinding | undefined,
  onUpdateOptions: (type: ContextType, options: Partial<NonNullable<ContextBinding['options']>>) => void,
  onPickFiles: () => void,
  onRemoveSelectedFile: (filePath: string) => void,
) {
  if (!binding || !binding.enabled) {
    return null;
  }

  switch (binding.type) {
    case 'selectedFiles': {
      const filePaths = binding.options?.filePaths ?? [];
      return (
        <div className="selected-files-config">
          <div className="selected-files-toolbar">
            <span>{filePaths.length === 0 ? 'No files selected' : `${filePaths.length} pinned file${filePaths.length === 1 ? '' : 's'}`}</span>
            <button type="button" className="button-secondary compact-button" onClick={onPickFiles}>
              {filePaths.length === 0 ? 'Add Files' : 'Change Files'}
            </button>
          </div>
          {filePaths.length > 0 && (
            <div className="selected-files-list">
              {filePaths.map(filePath => (
                <div key={filePath} className="selected-file-row">
                  <span title={filePath}>{filePath}</span>
                  <button type="button" className="ghost-button" onClick={() => onRemoveSelectedFile(filePath)} aria-label={`Remove ${filePath}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="field compact-field">
            <span>Token Limit / File</span>
            <input type="number" min={80} step={20} value={binding.options?.maxTokens ?? 500} onChange={event => onUpdateOptions(binding.type, { maxTokens: Number(event.target.value) || 80 })} />
          </label>
        </div>
      );
    }
    case 'relatedFiles':
    case 'relatedTests':
      return (
        <div className="context-config-grid">
          <label className="field compact-field">
            <span>Max Files</span>
            <input type="number" min={1} value={binding.options?.maxFiles ?? 5} onChange={event => onUpdateOptions(binding.type, { maxFiles: Number(event.target.value) || 1 })} />
          </label>
          {binding.type === 'relatedFiles' && (
            <label className="field compact-field">
              <span>Depth</span>
              <input type="number" min={1} value={binding.options?.depth ?? 2} onChange={event => onUpdateOptions(binding.type, { depth: Number(event.target.value) || 1 })} />
            </label>
          )}
          <label className="field compact-field">
            <span>Token Limit</span>
            <input type="number" min={80} step={20} value={binding.options?.maxTokens ?? 220} onChange={event => onUpdateOptions(binding.type, { maxTokens: Number(event.target.value) || 80 })} />
          </label>
        </div>
      );
    case 'currentFolder':
    case 'openEditors':
      return (
        <div className="context-config-grid">
          <label className="field compact-field">
            <span>Max Files</span>
            <input type="number" min={1} value={binding.options?.maxFiles ?? 4} onChange={event => onUpdateOptions(binding.type, { maxFiles: Number(event.target.value) || 1 })} />
          </label>
          {binding.type === 'currentFolder' && (
            <label className="field compact-field">
              <span>Depth</span>
              <input type="number" min={1} value={binding.options?.depth ?? 1} onChange={event => onUpdateOptions(binding.type, { depth: Number(event.target.value) || 1 })} />
            </label>
          )}
        </div>
      );
    case 'gitDiff':
      return (
        <div className="context-config-grid two-column-grid">
          <label className="checkbox-field">
            <input type="checkbox" checked={binding.options?.includeStaged !== false} onChange={event => onUpdateOptions(binding.type, { includeStaged: event.target.checked })} />
            <span>Include staged</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={binding.options?.includeUnstaged !== false} onChange={event => onUpdateOptions(binding.type, { includeUnstaged: event.target.checked })} />
            <span>Include unstaged</span>
          </label>
        </div>
      );
    case 'recentCommits':
      return (
        <div className="context-config-grid">
          <label className="field compact-field">
            <span>Commit Count</span>
            <input type="number" min={1} max={20} value={binding.options?.recentCommitCount ?? 5} onChange={event => onUpdateOptions(binding.type, { recentCommitCount: Number(event.target.value) || 1 })} />
          </label>
        </div>
      );
    default:
      return null;
  }
}

export function ContextBuilder({ context, unsupportedContextTypes, contextBudgetTokens, suggestions, onToggle, onUpdateOptions, onBudgetChange, onApplySuggestion, onPickFiles, onRemoveSelectedFile, onPreview, previewBusy }: ContextBuilderProps) {
  const enabled = new Map(context.map(binding => [binding.type, binding.enabled]));

  return (
    <aside className="context-builder">
      <div className="context-builder-header">
        <div>
          <h2>Context Builder</h2>
          <p>Construct the request payload outside the prompt body.</p>
        </div>
        <button type="button" className="button-secondary" onClick={onPreview} disabled={previewBusy}>
          {previewBusy ? 'Previewing...' : 'Preview Context'}
        </button>
      </div>

      <label className="field context-search">
        <span>Total Context Budget</span>
        <input type="number" min={200} step={100} value={contextBudgetTokens} onChange={event => onBudgetChange(Number(event.target.value) || 200)} />
      </label>

      {suggestions.length > 0 && (
        <section className="context-suggestions">
          <h3>Suggested for this prompt</h3>
          <div className="suggestion-list">
            {suggestions.map(type => (
              <button key={type} type="button" className="suggestion-chip" onClick={() => onApplySuggestion(type)}>
                {type}
              </button>
            ))}
          </div>
        </section>
      )}

      {sections.map(section => (
        <section key={section.title} className="context-section">
          <h3>{section.title}</h3>
          <div className="context-options">
            {section.items.map(item => {
              const disabled = unsupportedContextTypes.includes(item.type);
              const binding = getBinding(context, item.type);
              const suggested = suggestions.includes(item.type);
              return (
                <div key={`${section.title}-${item.label}`} className={`context-option${disabled ? ' is-disabled' : ''}`}>
                  <label className="context-option-main">
                    <input
                      type="checkbox"
                      checked={enabled.get(item.type) ?? false}
                      disabled={disabled}
                      onChange={() => {
                        if (item.type === 'selectedFiles' && !binding?.enabled && !(binding?.options?.filePaths?.length)) {
                          onPickFiles();
                          return;
                        }
                        onToggle(item.type);
                      }}
                    />
                    <span>{item.label}</span>
                    {suggested && !disabled && <em>Suggested</em>}
                    {disabled && <em>Coming soon</em>}
                  </label>
                  {renderOptions(binding, onUpdateOptions, onPickFiles, onRemoveSelectedFile)}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </aside>
  );
}