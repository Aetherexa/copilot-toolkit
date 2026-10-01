import { ChangeEvent } from 'react';
import { AIProvider, ContextBinding, ContextType, PromptDefinition, Workflow, WorkflowStep } from '../types';

interface WorkflowBuilderProps {
  workflow: Workflow;
  prompts: PromptDefinition[];
  providers: AIProvider[];
  dirty: boolean;
  onChange: (workflow: Workflow) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStep: () => void;
  onMoveStep: (stepId: string, direction: -1 | 1) => void;
}

function updateStep(step: WorkflowStep, field: keyof WorkflowStep, value: unknown): WorkflowStep {
  return { ...step, [field]: value } as WorkflowStep;
}

const WORKFLOW_CONTEXT_OPTIONS: Array<{ type: ContextType; label: string }> = [
  { type: 'currentFile', label: 'Current File' },
  { type: 'currentSelection', label: 'Selected Code' },
  { type: 'selectedFiles', label: 'Selected Files' },
  { type: 'relatedFiles', label: 'Related Files' },
  { type: 'openEditors', label: 'Open Editors' },
  { type: 'currentFolder', label: 'Current Folder' },
  { type: 'gitDiff', label: 'Git Diff' },
  { type: 'changedFiles', label: 'Changed Files' },
  { type: 'gitBranch', label: 'Current Branch' },
  { type: 'recentCommits', label: 'Recent Commits' },
  { type: 'relatedTests', label: 'Related Tests' },
  { type: 'relatedApis', label: 'Related APIs' },
  { type: 'workspaceSummary', label: 'Workspace Summary' },
  { type: 'architectureSummary', label: 'Architecture Summary' },
  { type: 'dependencyGraph', label: 'Dependency Graph' },
  { type: 'currentFeature', label: 'Current Feature' },
];

function cloneBindings(bindings: ContextBinding[]): ContextBinding[] {
  return bindings.map(binding => ({
    ...binding,
    options: binding.options ? { ...binding.options } : undefined,
  }));
}

function toggleBinding(bindings: ContextBinding[], type: ContextType, label: string): ContextBinding[] {
  const existing = bindings.find(binding => binding.type === type);
  if (existing) {
    return bindings.map(binding => binding.type === type
      ? { ...binding, enabled: !binding.enabled }
      : binding);
  }

  return [...bindings, { type, label, enabled: true }];
}

export function WorkflowBuilder({ workflow, prompts, providers, dirty, onChange, onDeleteStep, onAddStep, onMoveStep }: WorkflowBuilderProps) {
  const promptOptions = prompts.map(prompt => ({ label: prompt.name, value: prompt.id }));

  function updateWorkflow(field: keyof Workflow, value: string) {
    onChange({ ...workflow, [field]: value, updatedAt: Date.now() });
  }

  function updateWorkflowStep(stepId: string, updater: (step: WorkflowStep) => WorkflowStep) {
    onChange({
      ...workflow,
      steps: workflow.steps.map(step => step.id === stepId ? updater(step) : step),
      updatedAt: Date.now(),
    });
  }

  return (
    <section className="editor-panel">
      <div className="editor-header">
        <div>
          <h1>{workflow.name}</h1>
          <p>{dirty ? 'Unsaved workflow changes' : 'Saved workflow definition'}</p>
        </div>
      </div>

      <div className="editor-form-grid">
        <label className="field">
          <span>Name</span>
          <input value={workflow.name} onChange={event => updateWorkflow('name', event.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <input value={workflow.description ?? ''} onChange={event => updateWorkflow('description', event.target.value)} />
        </label>
      </div>

      <div className="workflow-step-list">
        {workflow.steps.map((step, index) => {
          const provider = providers.find(item => item.id === step.providerId) ?? providers[0];
          const savedPrompt = prompts.find(prompt => prompt.id === step.promptId);
          const contextMode = step.contextBindings === undefined ? 'inherit' : 'custom';
          return (
            <article key={step.id} className="workflow-step-card">
              <div className="workflow-step-head">
                <div className="workflow-step-title">
                  <span className="workflow-step-number">{index + 1}</span>
                  <div>
                    <strong>{step.name || `Step ${index + 1}`}</strong>
                    <p>{step.enabled ? 'Enabled' : 'Disabled'} · {step.promptId ? 'Saved prompt' : 'Inline prompt'}</p>
                  </div>
                </div>
                <div className="workflow-step-actions" aria-label={`Actions for ${step.name}`}>
                  <button type="button" className="icon-button" onClick={() => onMoveStep(step.id, -1)} disabled={index === 0} title="Move step up" aria-label="Move step up">↑</button>
                  <button type="button" className="icon-button" onClick={() => onMoveStep(step.id, 1)} disabled={index === workflow.steps.length - 1} title="Move step down" aria-label="Move step down">↓</button>
                  <button type="button" className="icon-button danger-text" onClick={() => onDeleteStep(step.id)} title="Remove step" aria-label="Remove step">🗑</button>
                </div>
              </div>

              <label className="field workflow-inline-prompt">
                <span>Inline Prompt</span>
                <textarea
                  value={step.inlinePrompt ?? ''}
                  onChange={event => updateWorkflowStep(step.id, current => ({ ...current, inlinePrompt: event.target.value }))}
                  placeholder={step.promptId ? 'Optional: override or extend the saved prompt for this step.' : 'Describe exactly what this workflow step should do.'}
                  spellCheck={false}
                />
              </label>

              <div className="workflow-controls-grid">
                <label className="field compact-field">
                  <span>Step Name</span>
                  <input value={step.name} onChange={(event: ChangeEvent<HTMLInputElement>) => updateWorkflowStep(step.id, current => updateStep(current, 'name', event.target.value))} />
                </label>
                <label className="field compact-field">
                  <span>Saved Prompt</span>
                  <select
                    value={step.promptId ?? ''}
                    onChange={event => updateWorkflowStep(step.id, current => ({ ...current, promptId: event.target.value || undefined }))}
                  >
                    <option value="">Inline prompt only</option>
                    {promptOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Provider</span>
                  <select
                    value={step.providerId ?? provider?.id ?? ''}
                    onChange={event => updateWorkflowStep(step.id, current => ({ ...current, providerId: event.target.value || undefined }))}
                  >
                    <option value="">Prompt default</option>
                    {providers.map(item => <option key={item.id} value={item.id}>{item.displayName ?? item.name}</option>)}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Model</span>
                  <select
                    value={step.modelId ?? ''}
                    onChange={event => updateWorkflowStep(step.id, current => ({ ...current, modelId: event.target.value || undefined }))}
                  >
                    <option value="">Prompt default</option>
                    {(provider?.models ?? []).map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Context</span>
                  <select
                    value={contextMode}
                    onChange={event => updateWorkflowStep(step.id, current => ({
                      ...current,
                      contextBindings: event.target.value === 'inherit'
                        ? undefined
                        : cloneBindings(savedPrompt?.context ?? [{ type: 'currentFile', label: 'Current File', enabled: true }]),
                    }))}
                  >
                    <option value="inherit">Prompt default</option>
                    <option value="custom">Custom for this step</option>
                  </select>
                </label>
              </div>

              {contextMode === 'custom' && (
                <div className="workflow-context-section">
                  <div className="workflow-subheading">Step Context</div>
                  <div className="workflow-step-flags workflow-context-flags" aria-label={`Context for ${step.name}`}>
                    {WORKFLOW_CONTEXT_OPTIONS.map(option => (
                      <label key={option.type} className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={Boolean(step.contextBindings?.find(binding => binding.type === option.type)?.enabled)}
                          onChange={() => updateWorkflowStep(step.id, current => ({
                            ...current,
                            contextBindings: toggleBinding(current.contextBindings ?? [], option.type, option.label),
                          }))}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="workflow-step-flags workflow-behavior-flags">
                <label className="checkbox-field">
                  <input type="checkbox" checked={step.enabled} onChange={event => updateWorkflowStep(step.id, current => ({ ...current, enabled: event.target.checked }))} />
                  <span>Enabled</span>
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={Boolean(step.inputFromPreviousStep)} onChange={event => updateWorkflowStep(step.id, current => ({ ...current, inputFromPreviousStep: event.target.checked }))} />
                  <span>Use previous output</span>
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={Boolean(step.continueOnFailure)} onChange={event => updateWorkflowStep(step.id, current => ({ ...current, continueOnFailure: event.target.checked }))} />
                  <span>Continue on failure</span>
                </label>
              </div>
            </article>
          );
        })}
      </div>

      <button type="button" className="button-secondary" onClick={onAddStep}>Add Step</button>
    </section>
  );
}