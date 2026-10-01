import { Workflow } from '../domain/workflow';

const BUILTIN_TIMESTAMP = Date.UTC(2026, 9, 1);

function step(
  id: string,
  name: string,
  promptId?: string,
  inputFromPreviousStep = false,
  inlinePrompt?: string,
): Workflow['steps'][number] {
  return {
    id,
    name,
    promptId,
    inlinePrompt,
    enabled: true,
    inputFromPreviousStep,
  };
}

export function getBuiltInWorkflows(): Workflow[] {
  return [
    {
      id: 'workflow-pr-preparation',
      name: 'PR Readiness',
      description: 'Analyze change impact, review quality and tests, check security, then draft a grounded PR description.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-pr-impact', 'Change Impact', 'builtin-change-impact'),
        step('wf-pr-review', 'Code Review', 'builtin-code-review', true),
        step('wf-pr-tests', 'Test Gap Analysis', 'builtin-test-gap-analysis', true),
        step('wf-pr-security', 'Security Review', 'builtin-security-review', true),
        step('wf-pr-description', 'PR Description', 'builtin-pr-description', true),
      ],
    },
    {
      id: 'workflow-debug',
      name: 'Debug to Fix',
      description: 'Move from diagnosis to a safe fix plan, regression tests, and a final review.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-debug-root', 'Root Cause', 'builtin-debug-root-cause'),
        step('wf-debug-fix', 'Fix Plan', 'builtin-fix-plan', true),
        step('wf-debug-tests', 'Regression Tests', 'builtin-generate-tests', true),
        step('wf-debug-review', 'Final Review', 'builtin-code-review', true),
      ],
    },
    {
      id: 'workflow-refactor',
      name: 'Safe Refactor',
      description: 'Review architecture, plan a behavior-preserving refactor, assess impact, strengthen tests, and review the result.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-refactor-architecture', 'Architecture Review', 'builtin-architecture-review'),
        step('wf-refactor-plan', 'Refactor Plan', 'builtin-refactor-plan', true),
        step('wf-refactor-impact', 'Change Impact', 'builtin-change-impact', true),
        step('wf-refactor-tests', 'Test Plan', 'builtin-generate-tests', true),
        step('wf-refactor-review', 'Final Review', 'builtin-code-review', true),
      ],
    },
    {
      id: 'workflow-test-hardening',
      name: 'Test Hardening',
      description: 'Find weak coverage, discover edge cases, generate focused tests, and review the resulting test strategy.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-test-gaps', 'Test Gap Analysis', 'builtin-test-gap-analysis'),
        step('wf-test-edges', 'Edge Cases', 'builtin-edge-case-finder', true),
        step('wf-test-generate', 'Generate Tests', 'builtin-generate-tests', true),
        step('wf-test-review', 'Review Test Strategy', 'builtin-code-review', true),
      ],
    },
    {
      id: 'workflow-security-hardening',
      name: 'Security Hardening',
      description: 'Build a lightweight threat model, review concrete risks, plan fixes, and define security-focused validation.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-security-threats', 'Threat Model', 'builtin-threat-model'),
        step('wf-security-review', 'Security Review', 'builtin-security-review', true),
        step('wf-security-fix', 'Hardening Plan', 'builtin-fix-plan', true),
        step('wf-security-tests', 'Security Regression Tests', 'builtin-generate-tests', true),
      ],
    },
    {
      id: 'workflow-performance-investigation',
      name: 'Performance Investigation',
      description: 'Identify likely performance risks, review async behavior, define measurements, then validate optimization ideas.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-perf-review', 'Performance Review', 'builtin-performance-review'),
        step('wf-perf-async', 'Async & Concurrency Review', 'builtin-async-concurrency-review', true),
        step(
          'wf-perf-measure',
          'Measurement Plan',
          undefined,
          true,
          'Using the prior analysis, define the smallest useful benchmark, profiling, tracing, or runtime measurements needed before optimizing. Specify what to measure, expected signals, and how to avoid misleading results.',
        ),
        step('wf-perf-final', 'Optimization Review', 'builtin-code-review', true),
      ],
    },
    {
      id: 'workflow-api-change-safety',
      name: 'API Change Safety',
      description: 'Review an API change for contract clarity, compatibility, tests, and documentation.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-api-contract', 'Contract Review', 'builtin-api-contract-review'),
        step('wf-api-compat', 'Compatibility Review', 'builtin-backward-compatibility', true),
        step('wf-api-tests', 'Contract Tests', 'builtin-generate-tests', true),
        step('wf-api-docs', 'Documentation', 'builtin-documentation-writer', true),
      ],
    },
    {
      id: 'workflow-dependency-upgrade',
      name: 'Dependency Upgrade',
      description: 'Plan an upgrade, analyze repository impact and compatibility, then define focused validation.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-upgrade-plan', 'Upgrade Plan', 'builtin-dependency-upgrade-plan'),
        step('wf-upgrade-impact', 'Change Impact', 'builtin-change-impact', true),
        step('wf-upgrade-compat', 'Compatibility Review', 'builtin-backward-compatibility', true),
        step('wf-upgrade-tests', 'Validation Tests', 'builtin-generate-tests', true),
      ],
    },
    {
      id: 'workflow-onboarding-docs',
      name: 'Codebase Onboarding',
      description: 'Turn unfamiliar code into a clear mental model, architecture explanation, and developer documentation.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-onboard-explain', 'Explain Code', 'builtin-explain-code'),
        step('wf-onboard-architecture', 'Architecture Review', 'builtin-architecture-review', true),
        step('wf-onboard-docs', 'Developer Guide', 'builtin-documentation-writer', true),
      ],
    },
    {
      id: 'workflow-production-readiness',
      name: 'Production Readiness',
      description: 'Review reliability, observability, security, performance, and test gaps before release.',
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
      steps: [
        step('wf-prod-errors', 'Error Handling', 'builtin-error-handling-review'),
        step('wf-prod-observability', 'Observability', 'builtin-observability-review', true),
        step('wf-prod-security', 'Security', 'builtin-security-review', true),
        step('wf-prod-performance', 'Performance', 'builtin-performance-review', true),
        step('wf-prod-tests', 'Test Gaps', 'builtin-test-gap-analysis', true),
        step('wf-prod-release', 'Release Risk', 'builtin-release-risk-review', true),
      ],
    },
  ];
}
