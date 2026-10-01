# Copilot Toolkit — AI Workflow Studio for VS Code

[![CI](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/codeql.yml/badge.svg)](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/codeql.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Aetherexa_copilot-toolkit&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Aetherexa_copilot-toolkit)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Aetherexa_copilot-toolkit&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Aetherexa_copilot-toolkit)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=Aetherexa_copilot-toolkit&metric=bugs)](https://sonarcloud.io/summary/new_code?id=Aetherexa_copilot-toolkit)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=Aetherexa_copilot-toolkit&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=Aetherexa_copilot-toolkit)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=Aetherexa_copilot-toolkit&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=Aetherexa_copilot-toolkit)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=Aetherexa_copilot-toolkit&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=Aetherexa_copilot-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Copilot Toolkit is a VS Code extension for building, testing, and reusing context-aware AI prompts and multi-step developer workflows without leaving the editor.

Version 2 introduces a Postman-style **AI Workflow Studio** that combines prompt authoring, context selection, workspace intelligence, GitHub Copilot execution, workflow chaining, history, and local analytics.

## Highlights

- **Prompt Studio** — create, edit, duplicate, favorite, organize, import, and export reusable prompts.
- **Context Builder** — attach the current file, selection, Git diff, related files, tests, architecture summary, dependency graph, workspace summary, and more.
- **Token budgeting** — rank, deduplicate, trim, and exclude lower-value context before execution.
- **Workspace intelligence** — build a bounded, language-agnostic code graph and query dependencies, reverse dependencies, impact, and architecture relationships.
- **GitHub Copilot execution** — use supported VS Code Language Model APIs when available, with a Copilot Chat handoff fallback.
- **Multi-step workflows** — chain saved or inline prompts, pass previous-step output forward, configure context/provider/model per step, cancel runs, and inspect history.
- **Execution history** — retain bounded prompt and workflow execution metadata locally.
- **Legacy compatibility** — existing `.copilot/prompts/*.md`, skills, analytics, fix suggestions, and commands remain supported.

## How the v2 pipeline works

```text
Developer intent
      ↓
Prompt Studio
      ↓
Context Engine
      ↓
Workspace Intelligence + Git signals
      ↓
Relevance ranking / deduplication / token budget
      ↓
Prompt Assembler
      ↓
Provider Registry
      ↓
GitHub Copilot
      ↓
Output + History + Local Analytics
```

The workspace graph is deterministic and is used as an evidence source for context selection. The LLM is not treated as the source of truth for repository structure.

## AI Workflow Studio

Open the Studio from the Command Palette:

```text
Copilot Toolkit: Open AI Workflow Studio
```

The Studio provides:

- reusable prompt tabs
- collections and favorites
- prompt metadata and editor
- Context Builder and preview
- provider/model selection
- request preview and token estimates
- output streaming
- execution history
- workflow creation and execution
- bounded workspace dependency maps

## Built-in developer actions

The Studio ships with a framework-neutral action catalog for common engineering work. Examples include:

- Explain Code, Code Review, Debug Root Cause, Fix Plan
- Refactor Plan, Simplify Code, Change Impact Analysis
- Generate Tests, Test Gap Analysis, Edge Case Finder
- Security Review, Lightweight Threat Model
- Performance Review, Async & Concurrency Review
- Error Handling, Observability, and Data Validation reviews
- Architecture Review, API Contract Review, Backward Compatibility Review
- Dependency Upgrade Plan, Documentation Writer, PR Description, Release Risk Review

Built-in actions are read-only templates in the prompt library; use **Save As** to customize them. The legacy React review action remains available for backward compatibility, while the default catalog is intentionally language- and framework-agnostic.

## Built-in workflows

Reusable workflows combine those actions into common end-to-end developer jobs:

- PR Readiness
- Debug to Fix
- Safe Refactor
- Test Hardening
- Security Hardening
- Performance Investigation
- API Change Safety
- Dependency Upgrade
- Codebase Onboarding
- Production Readiness

Built-in workflows are protected from deletion. Duplicate one to create a fully independent workspace workflow.

## Context intelligence

Available context sources include:

| Area | Context |
| --- | --- |
| Editor | Current File, Selected Code, Open Editors, Current Folder |
| Git | Git Diff, Changed Files, Current Branch, Recent Commits |
| Repository | Related Files, Related Tests, Workspace Summary |
| Architecture | Architecture Summary, Dependency Graph, Current Feature |

Context is ranked deterministically and fitted to the configured token budget. Related-file results include relevance signals and reasons where available.

## Workspace intelligence

The indexer builds generic entities and relations rather than a React-specific graph.

Representative relations include:

```text
imports
references
calls
contains
extends
implements
dependsOn
```

JavaScript and TypeScript receive the richest analysis today. Unsupported languages fall back gracefully to file-level indexing.

Workspace intelligence is initialized lazily when the Studio or graph-backed context needs it, rather than scanning every repository during normal VS Code startup.

## Workflows

A workflow can combine saved prompts and inline instructions:

```text
PR Preparation

Review Changes
      ↓
Architecture Review
      ↓
Generate Tests
      ↓
Final Review
      ↓
PR Description
```

Each step can independently configure:

- saved prompt or inline prompt
- provider/model override
- context override
- previous-step output
- enabled/disabled state
- stop-on-failure or continue-on-failure

Previous-step output participates in the same context-ranking and token-budget pipeline as other context.

## Privacy and data handling

Copilot Toolkit does **not** operate a separate telemetry or analytics backend.

Prompt definitions, workflow definitions, histories, preferences, and Toolkit analytics are stored using VS Code extension state or workspace files, depending on the feature. Workspace indexing is performed locally.

When you run an AI request, the assembled prompt and selected context are sent to the configured AI provider. The production provider currently uses GitHub Copilot through VS Code-supported APIs or Copilot Chat. Your use of GitHub Copilot is subject to GitHub/Microsoft product terms and settings.

No monetary token-cost estimate is shown unless a provider supplies enough trustworthy pricing information.

## Metrics

The extension records directly observable metrics such as:

- execution count/status/duration
- provider and model
- estimated input tokens
- output tokens when reported by the provider
- context candidates/included/excluded
- context budget utilization
- workflow/step status and duration
- indexed files/entities/relationships

Some legacy productivity indicators, such as time saved or cognitive-load reduction, are **heuristic estimates**. They should not be interpreted as independently measured productivity outcomes.

## Legacy commands

The v1 workflows remain available, including:

- `Copilot Toolkit`
- `Copilot Toolkit: Suggest Fix for Selection`
- `Copilot Toolkit: Apply Suggested Fix`
- `Copilot Toolkit: Show Productivity Insights`
- `Copilot Toolkit: Show Productivity Analytics`
- `Copilot Toolkit: Reset Learned Preferences`
- `Copilot Toolkit: Reset Analytics Data`

## Custom prompts and skills

```text
your-project/
├── .github/
│   └── copilot-instructions.md
└── .copilot/
    ├── prompts/
    │   ├── api-review.md
    │   └── test-coverage-check.md
    └── skills/
        ├── security.md
        ├── performance.md
        └── accessibility.md
```

Legacy Markdown prompts are loaded into the Studio without being silently deleted or overwritten.

## Requirements

- VS Code 1.90 or later
- GitHub Copilot access for AI execution
- Node.js 22+ for repository development/release tooling

## Code quality status

The badges at the top of this README are live SonarQube Cloud metrics for `Aetherexa_copilot-toolkit`. They update after the authoritative Sonar scan on `main` and provide a quick view of the current Quality Gate, coverage, bugs, vulnerabilities, code smells, and duplicated-line density.

The full SonarQube Cloud dashboard is available from any Sonar badge.

## Development

```bash
npm ci
npm run compile
npm test
npm run test:coverage
npm run package:vsix
```

The CI quality gates validate:

- extension TypeScript compilation
- React webview TypeScript checking
- Vite production build
- Node.js 22 and 24 unit tests
- minimum 70% line/branch/function coverage
- runtime dependency audit at high severity
- build-tool audit at critical severity
- CodeQL security-and-quality analysis
- VSIX packaging and package hygiene

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance.

## Release security

Marketplace publishing uses **Microsoft Entra ID workload identity federation** from GitHub Actions. The release workflow does not require a long-lived Visual Studio Marketplace PAT.

A release must:

1. pass build, test, coverage, security, and packaging checks;
2. use a semantic version tag matching `package.json`;
3. authenticate from GitHub Actions to Microsoft Entra using OIDC;
4. verify publisher access;
5. publish the validated VSIX to the VS Code Marketplace;
6. publish the same VSIX and SHA-256 checksum as a GitHub Release.

One-time identity configuration is documented in [docs/marketplace-release.md](docs/marketplace-release.md).

## Security

Please report vulnerabilities according to [SECURITY.md](SECURITY.md). Do not disclose exploitable security issues in a public issue before coordinated review.

## License

[MIT](LICENSE)
