# Copilot Toolkit 2.0 Sprint 1 Architecture

Sprint 1 adds a persistent AI Workflow Studio on top of the existing extension without removing the legacy QuickPick-driven experience.

## Architecture

```text
VS Code Extension Host
  -> extension.ts activation root
  -> app/serviceContainer.ts
  -> context/ContextEngine + ContextRegistry
  -> prompts/PromptRepository + PromptAssembler
  -> providers/CopilotChatProvider + ProviderRegistry
  -> studio/PromptStudioPanel
  -> React webview bundle in media/studio
```

## Directory Layout

```text
src/
  app/
    registerCommands.ts
    serviceContainer.ts
    workspace.ts
  context/
    ContextEngine.ts
    ContextRegistry.ts
    resolvers/
      CurrentFileResolver.ts
      CurrentSelectionResolver.ts
  domain/
    context.ts
    execution.ts
    messages.ts
    prompt.ts
    provider.ts
  prompts/
    PromptAssembler.ts
    PromptRepository.ts
  providers/
    CopilotChatProvider.ts
    ProviderRegistry.ts
  studio/
    PromptStudioPanel.ts
  services/
    TokenEstimator.ts

webview-ui/
  index.html
  vite.config.ts
  tsconfig.json
  src/
    App.tsx
    main.tsx
    vscode.ts
    types.ts
    components/
    styles/
```

## Build and Run

1. `npm install`
2. `npm run compile`
3. Press `F5` in VS Code to launch the Extension Development Host.

The compile step builds both the TypeScript extension host and the React webview bundle into `media/studio`.

## Commands

- `Copilot Toolkit`
- `Copilot Toolkit: Open AI Workflow Studio`
- Existing analytics, insights, fix, and reset commands remain available.

## Supported Sprint 1 Context Sources

- `Current File`
- `Selected Code`

## Intentionally Deferred

- Related file ranking
- Git-aware context resolution
- Architecture summary generation
- Related tests and APIs
- Multi-step workflow editing inside the Studio
- Direct provider API integrations beyond GitHub Copilot handoff