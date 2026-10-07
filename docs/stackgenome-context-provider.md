# StackGenome context provider

Copilot Toolkit can optionally consume project ecosystem intelligence from the separate StackGenome VS Code extension.

## Contract

Toolkit looks up the extension ID:

```text
aetherexa.stackgenome
```

When the **StackGenome Ecosystem** context source is enabled, Toolkit lazily activates StackGenome and requires API version `1.0`.

Toolkit then requests one of:

- `compact` — best when the context token budget is tight;
- `standard` — recommended default;
- `detailed` — broader package and health evidence.

The returned versioned context flows through Toolkit's existing ContextEngine, including secret redaction, relevance ranking, duplicate handling and total token-budget enforcement.

## Optional dependency

StackGenome is intentionally not declared as a VS Code `extensionDependency`. Copilot Toolkit must continue to work normally when it is not installed.

If StackGenome is missing, cannot activate or exposes an incompatible API version, this resolver contributes no context and the remaining Context Builder sources continue normally.

## Product boundary

StackGenome answers **what technologies, packages and capabilities already exist**.

Copilot Toolkit and RepoLens remain responsible for prompt orchestration and source-code relevance. Toolkit does not re-parse package manifests as part of this integration.
