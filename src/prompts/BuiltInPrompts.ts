import { ContextBinding } from '../domain/context';
import { PromptDefinition } from '../domain/prompt';

const BUILTIN_TIMESTAMP = Date.UTC(2026, 9, 1);

function binding(
  type: ContextBinding['type'],
  options: ContextBinding['options'] = {},
  label?: string,
): ContextBinding {
  return { type, enabled: true, label: label ?? type, options };
}

function currentCodeContext(): ContextBinding[] {
  return [
    binding('currentSelection', { maxTokens: 700, detail: 'high' }, 'Selected Code'),
    binding('currentFile', { maxTokens: 1200, detail: 'medium' }, 'Current File'),
    binding('relatedFiles', { maxFiles: 4, maxTokens: 260, depth: 2 }, 'Related Files'),
  ];
}

function changeContext(): ContextBinding[] {
  return [
    binding('gitDiff', { includeStaged: true, includeUnstaged: true, maxTokens: 1200 }, 'Git Diff'),
    binding('changedFiles', { maxFiles: 8, maxTokens: 220 }, 'Changed Files'),
    binding('relatedFiles', { maxFiles: 5, maxTokens: 240, depth: 2 }, 'Related Files'),
    binding('relatedTests', { maxFiles: 4, maxTokens: 220 }, 'Related Tests'),
  ];
}

function architectureContext(): ContextBinding[] {
  return [
    binding('currentFile', { maxTokens: 900 }, 'Current File'),
    binding('relatedFiles', { maxFiles: 5, maxTokens: 220, depth: 2 }, 'Related Files'),
    binding('architectureSummary', { maxTokens: 650 }, 'Architecture Summary'),
    binding('dependencyGraph', { maxTokens: 650, depth: 2 }, 'Dependency Graph'),
  ];
}

function workspaceContext(): ContextBinding[] {
  return [
    binding('workspaceSummary', { maxTokens: 700 }, 'Workspace Summary'),
    binding('architectureSummary', { maxTokens: 650 }, 'Architecture Summary'),
    binding('currentFile', { maxTokens: 700 }, 'Current File'),
  ];
}

interface BuiltInPromptSpec {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  body: string[];
  context: ContextBinding[];
  contextBudgetTokens: number;
}

const BUILT_IN_SPECS: BuiltInPromptSpec[] = [
  {
    id: 'builtin-explain-code',
    name: 'Explain Code',
    description: 'Explain purpose, flow, dependencies, side effects, and non-obvious behavior.',
    category: 'Code Understanding',
    tags: ['explain', 'onboarding', 'understanding'],
    body: [
      'Explain the provided code for a developer who needs to understand it quickly and accurately.',
      'Cover purpose, inputs and outputs, control/data flow, important dependencies, side effects, error paths, and non-obvious behavior.',
      'Separate facts visible in the code from assumptions. Call out missing context instead of inventing behavior.',
      'Finish with a concise mental model of how the code fits together.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 2800,
  },
  {
    id: 'builtin-code-review',
    name: 'Code Review',
    description: 'Review correctness, maintainability, reliability, security, performance, and testability.',
    category: 'Code Review',
    tags: ['review', 'quality', 'maintainability'],
    body: [
      'Perform a practical code review of the provided code and context.',
      'Look for correctness defects, fragile assumptions, maintainability problems, error-handling gaps, security concerns, performance risks, and missing tests.',
      'Prioritize findings by impact and confidence. For each meaningful finding, explain why it matters and suggest a concrete improvement.',
      'Avoid style-only comments unless they materially affect readability or maintainability. Do not invent issues unsupported by the code.',
    ],
    context: changeContext(),
    contextBudgetTokens: 3600,
  },
  {
    id: 'builtin-debug-root-cause',
    name: 'Debug Root Cause',
    description: 'Analyze symptoms and code paths to identify the most likely root cause.',
    category: 'Debugging',
    tags: ['debug', 'root-cause', 'bug'],
    body: [
      'Investigate the provided code and context as a debugging problem.',
      'Identify the most likely root cause, the evidence supporting it, alternative hypotheses, and the exact execution path that can produce the symptom.',
      'Highlight any assumptions that still need runtime evidence.',
      'End with the smallest useful set of checks, logs, or reproductions that would confirm or reject the diagnosis.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3200,
  },
  {
    id: 'builtin-fix-plan',
    name: 'Fix Plan',
    description: 'Produce a minimal, safe implementation plan for a confirmed or suspected defect.',
    category: 'Debugging',
    tags: ['fix', 'plan', 'bug'],
    body: [
      'Create a safe implementation plan for fixing the identified problem.',
      'Prefer the smallest change that addresses the root cause without introducing unrelated refactoring.',
      'List files or areas likely to change, behavioral risks, compatibility concerns, validation steps, and rollback considerations where relevant.',
      'If the root cause is still uncertain, explicitly separate diagnostic work from the proposed fix.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3000,
  },
  {
    id: 'builtin-refactor-plan',
    name: 'Refactor Plan',
    description: 'Plan a behavior-preserving refactor with clear stages, risks, and validation.',
    category: 'Refactoring',
    tags: ['refactor', 'design', 'maintainability'],
    body: [
      'Design a staged refactor that improves maintainability while preserving observable behavior.',
      'Identify the main design problems, desired boundaries, safe sequencing, dependencies, and tests needed before and after each stage.',
      'Keep the plan incremental and reversible. Separate essential refactoring from optional cleanup.',
      'Call out any architecture assumptions that should be verified before implementation.',
    ],
    context: architectureContext(),
    contextBudgetTokens: 3400,
  },
  {
    id: 'builtin-simplify-code',
    name: 'Simplify Code',
    description: 'Reduce unnecessary complexity without changing observable behavior.',
    category: 'Refactoring',
    tags: ['simplify', 'clean-code', 'complexity'],
    body: [
      'Find opportunities to simplify the provided code without changing its observable behavior.',
      'Focus on unnecessary branching, duplication, indirection, confusing naming, oversized responsibilities, and avoidable state.',
      'Prefer clear, boring, maintainable code over clever abstractions.',
      'Explain each recommended simplification and any trade-off it introduces.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 2800,
  },
  {
    id: 'builtin-generate-tests',
    name: 'Generate Tests',
    description: 'Design focused tests for behavior, regressions, boundaries, and failures.',
    category: 'Testing',
    tags: ['tests', 'coverage', 'regression'],
    body: [
      'Design focused tests for the provided code and context.',
      'Cover core behavior, important branches, boundary conditions, failure paths, regressions, and interactions with dependencies.',
      'Reuse the project\'s existing test style when visible. Avoid brittle tests that depend on implementation details unless necessary.',
      'For each proposed test, state the behavior it protects. Include example test code when the surrounding context is sufficient.',
    ],
    context: [
      ...currentCodeContext(),
      binding('relatedTests', { maxFiles: 5, maxTokens: 260 }, 'Related Tests'),
    ],
    contextBudgetTokens: 3600,
  },
  {
    id: 'builtin-test-gap-analysis',
    name: 'Test Gap Analysis',
    description: 'Identify important behavior that existing tests do not appear to protect.',
    category: 'Testing',
    tags: ['tests', 'gaps', 'coverage'],
    body: [
      'Analyze the implementation and available tests to identify meaningful test gaps.',
      'Focus on business-critical behavior, edge cases, error handling, state transitions, integration boundaries, and regression-prone paths.',
      'Do not equate line coverage with test quality.',
      'Return a prioritized list of missing scenarios and explain the risk each scenario addresses.',
    ],
    context: [
      binding('currentFile', { maxTokens: 900 }, 'Current File'),
      binding('relatedFiles', { maxFiles: 4, maxTokens: 220, depth: 2 }, 'Related Files'),
      binding('relatedTests', { maxFiles: 6, maxTokens: 300 }, 'Related Tests'),
      binding('gitDiff', { maxTokens: 800 }, 'Git Diff'),
    ],
    contextBudgetTokens: 3600,
  },
  {
    id: 'builtin-edge-case-finder',
    name: 'Edge Case Finder',
    description: 'Find realistic edge cases, boundary conditions, and failure scenarios.',
    category: 'Testing',
    tags: ['edge-cases', 'testing', 'reliability'],
    body: [
      'Identify realistic edge cases and failure scenarios for the provided code.',
      'Consider empty and missing values, boundaries, invalid inputs, ordering, duplicate data, partial failures, retries, timing, state transitions, and external dependency behavior where applicable.',
      'Rank cases by likelihood and impact. Avoid contrived scenarios with little engineering value.',
      'Suggest the most useful tests or guards for the highest-value cases.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 2800,
  },
  {
    id: 'builtin-security-review',
    name: 'Security Review',
    description: 'Review trust boundaries, validation, authorization, secrets, data exposure, and unsafe behavior.',
    category: 'Security',
    tags: ['security', 'review', 'hardening'],
    body: [
      'Perform a defensive security review of the provided code and context.',
      'Check trust boundaries, authentication and authorization assumptions, input validation, injection risks, sensitive-data handling, secret exposure, unsafe defaults, dependency boundaries, and error information leakage where relevant.',
      'Only report risks supported by the available code. Distinguish confirmed issues from items that require verification.',
      'For each meaningful risk, explain impact and provide a safer implementation direction.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3200,
  },
  {
    id: 'builtin-threat-model',
    name: 'Lightweight Threat Model',
    description: 'Map assets, entry points, trust boundaries, abuse cases, and practical mitigations.',
    category: 'Security',
    tags: ['threat-model', 'security', 'risk'],
    body: [
      'Create a lightweight threat model for the provided component, feature, or code path.',
      'Identify important assets, actors, entry points, trust boundaries, likely abuse cases, and existing controls visible in the code.',
      'Prioritize practical threats rather than producing an exhaustive checklist.',
      'For each priority threat, suggest a proportionate mitigation and note what evidence is still missing.',
    ],
    context: architectureContext(),
    contextBudgetTokens: 3400,
  },
  {
    id: 'builtin-performance-review',
    name: 'Performance Review',
    description: 'Find likely bottlenecks, unnecessary work, scaling risks, and measurement opportunities.',
    category: 'Performance',
    tags: ['performance', 'latency', 'scalability'],
    body: [
      'Review the provided code for performance and scalability risks.',
      'Look for unnecessary repeated work, avoidable allocations, expensive loops or queries, excessive I/O, blocking operations, inefficient data access, rendering/recomputation issues, and growth-sensitive behavior where applicable.',
      'Do not claim a bottleneck without evidence. Separate likely risks from hypotheses that require measurement.',
      'Recommend what to measure first and the least risky optimization options.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3000,
  },
  {
    id: 'builtin-async-concurrency-review',
    name: 'Async & Concurrency Review',
    description: 'Review asynchronous flows for races, ordering, cancellation, retries, and resource leaks.',
    category: 'Reliability',
    tags: ['async', 'concurrency', 'reliability'],
    body: [
      'Review asynchronous and concurrent behavior in the provided code.',
      'Look for race conditions, stale state, ordering assumptions, unhandled rejections, cancellation gaps, duplicate work, retry hazards, deadlocks, resource leaks, and unsafe shared state where relevant.',
      'Explain the execution sequence behind each risk.',
      'Suggest deterministic fixes and tests that can reproduce the problematic timing or ordering.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3000,
  },
  {
    id: 'builtin-error-handling-review',
    name: 'Error Handling Review',
    description: 'Review failure handling, propagation, retries, fallbacks, cleanup, and user-facing behavior.',
    category: 'Reliability',
    tags: ['errors', 'reliability', 'resilience'],
    body: [
      'Review how the provided code handles failures.',
      'Check error propagation, recovery, retries, timeouts, fallback behavior, cleanup, partial success, logging, user-facing messages, and swallowed exceptions where applicable.',
      'Identify places where failures can become silent, ambiguous, duplicated, or destructive.',
      'Recommend concrete improvements while avoiding unnecessary catch-and-rethrow patterns.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 2800,
  },
  {
    id: 'builtin-observability-review',
    name: 'Observability Review',
    description: 'Review logs, metrics, tracing, diagnostic context, and operational signals.',
    category: 'Reliability',
    tags: ['observability', 'logging', 'metrics'],
    body: [
      'Review the provided code from an observability and supportability perspective.',
      'Identify where logs, metrics, traces, correlation identifiers, or diagnostic context would materially improve production troubleshooting.',
      'Avoid noisy or sensitive logging. Recommend signals that help answer what failed, where, for whom, how often, and with what impact.',
      'Call out data that should never be logged.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 2800,
  },
  {
    id: 'builtin-data-validation-review',
    name: 'Data Validation Review',
    description: 'Review assumptions about external, user, persisted, and cross-service data.',
    category: 'Quality',
    tags: ['validation', 'data', 'correctness'],
    body: [
      'Review data validation and normalization in the provided code.',
      'Identify untrusted or ambiguous inputs, missing schema checks, unsafe coercion, invalid state combinations, encoding/format assumptions, and inconsistent validation across boundaries.',
      'Distinguish validation that belongs at system boundaries from internal invariants.',
      'Recommend concise, maintainable validation and useful failure behavior.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 2800,
  },
  {
    id: 'builtin-change-impact',
    name: 'Change Impact Analysis',
    description: 'Identify what a code change can affect across dependencies, callers, tests, and contracts.',
    category: 'Change Analysis',
    tags: ['impact', 'dependencies', 'change'],
    body: [
      'Analyze the impact of the provided change.',
      'Trace direct and indirect dependencies, callers, tests, contracts, state or data-flow implications, and compatibility risks using the available context.',
      'Separate confirmed affected areas from plausible areas that need verification.',
      'Return a prioritized validation checklist for the change.',
    ],
    context: changeContext(),
    contextBudgetTokens: 3800,
  },
  {
    id: 'builtin-architecture-review',
    name: 'Architecture Review',
    description: 'Review boundaries, coupling, responsibilities, dependencies, and design trade-offs.',
    category: 'Architecture',
    tags: ['architecture', 'design', 'dependencies'],
    body: [
      'Review the provided code in its architectural context.',
      'Evaluate responsibilities, boundaries, coupling, dependency direction, cohesion, state ownership, extensibility, and failure isolation where visible.',
      'Prefer evidence from the workspace structure over generic design-pattern advice.',
      'Identify the highest-value architectural improvements and explain trade-offs, migration risk, and what should remain unchanged.',
    ],
    context: architectureContext(),
    contextBudgetTokens: 3800,
  },
  {
    id: 'builtin-api-contract-review',
    name: 'API Contract Review',
    description: 'Review request/response contracts, validation, errors, idempotency, and evolution risks.',
    category: 'API',
    tags: ['api', 'contract', 'integration'],
    body: [
      'Review the visible API or integration contract in the provided code.',
      'Check request and response semantics, validation, status/error behavior, optional versus required fields, idempotency, pagination or batching where relevant, versioning, and compatibility.',
      'Identify ambiguous or unstable contract behavior and integration failure modes.',
      'Recommend changes that make the contract easier to consume and evolve safely.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3000,
  },
  {
    id: 'builtin-backward-compatibility',
    name: 'Backward Compatibility Review',
    description: 'Find changes that may break callers, consumers, data, configuration, or persisted behavior.',
    category: 'Compatibility',
    tags: ['compatibility', 'breaking-change', 'migration'],
    body: [
      'Review the provided change for backward-compatibility risk.',
      'Consider public APIs, function signatures, events, schemas, persisted data, configuration, defaults, CLI or UI behavior, serialization, and downstream assumptions where applicable.',
      'Classify each risk as confirmed, likely, or uncertain based on the available evidence.',
      'Suggest compatible alternatives, migration steps, or deprecation strategies.',
    ],
    context: changeContext(),
    contextBudgetTokens: 3600,
  },
  {
    id: 'builtin-dependency-upgrade-plan',
    name: 'Dependency Upgrade Plan',
    description: 'Plan a dependency or platform upgrade with compatibility, rollout, and validation steps.',
    category: 'Maintenance',
    tags: ['dependencies', 'upgrade', 'migration'],
    body: [
      'Create a safe plan for upgrading a dependency, framework, runtime, SDK, or platform based on the available workspace context.',
      'Identify likely integration points, compatibility risks, deprecated usage, configuration changes, test coverage needs, rollout sequencing, and rollback considerations.',
      'Do not invent release-note details that are not present in the context.',
      'Separate repository-specific work from external research that still needs to be done.',
    ],
    context: workspaceContext(),
    contextBudgetTokens: 3200,
  },
  {
    id: 'builtin-documentation-writer',
    name: 'Documentation Writer',
    description: 'Create developer documentation grounded in the actual code and architecture.',
    category: 'Documentation',
    tags: ['docs', 'readme', 'onboarding'],
    body: [
      'Write clear developer-facing documentation for the provided code or feature.',
      'Explain purpose, how it works, important dependencies, configuration, common usage, failure behavior, extension points, and operational caveats when visible.',
      'Use terminology from the codebase and avoid claims not supported by the context.',
      'Prefer concise examples and practical guidance over generic prose.',
    ],
    context: architectureContext(),
    contextBudgetTokens: 3400,
  },
  {
    id: 'builtin-pr-description',
    name: 'PR Description',
    description: 'Draft a concise pull-request description grounded in the actual code changes.',
    category: 'Collaboration',
    tags: ['pull-request', 'summary', 'collaboration'],
    body: [
      'Draft a concise pull-request description from the provided changes and context.',
      'Include: what changed, why it changed when inferable, important implementation notes, testing or validation performed/needed, risks, and any follow-up work.',
      'Do not claim tests passed, incidents were fixed, or behavior was validated unless the context provides that evidence.',
      'Use clear Markdown suitable for a code review.',
    ],
    context: changeContext(),
    contextBudgetTokens: 3400,
  },
  {
    id: 'builtin-release-risk-review',
    name: 'Release Risk Review',
    description: 'Assess deployment risk, rollback concerns, validation needs, and blast radius.',
    category: 'Delivery',
    tags: ['release', 'risk', 'deployment'],
    body: [
      'Assess the release risk of the provided change.',
      'Consider blast radius, dependencies, data or schema changes, configuration, rollout order, failure modes, observability, rollback feasibility, and validation gaps.',
      'Distinguish evidence-based risks from unknowns.',
      'Return a practical pre-release checklist and the signals that should be watched after deployment.',
    ],
    context: changeContext(),
    contextBudgetTokens: 3800,
  },
  {
    id: 'studio-react-pr-review',
    name: 'React PR Review',
    description: 'Legacy React-focused review action kept for compatibility with existing prompts and workflows.',
    category: 'Code Review',
    tags: ['react', 'review', 'legacy'],
    body: [
      'Review the provided React code and context for correctness, maintainability, performance, security, testing gaps, and architectural concerns.',
      'Provide concise, actionable findings grounded in the code. Call out uncertainty instead of inventing missing behavior.',
    ],
    context: currentCodeContext(),
    contextBudgetTokens: 3000,
  },
];

export function getBuiltInPrompts(): PromptDefinition[] {
  return BUILT_IN_SPECS.map(spec => ({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    tags: [...spec.tags],
    body: spec.body.join('\n\n'),
    favorite: false,
    context: spec.context.map(item => ({
      ...item,
      options: item.options ? { ...item.options } : undefined,
    })),
    contextBudgetTokens: spec.contextBudgetTokens,
    providerId: 'github-copilot',
    modelId: 'copilot-default',
    source: 'builtin',
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  }));
}
