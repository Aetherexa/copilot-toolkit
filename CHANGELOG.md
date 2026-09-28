# Changelog

All notable changes to **Copilot Toolkit** are documented here.

The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-09-28

### Added
- Postman-style AI Workflow Studio built with React, TypeScript, and Vite.
- Persistent prompt CRUD, tabs, collections, favorites, import/export, and legacy Markdown prompt loading.
- Context Engine with deterministic ranking, deduplication, trimming, token budgets, and context preview.
- Context sources for editor state, Git state, related files/tests, workspace summaries, architecture summaries, dependency graphs, and current-feature inference.
- GitHub Copilot provider abstraction with supported VS Code Language Model execution and Copilot Chat fallback.
- Streaming prompt output, cancellation, bounded execution history, provider/model metadata, and token metrics.
- Language-agnostic workspace indexing and code graph with JavaScript/TypeScript analysis plus unsupported-language fallback.
- Dependency, reverse-dependency, impact, shortest-path, architecture, and bounded map queries.
- Multi-step workflow engine with per-step prompt/context/provider/model overrides, previous-output chaining, cancellation, failure policies, and history.
- Automated CI across current Node.js LTS/current toolchains, coverage gates, dependency audits, CodeQL, and VSIX package validation.
- Microsoft Entra ID workload-identity release pipeline for PAT-free Marketplace publishing.

### Changed
- Workspace intelligence now initializes lazily when graph-backed Studio functionality is used instead of scanning every workspace at ordinary VS Code startup.
- Workflow previous-step output is processed through the normal context budget.
- Marketplace package excludes tests, source maps, GitHub workflow files, source files, and development documentation.
- Documentation now distinguishes directly observed metrics from heuristic productivity estimates.
- Repository ownership metadata now points to the Aetherexa organization.

### Security
- Hardened webview CSP and local-resource handling.
- Added runtime/build dependency audit gates and CodeQL.
- Marketplace release authentication uses short-lived Microsoft Entra credentials from GitHub OIDC instead of long-lived PATs.

## [1.2.0] — 2026-05-27

### Added
- Fix Suggestion UI with apply/ignore/feedback actions.
- `copilot-toolkit.suggestFix` command and editor context-menu entry.

## [1.1.0] — 2026-05-27

### Added
- Productivity Insights Dashboard.
- Edit tracker, diff engine, metrics engine, scoring engine, event logger, and apply-fix command.

## [1.0.0] — 2024-01-01

### Added
- Smart skill system and auto skill detection.
- Adaptive learning and prompt recommendations.
- Prompt and skill libraries.
- Legacy multi-step workflow mode.
- Configurable prompt/skill paths and editor context-menu integration.
