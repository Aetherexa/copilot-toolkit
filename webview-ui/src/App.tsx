import { useEffect, useMemo, useRef, useState } from 'react';
import { detectSuggestedContextTypes } from '@shared/context/ContextSuggestionEngine';
import { Sidebar } from './components/Sidebar';
import { PromptTabs } from './components/PromptTabs';
import { PromptEditor } from './components/PromptEditor';
import { ContextBuilder } from './components/ContextBuilder';
import { ContextChip } from './components/ContextChip';
import { HistoryPanel } from './components/HistoryPanel';
import { MapPanel } from './components/MapPanel';
import { OutputPanel } from './components/OutputPanel';
import { ProviderSelector } from './components/ProviderSelector';
import { TokenSummary } from './components/TokenSummary';
import { PromptPreview } from './components/PromptPreview';
import { WorkflowBuilder } from './components/WorkflowBuilder';
import { WorkflowHistoryPanel } from './components/WorkflowHistoryPanel';
import { WorkflowRunPanel } from './components/WorkflowRunPanel';
import { getPersistedState, onMessage, postMessage, setPersistedState } from './vscode';
import type {
  ContextBinding,
  ContextType,
  GraphView,
  IndexingStatus,
  PromptExecutionRecord,
  WorkflowExecutionRecord,
  Workflow,
  PromptCollection,
  PromptDefinition,
  PromptPreview as PromptPreviewModel,
  PromptTabState,
  StudioBootstrapPayload,
  StudioExtensionMessage,
  StudioPersistedState,
} from './types';

const defaultState = getPersistedState<StudioPersistedState>();

type PendingAction =
  | { kind: 'replaceActiveTab'; tabId: string }
  | { kind: 'openActivePrompt' }
  | { kind: 'refreshOnly' }
  | null;

function clonePrompt(prompt: PromptDefinition): PromptDefinition {
  return {
    ...prompt,
    tags: [...prompt.tags],
    context: prompt.context.map(binding => ({
      ...binding,
      options: binding.options ? { ...binding.options, filePaths: binding.options.filePaths ? [...binding.options.filePaths] : undefined } : undefined,
    })),
  };
}

function cloneWorkflow(workflow: Workflow): Workflow {
  return {
    ...workflow,
    steps: workflow.steps.map(step => ({
      ...step,
      contextBindings: step.contextBindings?.map(binding => ({
        ...binding,
        options: binding.options ? { ...binding.options, filePaths: binding.options.filePaths ? [...binding.options.filePaths] : undefined } : undefined,
      })),
    })),
  };
}

function isWorkflowDirty(draft: Workflow | null, saved: Workflow | null): boolean {
  return Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
}

function isTabDirty(tab: PromptTabState): boolean {
  return JSON.stringify(tab.prompt) !== JSON.stringify(tab.savedPrompt);
}

function createTab(prompt: PromptDefinition): PromptTabState {
  return {
    id: `tab-${prompt.id}-${Date.now()}`,
    prompt: clonePrompt(prompt),
    savedPrompt: clonePrompt(prompt),
  };
}

function mergeContextBindings(existing: ContextBinding[], incoming: ContextBinding[]): ContextBinding[] {
  const map = new Map(existing.map(binding => [binding.type, binding]));
  for (const binding of incoming) {
    map.set(binding.type, binding);
  }
  return [...map.values()];
}

function findSavedPrompt(tab: PromptTabState, prompts: PromptDefinition[]): PromptDefinition | undefined {
  return prompts.find(prompt => prompt.id === tab.savedPrompt?.id || prompt.id === tab.prompt.id);
}

function mergeBootstrapState(
  tabs: PromptTabState[],
  activeTabId: string | null,
  payload: StudioBootstrapPayload,
  pendingAction: PendingAction,
): { tabs: PromptTabState[]; activeTabId: string | null } {
  let nextTabs = tabs
    .map(tab => {
      const savedPrompt = findSavedPrompt(tab, payload.prompts);
      const dirty = isTabDirty(tab);

      if (pendingAction?.kind === 'replaceActiveTab' && pendingAction.tabId === tab.id) {
        return {
          ...tab,
          prompt: clonePrompt(payload.activePrompt),
          savedPrompt: clonePrompt(payload.activePrompt),
        };
      }

      if (!dirty) {
        if (!savedPrompt && tab.prompt.source === 'workspace') {
          return undefined;
        }

        if (savedPrompt) {
          return {
            ...tab,
            prompt: clonePrompt(savedPrompt),
            savedPrompt: clonePrompt(savedPrompt),
          };
        }
      }

      return {
        ...tab,
        savedPrompt: savedPrompt ? clonePrompt(savedPrompt) : tab.savedPrompt,
      };
    })
    .filter((tab): tab is PromptTabState => Boolean(tab));

  let nextActiveTabId = activeTabId;

  if (pendingAction?.kind === 'openActivePrompt') {
    const existing = nextTabs.find(tab => tab.prompt.id === payload.activePrompt.id || tab.savedPrompt?.id === payload.activePrompt.id);
    if (existing) {
      nextActiveTabId = existing.id;
    } else {
      const tab = createTab(payload.activePrompt);
      nextTabs = [...nextTabs, tab];
      nextActiveTabId = tab.id;
    }
  }

  if (pendingAction?.kind === 'replaceActiveTab') {
    nextActiveTabId = pendingAction.tabId;
  }

  if (nextTabs.length === 0) {
    const tab = createTab(payload.activePrompt);
    nextTabs = [tab];
    nextActiveTabId = tab.id;
  }

  if (!nextTabs.some(tab => tab.id === nextActiveTabId)) {
    nextActiveTabId = nextTabs[0]?.id ?? null;
  }

  return { tabs: nextTabs, activeTabId: nextActiveTabId };
}

interface AppProps {
  initialPreview?: PromptPreviewModel | null;
}

export default function App({ initialPreview = null }: AppProps = {}) {
  const [prompts, setPrompts] = useState<PromptDefinition[]>([]);
  const [skills, setSkills] = useState<StudioBootstrapPayload['skills']>([]);
  const [collections, setCollections] = useState<PromptCollection[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowExecutionRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(defaultState?.selectedWorkflowId ?? null);
  const [workflowDraft, setWorkflowDraft] = useState<Workflow | null>(null);
  const [workflowSaved, setWorkflowSaved] = useState<Workflow | null>(null);
  const [selectedWorkflowExecutionId, setSelectedWorkflowExecutionId] = useState<string | null>(defaultState?.selectedWorkflowExecutionId ?? null);
  const [runningWorkflowExecutionId, setRunningWorkflowExecutionId] = useState<string | null>(null);
  const [streamingStepOutputs, setStreamingStepOutputs] = useState<Record<string, string>>({});
  const [workflowView, setWorkflowView] = useState<'run' | 'history'>('run');
  const [tabs, setTabs] = useState<PromptTabState[]>(defaultState?.tabs ?? []);
  const [activeTabId, setActiveTabId] = useState<string | null>(defaultState?.activeTabId ?? null);
  const [providers, setProviders] = useState<StudioBootstrapPayload['providers']>([]);
  const [preview, setPreview] = useState<PromptPreviewModel | null>(initialPreview);
  const [previewDraft, setPreviewDraft] = useState<string | null>(initialPreview?.prompt ?? null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null);
  const [graphView, setGraphView] = useState<GraphView | null>(null);
  const [executionHistory, setExecutionHistory] = useState<PromptExecutionRecord[]>([]);
  const [unsupportedContextTypes, setUnsupportedContextTypes] = useState<string[]>([]);
  const [activeNav, setActiveNav] = useState(
    defaultState?.activeNav === 'Prompt Studio' || defaultState?.activeNav === 'Context Builder'
      ? 'All Prompts'
      : (defaultState?.activeNav ?? 'All Prompts'),
  );
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(defaultState?.selectedCollectionId ?? null);
  const [searchQuery, setSearchQuery] = useState(defaultState?.searchQuery ?? '');
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<'preview' | 'output' | 'history' | 'map'>(defaultState?.activeWorkbenchTab ?? 'preview');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(defaultState?.selectedExecutionId ?? null);
  const [mapReverse, setMapReverse] = useState(defaultState?.mapReverse ?? false);
  const [mapDepth, setMapDepth] = useState(defaultState?.mapDepth ?? 2);
  const [mapSearch, setMapSearch] = useState('');
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [currentOutput, setCurrentOutput] = useState('');
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);

  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const selectedWorkflowIdRef = useRef(selectedWorkflowId);
  const workflowDraftRef = useRef(workflowDraft);
  const workflowSavedRef = useRef(workflowSaved);
  const pendingWorkflowActionRef = useRef<'first' | 'refresh-current' | null>(null);
  const pendingActionRef = useRef<PendingAction>(null);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  useEffect(() => {
    selectedWorkflowIdRef.current = selectedWorkflowId;
    workflowDraftRef.current = workflowDraft;
    workflowSavedRef.current = workflowSaved;
  }, [selectedWorkflowId, workflowDraft, workflowSaved]);

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const activePrompt = activeTab?.prompt ?? null;
  const activeDirty = activeTab ? isTabDirty(activeTab) : false;

  function invalidatePreview(): void {
    setPreview(null);
    setPreviewDraft(null);
    setIsEditingPreview(false);
  }

  useEffect(() => {
    postMessage({ type: 'studio.ready' });
    return onMessage((incoming: StudioExtensionMessage) => {
      if (incoming.type === 'studio.bootstrap') {
        setPrompts(incoming.payload.prompts);
        setSkills(incoming.payload.skills);
        setCollections(incoming.payload.collections);
        setWorkflows(incoming.payload.workflows);
        setWorkflowHistory(incoming.payload.workflowHistory);
        setProviders(incoming.payload.providers);
        setExecutionHistory(incoming.payload.executionHistory);
        setIndexingStatus(incoming.payload.indexingStatus);
        setUnsupportedContextTypes(incoming.payload.unsupportedContextTypes);

        const merged = mergeBootstrapState(
          tabsRef.current,
          activeTabIdRef.current,
          incoming.payload,
          pendingActionRef.current,
        );

        setTabs(merged.tabs);
        setActiveTabId(merged.activeTabId);

        let nextWorkflowId = selectedWorkflowIdRef.current;
        if (pendingWorkflowActionRef.current === 'first') {
          nextWorkflowId = incoming.payload.workflows[0]?.id ?? null;
        }
        if (!nextWorkflowId || !incoming.payload.workflows.some(workflow => workflow.id === nextWorkflowId)) {
          nextWorkflowId = incoming.payload.workflows[0]?.id ?? null;
        }

        const persistedWorkflow = incoming.payload.workflows.find(workflow => workflow.id === nextWorkflowId);
        const currentDraft = workflowDraftRef.current;
        const currentSaved = workflowSavedRef.current;
        const keepDirtyDraft = Boolean(
          currentDraft
          && currentSaved
          && persistedWorkflow
          && currentDraft.id === persistedWorkflow.id
          && isWorkflowDirty(currentDraft, currentSaved)
          && pendingWorkflowActionRef.current === null,
        );

        setSelectedWorkflowId(nextWorkflowId);
        if (!keepDirtyDraft) {
          setWorkflowDraft(persistedWorkflow ? cloneWorkflow(persistedWorkflow) : null);
          setWorkflowSaved(persistedWorkflow ? cloneWorkflow(persistedWorkflow) : null);
        }
        pendingWorkflowActionRef.current = null;

        setIsSaving(false);
        pendingActionRef.current = null;
        setError('');
      }

      if (incoming.type === 'context.files.selected') {
        const tabId = activeTabIdRef.current;
        if (tabId) {
          const paths = [...incoming.payload.paths];
          setTabs(current => current.map(tab => {
            if (tab.id !== tabId) {
              return tab;
            }
            const existing = tab.prompt.context.find(binding => binding.type === 'selectedFiles');
            const nextBinding: ContextBinding = {
              ...(existing ?? { type: 'selectedFiles', enabled: true, label: 'Selected Files' }),
              enabled: paths.length > 0,
              label: 'Selected Files',
              options: {
                ...(existing?.options ?? {}),
                maxTokens: existing?.options?.maxTokens ?? 500,
                filePaths: paths,
              },
            };
            return {
              ...tab,
              prompt: {
                ...tab.prompt,
                context: mergeContextBindings(
                  tab.prompt.context.filter(binding => binding.type !== 'selectedFiles'),
                  [nextBinding],
                ),
                updatedAt: Date.now(),
              },
            };
          }));
          invalidatePreview();
          setMessage(paths.length > 0
            ? `Pinned ${paths.length} selected file${paths.length === 1 ? '' : 's'} as context.`
            : 'Cleared selected file context.');
          setError('');
        }
      }

      if (incoming.type === 'context.previewResult') {
        setPreview(incoming.payload);
        setPreviewDraft(incoming.payload.prompt);
        setIsEditingPreview(false);
        setIsPreviewing(false);
        setMessage(incoming.payload.requestId
          ? `Prepared exact request with ${incoming.payload.resolvedContext.filter(item => item.status !== 'excluded').length} context item(s).`
          : 'Execution completed using the reviewed request.');
      }

      if (incoming.type === 'prompt.running') {
        setIsRunning(true);
        setCurrentExecutionId(incoming.payload.executionId === 'pending' ? null : incoming.payload.executionId);
        setCurrentOutput('');
        setActiveWorkbenchTab('output');
        setMessage(`Running with ${incoming.payload.providerId} ${incoming.payload.modelId ?? ''}`.trim());
      }

      if (incoming.type === 'prompt.output') {
        setCurrentExecutionId(incoming.payload.executionId);
        setCurrentOutput(current => `${current}${incoming.payload.chunk}`);
        setActiveWorkbenchTab('output');
      }

      if (incoming.type === 'prompt.result') {
        setIsRunning(false);
        setCurrentExecutionId(incoming.payload.executionId);
        if (incoming.payload.record) {
          setExecutionHistory(current => [incoming.payload.record!, ...current.filter(item => item.id !== incoming.payload.record!.id)]);
          setSelectedExecutionId(incoming.payload.record.id);
          setCurrentOutput(current => incoming.payload.record?.responseText ?? current);
        }
        setMessage(incoming.payload.message ?? (incoming.payload.success ? 'Prompt sent to Copilot Chat.' : 'Prompt fallback copied to clipboard.'));
      }

      if (incoming.type === 'execution.history') {
        setExecutionHistory(current => incoming.payload.history.map(item => {
          const existing = current.find(candidate => candidate.id === item.id);
          if (!existing) return item;
          return {
            ...item,
            requestPreview: existing.requestPreview !== '[Content not retained]'
              ? existing.requestPreview
              : item.requestPreview,
            responsePreview: existing.responsePreview ?? item.responsePreview,
            responseText: existing.responseText ?? item.responseText,
          };
        }));
        setSelectedExecutionId(current =>
          current && incoming.payload.history.some(item => item.id === current)
            ? current
            : incoming.payload.history[0]?.id ?? null,
        );
      }

      if (incoming.type === 'workflow.progress') {
        setRunningWorkflowExecutionId(incoming.payload.executionId);
        setWorkflowView('run');
        if (incoming.payload.stepId && incoming.payload.chunk) {
          const stepId = incoming.payload.stepId;
          setStreamingStepOutputs(current => ({
            ...current,
            [stepId]: `${current[stepId] ?? ''}${incoming.payload.chunk}`,
          }));
        }
      }

      if (incoming.type === 'workflow.result') {
        setRunningWorkflowExecutionId(null);
        setWorkflowHistory(current => [
          incoming.payload.record,
          ...current.filter(item => item.id !== incoming.payload.record.id),
        ]);
        setSelectedWorkflowExecutionId(incoming.payload.record.id);
        setStreamingStepOutputs({});
        setWorkflowView('run');
        setMessage(incoming.payload.message ?? (incoming.payload.success ? 'Workflow completed.' : 'Workflow finished with errors.'));
      }

      if (incoming.type === 'workflow.history') {
        setWorkflowHistory(current => incoming.payload.history.map(item => {
          const existing = current.find(candidate => candidate.id === item.id);
          if (!existing) return item;
          const existingSteps = new Map(existing.steps.map(step => [step.stepId, step]));
          return {
            ...item,
            finalOutput: existing.finalOutput ?? item.finalOutput,
            steps: item.steps.map(step => {
              const existingStep = existingSteps.get(step.stepId);
              return existingStep
                ? {
                  ...step,
                  outputPreview: existingStep.outputPreview ?? step.outputPreview,
                  outputText: existingStep.outputText ?? step.outputText,
                }
                : step;
            }),
          };
        }));
        setSelectedWorkflowExecutionId(current =>
          current && incoming.payload.history.some(item => item.id === current)
            ? current
            : incoming.payload.history[0]?.id ?? null,
        );
      }

      if (incoming.type === 'provider.updated') {
        setProviders(incoming.payload.providers);
        setIsRefreshingProviders(false);
      }

      if (incoming.type === 'graph.viewResult') {
        setGraphView(incoming.payload.view);
        setIndexingStatus(incoming.payload.status);
        setActiveWorkbenchTab('map');
      }

      if (incoming.type === 'index.status') {
        setIndexingStatus(incoming.payload.status);
      }

      if (incoming.type === 'notice') {
        setIsRefreshingProviders(false);
        setMessage(incoming.payload.message);
        setError('');
      }

      if (incoming.type === 'error') {
        setError(incoming.payload.message);
        setIsPreviewing(false);
        setIsRunning(false);
        setRunningWorkflowExecutionId(null);
        setIsSaving(false);
        setIsRefreshingProviders(false);
        pendingActionRef.current = null;
        pendingWorkflowActionRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    setPersistedState({
      tabs,
      activeTabId,
      activeNav,
      selectedCollectionId,
      searchQuery,
      activeWorkbenchTab,
      selectedExecutionId,
      selectedWorkflowExecutionId,
      selectedWorkflowId,
      mapReverse,
      mapDepth,
    });
  }, [tabs, activeTabId, activeNav, selectedCollectionId, searchQuery, activeWorkbenchTab, selectedExecutionId, selectedWorkflowExecutionId, selectedWorkflowId, mapReverse, mapDepth]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activeNav === 'Workflows') {
          saveWorkflow();
        } else if (event.shiftKey) {
          void handleSaveAs();
        } else {
          void handleSave();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePrompt, activeTabId, activeNav, workflowDraft]);

  const resolvedByType = useMemo(() => {
    const map = new Map<string, PromptPreviewModel['resolvedContext'][number]>();
    for (const item of preview?.resolvedContext ?? []) {
      map.set(item.type, item);
    }
    return map;
  }, [preview]);

  const visiblePrompts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = prompts;

    if (activeNav === 'Favorites') {
      filtered = filtered.filter(prompt => prompt.favorite);
    } else if (activeNav === 'My Prompts') {
      filtered = filtered.filter(prompt => prompt.source === 'workspace');
    } else if (activeNav === 'Built-in Actions') {
      filtered = filtered.filter(prompt => prompt.source === 'builtin');
    }

    if (!query) {
      return filtered;
    }

    return filtered.filter(prompt =>
      prompt.name.toLowerCase().includes(query)
      || prompt.category.toLowerCase().includes(query)
      || prompt.tags.some(tag => tag.toLowerCase().includes(query))
      || (prompt.description ?? '').toLowerCase().includes(query),
    );
  }, [activeNav, prompts, searchQuery]);

  const enabledContext = (activePrompt?.context ?? []).filter(binding => binding.enabled);
  const suggestedContextTypes = useMemo(() => detectSuggestedContextTypes(activePrompt), [activePrompt]);
  const activeProvider = providers.find(provider => provider.id === activePrompt?.providerId) ?? providers[0];
  const activeModel = activeProvider?.models.find(model => model.id === activePrompt?.modelId) ?? activeProvider?.models[0];
  const selectedExecution = executionHistory.find(item => item.id === selectedExecutionId) ?? executionHistory[0] ?? null;
  const activeWorkflow = workflowDraft;
  const workflowDirty = isWorkflowDirty(workflowDraft, workflowSaved);
  const selectedWorkflowExecution = workflowHistory.find(item => item.id === selectedWorkflowExecutionId)
    ?? workflowHistory.find(item => item.workflowId === selectedWorkflowId)
    ?? null;

  function openPromptInTab(prompt: PromptDefinition): void {
    setActiveNav('Prompt Editor');
    const existing = tabs.find(tab => tab.prompt.id === prompt.id || tab.savedPrompt?.id === prompt.id);
    if (existing) {
      setActiveTabId(existing.id);
      invalidatePreview();
      setError('');
      return;
    }

    const tab = createTab(prompt);
    setTabs(current => [...current, tab]);
    setActiveTabId(tab.id);
    invalidatePreview();
    setError('');
    setMessage('');
  }

  function openPromptFromCatalog(prompt: PromptDefinition): void {
    openPromptInTab(prompt);
  }

  function updateActivePrompt(nextPrompt: PromptDefinition): void {
    if (!activeTabId) {
      return;
    }

    setTabs(current => current.map(tab => tab.id === activeTabId
      ? { ...tab, prompt: { ...nextPrompt, updatedAt: Date.now() } }
      : tab));
    invalidatePreview();
  }

  function updateCurrentTabPrompt(updater: (prompt: PromptDefinition) => PromptDefinition): void {
    if (!activeTabId) {
      return;
    }

    setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, prompt: updater(tab.prompt) } : tab));
    invalidatePreview();
  }

  function focusTab(tabId: string): void {
    setActiveNav('Prompt Editor');
    setActiveTabId(tabId);
    invalidatePreview();
    setError('');
  }

  function closeTab(tabId: string): void {
    const tab = tabs.find(item => item.id === tabId);
    if (!tab) {
      return;
    }

    if (isTabDirty(tab) && !window.confirm(`Close ${tab.prompt.name} with unsaved changes?`)) {
      return;
    }

    const remaining = tabs.filter(item => item.id !== tabId);
    setTabs(remaining);
    if (tabId === activeTabId) {
      setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
      invalidatePreview();
    }
  }

  async function handleSave(mode: 'save' | 'saveAs' = 'save'): Promise<void> {
    if (!activePrompt || !activeTabId) {
      return;
    }

    pendingActionRef.current = { kind: 'replaceActiveTab', tabId: activeTabId };
    setIsSaving(true);
    postMessage({ type: 'prompt.save', payload: { prompt: activePrompt, mode } });
  }

  async function handleSaveAs(): Promise<void> {
    if (!activePrompt) {
      return;
    }

    pendingActionRef.current = { kind: 'openActivePrompt' };
    setIsSaving(true);
    postMessage({
      type: 'prompt.save',
      payload: {
        prompt: { ...activePrompt, name: `${activePrompt.name} Copy` },
        mode: 'saveAs',
      },
    });
  }

  function handleCreatePrompt(): void {
    setActiveNav('Prompt Editor');
    pendingActionRef.current = { kind: 'openActivePrompt' };
    postMessage({ type: 'prompt.create', payload: { name: 'Untitled Prompt' } });
  }

  function handleDuplicatePrompt(): void {
    if (!activePrompt) {
      return;
    }

    pendingActionRef.current = { kind: 'openActivePrompt' };
    postMessage({
      type: 'prompt.save',
      payload: {
        prompt: { ...activePrompt, name: `${activePrompt.name} Copy` },
        mode: 'saveAs',
      },
    });
  }

  function handleDeletePrompt(): void {
    if (!activePrompt || !activeTab) {
      return;
    }

    if (isTabDirty(activeTab) && !window.confirm(`Delete ${activePrompt.name} and discard unsaved changes?`)) {
      return;
    }

    if (activePrompt.source !== 'workspace') {
      closeTab(activeTab.id);
      setMessage('Closed read-only prompt tab.');
      return;
    }

    if (!window.confirm(`Delete ${activePrompt.name}? This cannot be undone.`)) {
      return;
    }

    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({ type: 'prompt.delete', payload: { promptId: activePrompt.id } });
    closeTab(activeTab.id);
  }

  function handleFavoriteToggle(prompt: PromptDefinition | null = activePrompt): void {
    if (!prompt) {
      return;
    }

    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({
      type: 'prompt.favorite',
      payload: { promptId: prompt.id, favorite: !prompt.favorite },
    });
  }

  function handleExportPrompt(): void {
    if (!activePrompt) {
      return;
    }

    postMessage({ type: 'export.prompt', payload: { promptId: activePrompt.id } });
  }

  function handleImport(): void {
    setActiveNav('Prompt Editor');
    pendingActionRef.current = { kind: 'openActivePrompt' };
    postMessage({ type: 'import.open' });
  }

  function toggleContext(type: ContextType): void {
    if (!activePrompt) {
      return;
    }

    const existing = activePrompt.context.find(binding => binding.type === type);
    const nextBinding: ContextBinding = existing
      ? { ...existing, enabled: !existing.enabled }
      : { type, enabled: true, label: type };

    updateCurrentTabPrompt(prompt => ({
      ...prompt,
      context: mergeContextBindings(prompt.context.filter(binding => binding.type !== type), [nextBinding]),
      updatedAt: Date.now(),
    }));
    invalidatePreview();
  }

  function updateContextOptions(type: ContextType, options: Partial<NonNullable<ContextBinding['options']>>): void {
    if (!activePrompt) {
      return;
    }

    updateCurrentTabPrompt(prompt => ({
      ...prompt,
      context: mergeContextBindings(
        prompt.context.filter(binding => binding.type !== type),
        [{
          ...(prompt.context.find(binding => binding.type === type) ?? { type, enabled: true, label: type }),
          options: {
            ...(prompt.context.find(binding => binding.type === type)?.options ?? {}),
            ...options,
          },
        }],
      ),
      updatedAt: Date.now(),
    }));
  }

  function updateContextBudget(tokens: number): void {
    if (!activePrompt) {
      return;
    }

    updateCurrentTabPrompt(prompt => ({
      ...prompt,
      contextBudgetTokens: Math.max(200, tokens),
      updatedAt: Date.now(),
    }));
  }

  function applySuggestion(type: ContextType): void {
    const binding = activePrompt?.context.find(item => item.type === type);
    if (!binding?.enabled) {
      toggleContext(type);
    }
  }

  function removeContext(type: ContextType): void {
    if (!activePrompt) {
      return;
    }

    updateCurrentTabPrompt(prompt => ({
      ...prompt,
      context: prompt.context.map(binding => binding.type === type ? { ...binding, enabled: false } : binding),
      updatedAt: Date.now(),
    }));
    invalidatePreview();
  }

  function pickSelectedFiles(): void {
    if (!activePrompt) {
      return;
    }

    const selectedPaths = activePrompt.context
      .find(binding => binding.type === 'selectedFiles')
      ?.options?.filePaths ?? [];
    postMessage({
      type: 'context.files.pick',
      payload: { selectedPaths },
    });
  }

  function removeSelectedFile(filePath: string): void {
    if (!activePrompt) {
      return;
    }

    updateCurrentTabPrompt(prompt => {
      const existing = prompt.context.find(binding => binding.type === 'selectedFiles');
      if (!existing) {
        return prompt;
      }

      const remaining = (existing.options?.filePaths ?? []).filter(path => path !== filePath);
      const nextBinding: ContextBinding = {
        ...existing,
        enabled: remaining.length > 0,
        options: {
          ...(existing.options ?? {}),
          filePaths: remaining,
        },
      };

      return {
        ...prompt,
        context: mergeContextBindings(
          prompt.context.filter(binding => binding.type !== 'selectedFiles'),
          [nextBinding],
        ),
        updatedAt: Date.now(),
      };
    });
    invalidatePreview();
  }

  function previewContext(): void {
    if (!activePrompt) {
      return;
    }

    setIsPreviewing(true);
    setActiveWorkbenchTab('preview');
    postMessage({ type: 'context.preview', payload: { prompt: activePrompt, context: activePrompt.context } });
  }

  function runPrompt(): void {
    if (!activePrompt) {
      return;
    }

    if (!preview?.requestId) {
      setMessage('Build and review the exact request before running it.');
      previewContext();
      return;
    }

    const reviewedPrompt = previewDraft ?? preview.prompt;
    setIsRunning(true);
    setCurrentOutput('');
    setCurrentExecutionId(null);
    setActiveWorkbenchTab('output');
    postMessage({
      type: 'prompt.run',
      payload: {
        prompt: activePrompt,
        context: activePrompt.context,
        preparedRequestId: preview.requestId,
        assembledPromptOverride: reviewedPrompt !== preview.prompt ? reviewedPrompt : undefined,
      },
    });
  }

  function selectProvider(providerId: string, modelId: string): void {
    if (!activePrompt) {
      return;
    }

    updateCurrentTabPrompt(prompt => ({ ...prompt, providerId, modelId, updatedAt: Date.now() }));
  }

  function refreshProviders(): void {
    setIsRefreshingProviders(true);
    postMessage({ type: 'provider.refresh' });
  }

  function cancelExecution(): void {
    if (!currentExecutionId) {
      return;
    }

    postMessage({ type: 'execution.cancel', payload: { executionId: currentExecutionId } });
    setIsRunning(false);
  }

  function clearOutput(): void {
    setCurrentOutput('');
    setCurrentExecutionId(null);
  }

  async function copyResponse(): Promise<void> {
    const value = currentOutput || selectedExecution?.responseText;
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setMessage('Response copied.');
  }

  function selectExecution(executionId: string): void {
    const record = executionHistory.find(item => item.id === executionId);
    setSelectedExecutionId(executionId);
    setActiveWorkbenchTab('history');
    if (record?.responseText) {
      setCurrentOutput(record.responseText);
    }
  }

  function deleteExecution(executionId: string): void {
    postMessage({ type: 'execution.delete', payload: { executionId } });
  }

  function clearExecutionHistory(): void {
    if (!window.confirm('Clear execution history?')) {
      return;
    }
    postMessage({ type: 'execution.clear' });
    setSelectedExecutionId(null);
  }

  function refreshMap(): void {
    postMessage({
      type: 'graph.view',
      payload: {
        filePath: activePrompt?.context.find(binding => binding.type === 'currentFile') ? undefined : undefined,
        depth: mapDepth,
        reverse: mapReverse,
      },
    });
  }

  function openGraphNode(filePath: string): void {
    postMessage({
      type: 'workspace.openFile',
      payload: { filePath },
    });
  }

  function getCollectionPrompts(collectionId: string): PromptDefinition[] {
    const collection = collections.find(item => item.id === collectionId);
    if (!collection) {
      return [];
    }

    return collection.promptIds
      .map(promptId => prompts.find(prompt => prompt.id === promptId) ?? tabs.find(tab => tab.prompt.id === promptId)?.prompt)
      .filter((prompt): prompt is PromptDefinition => Boolean(prompt))
      .filter(prompt => {
        const query = searchQuery.trim().toLowerCase();
        return !query || prompt.name.toLowerCase().includes(query) || prompt.category.toLowerCase().includes(query);
      });
  }

  function createCollection(): void {
    const name = window.prompt('Collection name', 'New Collection');
    if (!name) {
      return;
    }

    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({ type: 'collection.create', payload: { name } });
  }

  function renameCollection(collection: PromptCollection): void {
    const name = window.prompt('Rename collection', collection.name);
    if (!name || name === collection.name) {
      return;
    }

    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({ type: 'collection.rename', payload: { collectionId: collection.id, name } });
  }

  function deleteCollection(collection: PromptCollection): void {
    if (!window.confirm(`Delete collection ${collection.name}?`)) {
      return;
    }

    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({ type: 'collection.delete', payload: { collectionId: collection.id } });
    if (selectedCollectionId === collection.id) {
      setSelectedCollectionId(null);
    }
  }

  function exportCollection(collection: PromptCollection): void {
    postMessage({ type: 'export.collection', payload: { collectionId: collection.id } });
  }

  function addPromptToCollection(collection: PromptCollection, prompt: PromptDefinition): void {
    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({ type: 'collection.addPrompt', payload: { collectionId: collection.id, promptId: prompt.id } });
  }

  function removePromptFromCollection(collection: PromptCollection, prompt: PromptDefinition): void {
    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({ type: 'collection.removePrompt', payload: { collectionId: collection.id, promptId: prompt.id } });
  }

  function handleSelectNav(nav: string): void {
    if (
      nav === 'Workflows'
      && workflowDraft
      && isWorkflowDirty(workflowDraft, workflowSaved)
      && !window.confirm(`Discard unsaved changes to ${workflowDraft.name} and return to the workflow catalog?`)
    ) {
      return;
    }

    setActiveNav(nav);
    setError('');
    setMessage('');
    if (nav === 'Workflows') {
      setSelectedWorkflowId(null);
      setWorkflowDraft(null);
      setWorkflowSaved(null);
      setStreamingStepOutputs({});
      setWorkflowView('run');
    }
  }

  function selectWorkflow(workflow: Workflow, confirmDiscard = true): void {
    if (
      confirmDiscard
      && workflowDraft
      && workflowDraft.id !== workflow.id
      && isWorkflowDirty(workflowDraft, workflowSaved)
      && !window.confirm(`Discard unsaved changes to ${workflowDraft.name}?`)
    ) return;

    setSelectedWorkflowId(workflow.id);
    setWorkflowDraft(cloneWorkflow(workflow));
    setWorkflowSaved(cloneWorkflow(workflow));
    setStreamingStepOutputs({});
    setActiveNav('Workflows');
    setWorkflowView('run');
    setError('');
  }

  function createWorkflow(): void {
    pendingWorkflowActionRef.current = 'first';
    setActiveNav('Workflows');
    postMessage({ type: 'workflow.create', payload: { name: 'Untitled Workflow' } });
  }

  function importWorkflow(): void {
    pendingWorkflowActionRef.current = 'first';
    setActiveNav('Workflows');
    postMessage({ type: 'workflow.import' });
  }

  function saveWorkflow(): void {
    if (!workflowDraft) return;
    pendingWorkflowActionRef.current = 'refresh-current';
    setIsSaving(true);
    postMessage({ type: 'workflow.save', payload: { workflow: workflowDraft } });
  }

  function duplicateWorkflow(): void {
    if (!workflowDraft) return;
    pendingWorkflowActionRef.current = 'first';
    postMessage({ type: 'workflow.duplicate', payload: { workflowId: workflowDraft.id } });
  }

  function deleteWorkflow(): void {
    if (!workflowDraft) return;
    if (workflowDraft.source === 'builtin') {
      setMessage('Built-in workflows are protected. Duplicate it to create a workspace workflow.');
      return;
    }
    if (!window.confirm(`Delete workflow ${workflowDraft.name}? This cannot be undone.`)) return;
    pendingWorkflowActionRef.current = 'first';
    postMessage({ type: 'workflow.delete', payload: { workflowId: workflowDraft.id } });
  }

  function exportWorkflow(): void {
    if (workflowDraft) postMessage({ type: 'workflow.export', payload: { workflowId: workflowDraft.id } });
  }

  function addWorkflowStep(): void {
    if (!workflowDraft) return;
    const stepId = `workflow-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setWorkflowDraft({
      ...workflowDraft,
      updatedAt: Date.now(),
      steps: [...workflowDraft.steps, { id: stepId, name: `Step ${workflowDraft.steps.length + 1}`, enabled: true }],
    });
  }

  function deleteWorkflowStep(stepId: string): void {
    if (!workflowDraft) return;
    setWorkflowDraft({ ...workflowDraft, updatedAt: Date.now(), steps: workflowDraft.steps.filter(step => step.id !== stepId) });
  }

  function moveWorkflowStep(stepId: string, direction: -1 | 1): void {
    if (!workflowDraft) return;
    const index = workflowDraft.steps.findIndex(step => step.id === stepId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= workflowDraft.steps.length) return;
    const steps = [...workflowDraft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setWorkflowDraft({ ...workflowDraft, steps, updatedAt: Date.now() });
  }

  function runWorkflow(): void {
    if (!workflowDraft || runningWorkflowExecutionId) return;
    setRunningWorkflowExecutionId('pending');
    setStreamingStepOutputs({});
    setWorkflowView('run');
    postMessage({ type: 'workflow.run', payload: { workflow: workflowDraft } });
  }

  function cancelWorkflow(): void {
    if (!runningWorkflowExecutionId || runningWorkflowExecutionId === 'pending') return;
    postMessage({ type: 'workflow.cancel', payload: { executionId: runningWorkflowExecutionId } });
  }

  function selectWorkflowExecution(executionId: string): void {
    setSelectedWorkflowExecutionId(executionId);
    setWorkflowView('run');
  }

  function deleteWorkflowExecution(executionId: string): void {
    postMessage({ type: 'workflow.history.delete', payload: { executionId } });
  }

  function clearWorkflowHistory(): void {
    if (!window.confirm('Clear workflow execution history?')) return;
    postMessage({ type: 'workflow.history.clear' });
    setSelectedWorkflowExecutionId(null);
  }

  const catalogGroups = useMemo(() => {
    const groups = new Map<string, PromptDefinition[]>();
    for (const prompt of visiblePrompts) {
      const category = prompt.category.trim() || 'Other';
      const items = groups.get(category) ?? [];
      items.push(prompt);
      groups.set(category, items);
    }
    return [...groups.entries()]
      .map(([category, items]) => [category, [...items].sort((left, right) => left.name.localeCompare(right.name))] as const)
      .sort(([left], [right]) => left.localeCompare(right));
  }, [visiblePrompts]);

  const visibleWorkflows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return workflows.filter(workflow =>
      !query
      || workflow.name.toLowerCase().includes(query)
      || (workflow.description ?? '').toLowerCase().includes(query),
    );
  }, [workflows, searchQuery]);

  const promptCatalogNav = ['All Prompts', 'My Prompts', 'Built-in Actions'].includes(activeNav);
  const promptEditorNav = ['Prompt Editor', 'Favorites', 'Collections'].includes(activeNav);
  const showRightContextBuilder = promptEditorNav && Boolean(activePrompt);
  const catalogTitle = activeNav === 'Built-in Actions' ? 'Built-in Actions' : activeNav;
  const catalogDescription = activeNav === 'Built-in Actions'
    ? 'Framework-neutral developer actions grouped by category. Select an action to open it in Prompt Studio.'
    : activeNav === 'My Prompts'
      ? 'Your saved workspace prompts grouped by category. Select a prompt to open it in Prompt Studio.'
      : 'Built-in, imported, and workspace prompts grouped by category. Select a prompt to open it in Prompt Studio.';
  const catalogCountLabel = activeNav === 'Built-in Actions' ? 'actions' : 'prompts';
  const successfulExecutions = executionHistory.filter(item => item.status === 'success').length;
  const totalEstimatedInputTokens = executionHistory.reduce((sum, item) => sum + (item.usage.estimatedInputTokens ?? item.usage.actualInputTokens ?? 0), 0);
  const totalOutputTokens = executionHistory.reduce((sum, item) => sum + (item.usage.outputTokens ?? 0), 0);
  const completedWorkflows = workflowHistory.filter(item => item.status === 'success').length;

  const tabItems = tabs.map(tab => ({ id: tab.id, title: tab.prompt.name || 'Untitled Prompt', dirty: isTabDirty(tab) }));

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div>
          <div className="brand-title">Copilot Toolkit</div>
          <div className="brand-subtitle">AI Workflow Studio</div>
        </div>
        <div className="topbar-actions topbar-actions-wrap">
          {activeNav === 'Workflows' ? (
            <>
              <button type="button" className="button-secondary" onClick={createWorkflow}>New Workflow</button>
              {activeWorkflow && (
                <>
                  <button type="button" className="button-secondary" onClick={saveWorkflow} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Workflow'}</button>
                  <button type="button" className="button-secondary" onClick={duplicateWorkflow}>Duplicate</button>
                  <button type="button" className="button-secondary" onClick={exportWorkflow}>Export</button>
                  <button type="button" className="button-secondary danger-text" onClick={deleteWorkflow} disabled={activeWorkflow.source === 'builtin'} title={activeWorkflow.source === 'builtin' ? 'Duplicate built-in workflows before deleting' : undefined}>Delete</button>
                  <button type="button" className="button-primary" onClick={runWorkflow} disabled={Boolean(runningWorkflowExecutionId)}>{runningWorkflowExecutionId ? 'Running...' : 'Run Workflow'}</button>
                </>
              )}
            </>
          ) : promptEditorNav ? (
            <>
              <button type="button" className="button-secondary" onClick={handleCreatePrompt}>New</button>
              <button type="button" className="button-secondary" onClick={() => void handleSave()} disabled={!activePrompt || isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
              <button type="button" className="button-secondary" onClick={() => void handleSaveAs()} disabled={!activePrompt || isSaving}>Save As</button>
              <button type="button" className="button-secondary" onClick={handleDuplicatePrompt} disabled={!activePrompt}>Duplicate</button>
              <button type="button" className="button-secondary" onClick={() => handleFavoriteToggle()} disabled={!activePrompt}>{activePrompt?.favorite ? 'Unfavorite' : 'Favorite'}</button>
              <button type="button" className="button-secondary" onClick={handleExportPrompt} disabled={!activePrompt}>Export</button>
              <button type="button" className="button-secondary danger-text" onClick={handleDeletePrompt} disabled={!activePrompt}>Delete</button>
              <button type="button" className="button-primary" onClick={runPrompt} disabled={!activePrompt || isRunning}>{isRunning ? 'Running...' : preview?.requestId ? 'Run Reviewed Request' : 'Review Request'}</button>
            </>
          ) : promptCatalogNav ? (
            <button type="button" className="button-secondary" onClick={handleCreatePrompt}>New Custom Prompt</button>
          ) : activeNav === 'Providers' ? (
            <button type="button" className="button-secondary" onClick={refreshProviders} disabled={isRefreshingProviders}>{isRefreshingProviders ? 'Refreshing...' : 'Refresh Providers'}</button>
          ) : null}
        </div>
      </header>

      <div className={`studio-grid${showRightContextBuilder ? '' : ' studio-grid-wide'}`}>
        <Sidebar
          prompts={prompts}
          visiblePrompts={visiblePrompts}
          collections={collections}
          workflows={workflows}
          activePromptId={activePrompt?.id}
          activeWorkflowId={selectedWorkflowId}
          activeNav={activeNav}
          searchQuery={searchQuery}
          selectedCollectionId={selectedCollectionId}
          activePromptForCollection={activePrompt}
          getCollectionPrompts={getCollectionPrompts}
          onSelectPrompt={openPromptInTab}
          onToggleFavorite={handleFavoriteToggle}
          onSelectNav={handleSelectNav}
          onSearchChange={setSearchQuery}
          onCreatePrompt={handleCreatePrompt}
          onImport={handleImport}
          onCreateWorkflow={createWorkflow}
          onImportWorkflow={importWorkflow}
          onSelectWorkflow={selectWorkflow}
          onCreateCollection={createCollection}
          onRenameCollection={renameCollection}
          onDeleteCollection={deleteCollection}
          onExportCollection={exportCollection}
          onSelectCollection={setSelectedCollectionId}
          onAddPromptToCollection={addPromptToCollection}
          onRemovePromptFromCollection={removePromptFromCollection}
        />

        <main className="studio-main">
          {promptCatalogNav ? (
            <section className="catalog-panel">
              <div className="catalog-header">
                <div>
                  <h1>{catalogTitle}</h1>
                  <p>{catalogDescription}</p>
                </div>
                <span className="catalog-count">{visiblePrompts.length} {catalogCountLabel}</span>
              </div>
              {catalogGroups.length === 0 ? (
                <div className="library-empty">No prompts match the current search.</div>
              ) : (
                <div className="catalog-sections">
                  {catalogGroups.map(([category, items]) => (
                    <details key={category} className="catalog-group" open>
                      <summary><span>{category}</span><span>{items.length}</span></summary>
                      <div className="catalog-grid">
                        {items.map(prompt => (
                          <div key={prompt.id} className="catalog-card prompt-catalog-card">
                            <button type="button" className="catalog-card-open" onClick={() => openPromptFromCatalog(prompt)}>
                              <span className="catalog-card-title">{prompt.name}</span>
                              <span className="catalog-card-description">{prompt.description || 'Open this prompt in Prompt Studio.'}</span>
                              <span className="catalog-card-meta">
                                {prompt.tags.slice(0, 3).map(tag => <em key={tag}>{tag}</em>)}
                              </span>
                            </button>
                            <button
                              type="button"
                              className={`prompt-favorite-button catalog-favorite-button${prompt.favorite ? ' is-favorite' : ''}`}
                              aria-label={prompt.favorite ? `Remove ${prompt.name} from favorites` : `Add ${prompt.name} to favorites`}
                              aria-pressed={Boolean(prompt.favorite)}
                              title={prompt.favorite ? 'Remove from favorites' : 'Add to favorites'}
                              onClick={() => handleFavoriteToggle(prompt)}
                            >
                              {prompt.favorite ? '★' : '☆'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          ) : activeNav === 'Workflows' ? (
            activeWorkflow ? (
              <>
                <button type="button" className="back-link" onClick={() => handleSelectNav('Workflows')}>← Back to workflow catalog</button>
                <WorkflowBuilder
                  workflow={activeWorkflow}
                  prompts={prompts}
                  skills={skills}
                  providers={providers}
                  dirty={workflowDirty}
                  onChange={setWorkflowDraft}
                  onDeleteStep={deleteWorkflowStep}
                  onAddStep={addWorkflowStep}
                  onMoveStep={moveWorkflowStep}
                />
                <section className="workbench-panel">
                  <div className="workbench-tabs" role="tablist" aria-label="Workflow execution tabs">
                    <button type="button" className={`workbench-tab${workflowView === 'run' ? ' is-active' : ''}`} onClick={() => setWorkflowView('run')}>Run Output</button>
                    <button type="button" className={`workbench-tab${workflowView === 'history' ? ' is-active' : ''}`} onClick={() => setWorkflowView('history')}>History</button>
                  </div>
                  {workflowView === 'run' ? (
                    <WorkflowRunPanel record={runningWorkflowExecutionId ? null : selectedWorkflowExecution} runningExecutionId={runningWorkflowExecutionId} streamingStepOutputs={streamingStepOutputs} onCancel={cancelWorkflow} />
                  ) : (
                    <WorkflowHistoryPanel history={workflowHistory} selectedExecutionId={selectedWorkflowExecutionId} onSelect={selectWorkflowExecution} onDelete={deleteWorkflowExecution} onClear={clearWorkflowHistory} />
                  )}
                </section>
              </>
            ) : (
              <section className="catalog-panel">
                <div className="catalog-header">
                  <div>
                    <h1>Workflows</h1>
                    <p>Choose a reusable workflow or create one for your own engineering process.</p>
                  </div>
                  <span className="catalog-count">{visibleWorkflows.length} workflows</span>
                </div>
                <div className="catalog-grid workflow-catalog-grid">
                  {visibleWorkflows.map(workflow => (
                    <button key={workflow.id} type="button" className="catalog-card workflow-catalog-card" onClick={() => selectWorkflow(workflow)}>
                      <span className="catalog-card-title">{workflow.name}</span>
                      <span className="catalog-card-description">{workflow.description || 'Open workflow builder.'}</span>
                      <span className="catalog-card-meta">
                        <em>{workflow.steps.length} steps</em>
                        <em>{workflow.source ?? 'workspace'}</em>
                      </span>
                    </button>
                  ))}
                  {visibleWorkflows.length === 0 && <div className="library-empty">No workflows match the current search.</div>}
                </div>
              </section>
            )
          ) : activeNav === 'Providers' ? (
            <section className="editor-panel">
              <div className="editor-header">
                <div>
                  <h1>Providers</h1>
                  <p>Available AI providers and models detected by Copilot Toolkit.</p>
                </div>
              </div>
              <div className="provider-grid provider-overview-grid">
                {providers.map(provider => (
                  <article key={provider.id} className="provider-card provider-overview-card">
                    <strong>{provider.displayName ?? provider.name}</strong>
                    <span>{provider.description ?? 'AI provider'}</span>
                    <span>Status: {provider.status ?? (provider.enabled ? 'available' : 'unavailable')}</span>
                    <span>{provider.models.length} model{provider.models.length === 1 ? '' : 's'}</span>
                    <div className="provider-model-list">
                      {provider.models.map(model => <em key={model.id}>{model.name}</em>)}
                    </div>
                  </article>
                ))}
                {providers.length === 0 && <div className="library-empty">No providers are currently available.</div>}
              </div>
            </section>
          ) : activeNav === 'Context Builder' ? (
            activePrompt ? (
              <ContextBuilder
                context={activePrompt.context}
                unsupportedContextTypes={unsupportedContextTypes}
                contextBudgetTokens={activePrompt.contextBudgetTokens ?? 1800}
                suggestions={suggestedContextTypes}
                onToggle={toggleContext}
                onUpdateOptions={updateContextOptions}
                onBudgetChange={updateContextBudget}
                onApplySuggestion={applySuggestion}
                onPickFiles={pickSelectedFiles}
                onRemoveSelectedFile={removeSelectedFile}
                onPreview={previewContext}
                previewBusy={isPreviewing}
              />
            ) : (
              <section className="editor-panel empty-panel empty-panel-top">
                <h1>Context Builder</h1>
                <p>Open a prompt first, then choose current files, selected files, Git context, tests, architecture, and token limits here.</p>
                <button type="button" className="button-primary empty-state-action" onClick={handleCreatePrompt}>Create Prompt</button>
              </section>
            )
          ) : activeNav === 'Analytics' ? (
            <section className="editor-panel">
              <div className="editor-header">
                <div>
                  <h1>Analytics</h1>
                  <p>Local execution activity for this workspace.</p>
                </div>
              </div>
              <div className="analytics-grid">
                <div className="metric-card"><span>Prompt Runs</span><strong>{executionHistory.length}</strong></div>
                <div className="metric-card"><span>Successful Prompts</span><strong>{successfulExecutions}</strong></div>
                <div className="metric-card"><span>Workflow Runs</span><strong>{workflowHistory.length}</strong></div>
                <div className="metric-card"><span>Successful Workflows</span><strong>{completedWorkflows}</strong></div>
                <div className="metric-card"><span>Estimated Input Tokens</span><strong>{totalEstimatedInputTokens.toLocaleString()}</strong></div>
                <div className="metric-card"><span>Output Tokens</span><strong>{totalOutputTokens.toLocaleString()}</strong></div>
                <div className="metric-card"><span>Indexed Files</span><strong>{indexingStatus?.filesIndexed ?? 0}</strong></div>
                <div className="metric-card"><span>Graph Relationships</span><strong>{indexingStatus?.relationships ?? 0}</strong></div>
              </div>
            </section>
          ) : activeNav === 'Settings' ? (
            <section className="editor-panel">
              <div className="editor-header">
                <div>
                  <h1>Settings</h1>
                  <p>Copilot Toolkit settings are managed through VS Code Settings.</p>
                </div>
              </div>
              <div className="settings-list">
                <div className="settings-card"><strong>Prompt Folder</strong><code>copilotToolkit.promptFolder</code><span>Location for workspace prompt markdown files.</span></div>
                <div className="settings-card"><strong>Skills Folder</strong><code>copilotToolkit.skillsFolder</code><span>Location for reusable AI skill instructions.</span></div>
                <div className="settings-card"><strong>Adaptive Learning</strong><code>copilotToolkit.enableLearning</code><span>Controls local recommendation learning.</span></div>
                <div className="settings-card"><strong>History Content</strong><code>copilotToolkit.history.storeContent</code><span>Controls whether full prompt/context and response text is retained locally.</span></div>
              </div>
              <p className="settings-hint">Open VS Code Settings and search for “Copilot Toolkit” to change these values.</p>
            </section>
          ) : (
            <>
              <PromptTabs tabs={tabItems} activeTabId={activeTabId} onSelectTab={focusTab} onCloseTab={closeTab} />

              {!activePrompt && (
                <section className="editor-panel empty-panel empty-panel-top">
                  <h1>No prompt tab open</h1>
                  <p>Create a prompt or open one from the library to continue.</p>
                  <button type="button" className="button-primary empty-state-action" onClick={handleCreatePrompt}>Create Prompt</button>
                </section>
              )}

              {activePrompt && (
                <>
                  <PromptEditor prompt={activePrompt} skills={skills} dirty={activeDirty} onChange={updateActivePrompt} />

                  <div className="chip-row">
                    {enabledContext.map(binding => (
                      <ContextChip
                        key={binding.type}
                        binding={binding}
                        resolved={resolvedByType.get(binding.type)}
                        onRemove={removeContext}
                      />
                    ))}
                  </div>

                  <ProviderSelector
                    providers={providers}
                    providerId={activePrompt.providerId}
                    modelId={activePrompt.modelId}
                    onSelect={selectProvider}
                    onRefresh={refreshProviders}
                    busy={isRefreshingProviders}
                  />

                  <div className="bottom-panels">
                    <section className="workbench-panel">
                      <div className="workbench-tabs" role="tablist" aria-label="Execution workbench tabs">
                        <button type="button" className={`workbench-tab${activeWorkbenchTab === 'preview' ? ' is-active' : ''}`} onClick={() => setActiveWorkbenchTab('preview')}>Preview</button>
                        <button type="button" className={`workbench-tab${activeWorkbenchTab === 'output' ? ' is-active' : ''}`} onClick={() => setActiveWorkbenchTab('output')}>Output</button>
                        <button type="button" className={`workbench-tab${activeWorkbenchTab === 'history' ? ' is-active' : ''}`} onClick={() => setActiveWorkbenchTab('history')}>History</button>
                        <button type="button" className={`workbench-tab${activeWorkbenchTab === 'map' ? ' is-active' : ''}`} onClick={() => { setActiveWorkbenchTab('map'); refreshMap(); }}>Map</button>
                      </div>

                      {activeWorkbenchTab === 'preview' && (
                        <PromptPreview
                          preview={preview}
                          runningMessage={message}
                          providerName={activeProvider?.displayName ?? activeProvider?.name}
                          modelName={activeModel?.name}
                          editedPrompt={previewDraft}
                          editing={isEditingPreview}
                          running={isRunning}
                          onEdit={() => {
                            setPreviewDraft(preview?.prompt ?? '');
                            setIsEditingPreview(true);
                          }}
                          onCancelEdit={() => {
                            setPreviewDraft(preview?.prompt ?? null);
                            setIsEditingPreview(false);
                          }}
                          onChangeEditedPrompt={setPreviewDraft}
                          onRebuild={previewContext}
                          onRunReviewed={runPrompt}
                        />
                      )}
                      {activeWorkbenchTab === 'output' && (
                        <OutputPanel
                          execution={executionHistory.find(item => item.id === currentExecutionId) ?? selectedExecution}
                          responseText={currentOutput || selectedExecution?.responseText || ''}
                          running={isRunning}
                          onCopy={() => void copyResponse()}
                          onClear={clearOutput}
                          onCancel={cancelExecution}
                        />
                      )}
                      {activeWorkbenchTab === 'history' && (
                        <HistoryPanel
                          history={executionHistory}
                          selectedExecutionId={selectedExecutionId}
                          onSelect={selectExecution}
                          onDelete={deleteExecution}
                          onClear={clearExecutionHistory}
                        />
                      )}
                      {activeWorkbenchTab === 'map' && (
                        <MapPanel
                          graph={graphView}
                          status={indexingStatus}
                          reverse={mapReverse}
                          depth={mapDepth}
                          search={mapSearch}
                          onDepthChange={depth => setMapDepth(Math.max(1, Math.min(4, depth)))}
                          onReverseChange={setMapReverse}
                          onSearchChange={setMapSearch}
                          onRefresh={refreshMap}
                          onOpenNode={openGraphNode}
                        />
                      )}
                    </section>
                    <TokenSummary
                      totalTokens={previewDraft !== null && preview && previewDraft !== preview.prompt
                        ? Math.max(1, Math.ceil(previewDraft.length / 4))
                        : (preview?.totalTokens ?? 0)}
                      contextItems={preview?.resolvedContext.length ?? enabledContext.length}
                      provider={activeProvider?.name ?? 'GitHub Copilot'}
                      model={activeModel?.name ?? 'Default'}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </main>

        {showRightContextBuilder && activePrompt && (
          <ContextBuilder
            context={activePrompt.context}
            unsupportedContextTypes={unsupportedContextTypes}
            contextBudgetTokens={activePrompt.contextBudgetTokens ?? 1800}
            suggestions={suggestedContextTypes}
            onToggle={toggleContext}
            onUpdateOptions={updateContextOptions}
            onBudgetChange={updateContextBudget}
            onApplySuggestion={applySuggestion}
            onPickFiles={pickSelectedFiles}
            onRemoveSelectedFile={removeSelectedFile}
            onPreview={previewContext}
            previewBusy={isPreviewing}
          />
        )}
      </div>

      {(message || error) && (
        <div className={`studio-status${error ? ' is-error' : ''}`} role="status">
          {error || message}
        </div>
      )}
    </div>
  );
}