import { useEffect, useMemo, useRef, useState } from 'react';
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
      options: binding.options ? { ...binding.options } : undefined,
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
        options: binding.options ? { ...binding.options } : undefined,
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

function detectSuggestedContextTypes(prompt: PromptDefinition | null): ContextType[] {
  if (!prompt) {
    return [];
  }

  const haystack = `${prompt.name} ${prompt.category} ${prompt.body}`.toLowerCase();
  if (/review|audit|pr/.test(haystack)) {
    return ['gitDiff', 'relatedFiles', 'relatedTests'];
  }
  if (/debug|bug|fix|error/.test(haystack)) {
    return ['currentFile', 'currentSelection', 'relatedFiles', 'recentCommits'];
  }
  if (/explain|understand|document/.test(haystack)) {
    return ['currentFile', 'openEditors', 'workspaceSummary'];
  }
  if (/test|coverage/.test(haystack)) {
    return ['relatedTests', 'relatedFiles', 'gitDiff'];
  }
  if (/refactor|cleanup|modernize/.test(haystack)) {
    return ['currentFile', 'relatedFiles', 'openEditors'];
  }

  return ['currentFile', 'relatedFiles'];
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

export default function App() {
  const [prompts, setPrompts] = useState<PromptDefinition[]>([]);
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
  const [preview, setPreview] = useState<PromptPreviewModel | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null);
  const [graphView, setGraphView] = useState<GraphView | null>(null);
  const [executionHistory, setExecutionHistory] = useState<PromptExecutionRecord[]>([]);
  const [unsupportedContextTypes, setUnsupportedContextTypes] = useState<string[]>([]);
  const [activeNav, setActiveNav] = useState(defaultState?.activeNav ?? 'Prompt Studio');
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

  useEffect(() => {
    postMessage({ type: 'studio.ready' });
    return onMessage((incoming: StudioExtensionMessage) => {
      if (incoming.type === 'studio.bootstrap') {
        setPrompts(incoming.payload.prompts);
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

      if (incoming.type === 'context.previewResult') {
        setPreview(incoming.payload);
        setIsPreviewing(false);
        setMessage(`Included ${incoming.payload.resolvedContext.filter(item => item.status !== 'excluded').length} context item(s) within budget.`);
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
        setExecutionHistory(incoming.payload.history);
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
        setWorkflowHistory(incoming.payload.history);
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
        if (event.shiftKey) {
          void handleSaveAs();
        } else {
          void handleSave();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePrompt, activeTabId]);

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
    const existing = tabs.find(tab => tab.prompt.id === prompt.id || tab.savedPrompt?.id === prompt.id);
    if (existing) {
      setActiveTabId(existing.id);
      setPreview(null);
      setError('');
      return;
    }

    const tab = createTab(prompt);
    setTabs(current => [...current, tab]);
    setActiveTabId(tab.id);
    setPreview(null);
    setError('');
    setMessage('');
  }

  function updateActivePrompt(nextPrompt: PromptDefinition): void {
    if (!activeTabId) {
      return;
    }

    setTabs(current => current.map(tab => tab.id === activeTabId
      ? { ...tab, prompt: { ...nextPrompt, updatedAt: Date.now() } }
      : tab));
  }

  function updateCurrentTabPrompt(updater: (prompt: PromptDefinition) => PromptDefinition): void {
    if (!activeTabId) {
      return;
    }

    setTabs(current => current.map(tab => tab.id === activeTabId ? { ...tab, prompt: updater(tab.prompt) } : tab));
  }

  function focusTab(tabId: string): void {
    setActiveTabId(tabId);
    setPreview(null);
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
      setPreview(null);
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

  function handleFavoriteToggle(): void {
    if (!activePrompt || activePrompt.source !== 'workspace') {
      setError('Only workspace prompts can be favorited. Use Save As first for built-in or imported prompts.');
      return;
    }

    pendingActionRef.current = { kind: 'refreshOnly' };
    postMessage({
      type: 'prompt.favorite',
      payload: { promptId: activePrompt.id, favorite: !activePrompt.favorite },
    });
  }

  function handleExportPrompt(): void {
    if (!activePrompt) {
      return;
    }

    postMessage({ type: 'export.prompt', payload: { promptId: activePrompt.id } });
  }

  function handleImport(): void {
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
    setPreview(current => current ? { ...current, resolvedContext: current.resolvedContext.filter(item => item.type !== type) } : current);
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
    setPreview(current => current ? { ...current, resolvedContext: current.resolvedContext.filter(item => item.type !== type) } : current);
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

    setIsRunning(true);
    setCurrentOutput('');
    setCurrentExecutionId(null);
    setActiveWorkbenchTab('output');
    postMessage({ type: 'prompt.run', payload: { prompt: activePrompt, context: activePrompt.context } });
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
    setActiveNav(nav);
    if (nav === 'Workflows' && !workflowDraft && workflows[0]) {
      selectWorkflow(workflows[0], false);
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
    if (!workflowDraft || !window.confirm(`Delete workflow ${workflowDraft.name}? This cannot be undone.`)) return;
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
    setWorkflowView('history');
  }

  function deleteWorkflowExecution(executionId: string): void {
    postMessage({ type: 'workflow.history.delete', payload: { executionId } });
  }

  function clearWorkflowHistory(): void {
    if (!window.confirm('Clear workflow execution history?')) return;
    postMessage({ type: 'workflow.history.clear' });
    setSelectedWorkflowExecutionId(null);
  }

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
              <button type="button" className="button-secondary" onClick={saveWorkflow} disabled={!activeWorkflow || isSaving}>{isSaving ? 'Saving...' : 'Save Workflow'}</button>
              <button type="button" className="button-secondary" onClick={duplicateWorkflow} disabled={!activeWorkflow}>Duplicate</button>
              <button type="button" className="button-secondary" onClick={exportWorkflow} disabled={!activeWorkflow}>Export</button>
              <button type="button" className="button-secondary danger-text" onClick={deleteWorkflow} disabled={!activeWorkflow}>Delete</button>
              <button type="button" className="button-primary" onClick={runWorkflow} disabled={!activeWorkflow || Boolean(runningWorkflowExecutionId)}>{runningWorkflowExecutionId ? 'Running...' : 'Run Workflow'}</button>
            </>
          ) : (
            <>
              <button type="button" className="button-secondary" onClick={handleCreatePrompt}>New</button>
              <button type="button" className="button-secondary" onClick={() => void handleSave()} disabled={!activePrompt || isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
              <button type="button" className="button-secondary" onClick={() => void handleSaveAs()} disabled={!activePrompt || isSaving}>Save As</button>
              <button type="button" className="button-secondary" onClick={handleDuplicatePrompt} disabled={!activePrompt}>Duplicate</button>
              <button type="button" className="button-secondary" onClick={handleFavoriteToggle} disabled={!activePrompt || activePrompt.source !== 'workspace'}>{activePrompt?.favorite ? 'Unfavorite' : 'Favorite'}</button>
              <button type="button" className="button-secondary" onClick={handleExportPrompt} disabled={!activePrompt}>Export</button>
              <button type="button" className="button-secondary danger-text" onClick={handleDeletePrompt} disabled={!activePrompt}>Delete</button>
              <button type="button" className="button-primary" onClick={runPrompt} disabled={!activePrompt || isRunning}>{isRunning ? 'Running...' : 'Run Prompt'}</button>
            </>
          )}
        </div>
      </header>

      <div className="studio-grid">
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
          {activeNav === 'Workflows' ? (
            <>
              {activeWorkflow ? (
                <WorkflowBuilder
                  workflow={activeWorkflow}
                  prompts={prompts}
                  providers={providers}
                  dirty={workflowDirty}
                  onChange={setWorkflowDraft}
                  onDeleteStep={deleteWorkflowStep}
                  onAddStep={addWorkflowStep}
                  onMoveStep={moveWorkflowStep}
                />
              ) : (
                <section className="editor-panel empty-panel">
                  <h1>No workflow selected</h1>
                  <p>Create or select a workflow to continue.</p>
                </section>
              )}

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
            <>
          <PromptTabs tabs={tabItems} activeTabId={activeTabId} onSelectTab={focusTab} onCloseTab={closeTab} />

          {!activePrompt && (
            <section className="editor-panel empty-panel">
              <h1>No prompt tab open</h1>
              <p>Create a prompt or open one from the library to continue.</p>
            </section>
          )}

          {activePrompt && (
            <>
              <PromptEditor prompt={activePrompt} dirty={activeDirty} onChange={updateActivePrompt} />

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
                    <PromptPreview preview={preview} runningMessage={message} providerName={activeProvider?.displayName ?? activeProvider?.name} modelName={activeModel?.name} />
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
                  totalTokens={preview?.totalTokens ?? 0}
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

        {activeNav === 'Workflows' ? (
          <aside className="context-builder context-builder-empty">
            <div className="context-builder-header">
              <div>
                <h2>Workflow Context</h2>
                <p>Each step inherits its prompt context unless it defines step-specific context bindings.</p>
              </div>
            </div>
          </aside>
        ) : activePrompt ? (
          <ContextBuilder
            context={activePrompt.context}
            unsupportedContextTypes={unsupportedContextTypes}
            contextBudgetTokens={activePrompt.contextBudgetTokens ?? 1800}
            suggestions={suggestedContextTypes}
            onToggle={toggleContext}
            onUpdateOptions={updateContextOptions}
            onBudgetChange={updateContextBudget}
            onApplySuggestion={applySuggestion}
            onPreview={previewContext}
            previewBusy={isPreviewing}
          />
        ) : (
          <aside className="context-builder context-builder-empty">
            <div className="context-builder-header">
              <div>
                <h2>Context Builder</h2>
                <p>Open a prompt tab to configure request context.</p>
              </div>
            </div>
          </aside>
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