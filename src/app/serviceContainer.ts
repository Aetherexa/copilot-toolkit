import * as vscode from 'vscode';
import { ContextEngine } from '../context/ContextEngine';
import { ContextRanker } from '../context/ContextRanker';
import { ContextRegistry } from '../context/ContextRegistry';
import { RelatedFilesEngine } from '../context/RelatedFilesEngine';
import { ArchitectureSummaryResolver } from '../context/resolvers/ArchitectureSummaryResolver';
import { ChangedFilesResolver } from '../context/resolvers/ChangedFilesResolver';
import { CurrentFolderResolver } from '../context/resolvers/CurrentFolderResolver';
import { CurrentFeatureResolver } from '../context/resolvers/CurrentFeatureResolver';
import { CurrentFileResolver } from '../context/resolvers/CurrentFileResolver';
import { CurrentSelectionResolver } from '../context/resolvers/CurrentSelectionResolver';
import { DependencyGraphResolver } from '../context/resolvers/DependencyGraphResolver';
import { GitBranchResolver } from '../context/resolvers/GitBranchResolver';
import { GitDiffResolver } from '../context/resolvers/GitDiffResolver';
import { OpenEditorsResolver } from '../context/resolvers/OpenEditorsResolver';
import { RecentCommitsResolver } from '../context/resolvers/RecentCommitsResolver';
import { RelatedFilesResolver } from '../context/resolvers/RelatedFilesResolver';
import { RelatedTestsResolver } from '../context/resolvers/RelatedTestsResolver';
import { WorkspaceSummaryResolver } from '../context/resolvers/WorkspaceSummaryResolver';
import { PromptExecutionRequest, PromptExecutionResult } from '../domain/execution';
import { StudioBootstrapPayload } from '../domain/messages';
import { PromptDefinition, PromptPreview, PromptRepositorySnapshot } from '../domain/prompt';
import { Workflow } from '../domain/workflow';
import { PromptRepository } from '../prompts/PromptRepository';
import { PromptAssembler } from '../prompts/PromptAssembler';
import { CopilotChatProvider } from '../providers/CopilotChatProvider';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { RegisteredProvider } from '../providers/RegisteredProvider';
import { ExecutionEngine, ExecutionRunResult } from '../services/ExecutionEngine';
import { ExecutionHistoryStore } from '../services/ExecutionHistoryStore';
import { GitService } from '../services/GitService';
import { GraphQueryService } from '../services/GraphQueryService';
import { TokenEstimator } from '../services/TokenEstimator';
import { WorkspaceIndexService } from '../services/WorkspaceIndexService';
import { WorkspaceIntelligenceService } from '../services/WorkspaceIntelligenceService';
import { WorkflowEngine } from '../services/WorkflowEngine';
import { WorkflowHistoryStore } from '../services/WorkflowHistoryStore';
import { WorkflowRepository } from '../workflows/WorkflowRepository';

export interface ServiceContainer {
  readonly context: vscode.ExtensionContext;
  readonly tokenEstimator: TokenEstimator;
  readonly contextRegistry: ContextRegistry;
  readonly contextEngine: ContextEngine;
  readonly promptAssembler: PromptAssembler;
  readonly promptRepository: PromptRepository;
  readonly workflowRepository: WorkflowRepository;
  readonly providerRegistry: ProviderRegistry;
  readonly executionEngine: ExecutionEngine;
  readonly executionHistoryStore: ExecutionHistoryStore;
  readonly workflowEngine: WorkflowEngine;
  readonly workflowHistoryStore: WorkflowHistoryStore;
  readonly workspaceIndex: WorkspaceIndexService;
  readonly workspaceIntelligence: WorkspaceIntelligenceService;
  readonly graphQuery: GraphQueryService;
  readonly unsupportedContextTypes: string[];
  loadBootstrap(): Promise<StudioBootstrapPayload>;
  toBootstrap(snapshot: PromptRepositorySnapshot, activePromptId?: string): StudioBootstrapPayload;
  buildPreview(prompt: PromptDefinition): Promise<PromptPreview>;
  runPrompt(prompt: PromptDefinition, onProgress: Parameters<ExecutionEngine['runPrompt']>[1]): Promise<ExecutionRunResult>;
}

const FUTURE_CONTEXT_TYPES = [
  'relatedApis',
];

function registerProviders(providerRegistry: ProviderRegistry): RegisteredProvider {
  const copilotProvider = new CopilotChatProvider(providerRegistryContext!);
  providerRegistry.register(copilotProvider);
  return copilotProvider;
}

let providerRegistryContext: vscode.ExtensionContext | undefined;

export function createServiceContainer(context: vscode.ExtensionContext): ServiceContainer {
  providerRegistryContext = context;
  const tokenEstimator = new TokenEstimator();
  const workspaceIndex = new WorkspaceIndexService(context, tokenEstimator);
  const gitService = new GitService();
  const workspaceIntelligence = new WorkspaceIntelligenceService(context, workspaceIndex);
  const graphQuery = workspaceIntelligence.graphQuery;
  const relatedFilesEngine = new RelatedFilesEngine(workspaceIndex, gitService, graphQuery);
  const contextRanker = new ContextRanker();
  const contextRegistry = new ContextRegistry();
  contextRegistry.register(new CurrentFileResolver(tokenEstimator));
  contextRegistry.register(new CurrentSelectionResolver(tokenEstimator));
  contextRegistry.register(new OpenEditorsResolver(workspaceIndex));
  contextRegistry.register(new CurrentFolderResolver(workspaceIndex));
  contextRegistry.register(new RelatedFilesResolver(relatedFilesEngine, workspaceIndex));
  contextRegistry.register(new RelatedTestsResolver(relatedFilesEngine, workspaceIndex));
  contextRegistry.register(new GitDiffResolver(gitService, tokenEstimator));
  contextRegistry.register(new GitBranchResolver(gitService, tokenEstimator));
  contextRegistry.register(new RecentCommitsResolver(gitService, tokenEstimator));
  contextRegistry.register(new ChangedFilesResolver(gitService, tokenEstimator));
  contextRegistry.register(new WorkspaceSummaryResolver(graphQuery, tokenEstimator));
  contextRegistry.register(new ArchitectureSummaryResolver(graphQuery, tokenEstimator));
  contextRegistry.register(new DependencyGraphResolver(graphQuery, tokenEstimator));
  contextRegistry.register(new CurrentFeatureResolver(graphQuery, tokenEstimator));

  const contextEngine = new ContextEngine(contextRegistry, contextRanker, tokenEstimator);
  const promptAssembler = new PromptAssembler();
  const promptRepository = new PromptRepository(context.workspaceState);
  const workflowRepository = new WorkflowRepository(context.workspaceState);
  const providerRegistry = new ProviderRegistry();
  const defaultProvider = registerProviders(providerRegistry);
  const executionHistoryStore = new ExecutionHistoryStore(context.workspaceState);
  const workflowHistoryStore = new WorkflowHistoryStore(context.workspaceState);
  const executionEngine = new ExecutionEngine(
    context,
    contextEngine,
    promptAssembler,
    providerRegistry,
    tokenEstimator,
    executionHistoryStore,
    () => new vscode.CancellationTokenSource(),
    () => ({
      languageId: vscode.window.activeTextEditor?.document.languageId ?? 'plaintext',
      fileName: vscode.window.activeTextEditor?.document.fileName.split(/[\\/]/).pop() ?? 'unknown',
    }),
  );
  const workflowEngine = new WorkflowEngine(
    context,
    executionEngine,
    workflowHistoryStore,
    tokenEstimator,
  );

  function toBootstrap(snapshot: PromptRepositorySnapshot, workflows: Workflow[], activePromptId?: string): StudioBootstrapPayload {
    return {
      prompts: snapshot.prompts,
      collections: snapshot.collections,
      activePrompt: snapshot.prompts.find(prompt => prompt.id === activePromptId) ?? snapshot.prompts[0],
      providers: providerRegistry.list(),
      executionHistory: executionHistoryStore.load(),
      workflows,
      workflowHistory: workflowHistoryStore.load(),
      indexingStatus: workspaceIntelligence.getStatus(),
      unsupportedContextTypes: FUTURE_CONTEXT_TYPES,
    };
  }

  return {
    context,
    tokenEstimator,
    contextRegistry,
    contextEngine,
    promptAssembler,
    promptRepository,
    workflowRepository,
    providerRegistry,
    executionEngine,
    executionHistoryStore,
    workflowEngine,
    workflowHistoryStore,
    workspaceIndex,
    workspaceIntelligence,
    graphQuery,
    unsupportedContextTypes: FUTURE_CONTEXT_TYPES,
    async loadBootstrap(): Promise<StudioBootstrapPayload> {
      await providerRegistry.refresh();
      return toBootstrap((await promptRepository.loadSnapshot()), (await workflowRepository.loadSnapshot()).workflows);
    },
    toBootstrap,
    async buildPreview(prompt: PromptDefinition): Promise<PromptPreview> {
      const resolution = await contextEngine.resolve(prompt.context, prompt.contextBudgetTokens ?? 1800);
      const assembledPrompt = promptAssembler.assemble(prompt, resolution.items);
      return {
        prompt: assembledPrompt,
        promptTokens: tokenEstimator.estimate(prompt.body),
        contextTokens: resolution.includedTokens,
        totalTokens: tokenEstimator.estimate(assembledPrompt),
        contextBudgetTokens: resolution.budgetTokens,
        totalCandidateContextTokens: resolution.totalCandidateTokens,
        utilizationPercent: resolution.utilizationPercent,
        excludedContextCount: resolution.excludedCount,
        resolvedContext: resolution.items,
      };
    },
    async runPrompt(prompt: PromptDefinition, onProgress) {
      if (!providerRegistry.get(prompt.providerId ?? defaultProvider.definition.id)) {
        await providerRegistry.refresh();
      }
      return executionEngine.runPrompt(prompt, onProgress);
    },
  };
}