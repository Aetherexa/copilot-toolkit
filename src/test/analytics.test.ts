import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_KEY,
  AnalyticsData,
  ExecutionEvent,
  buildCodeQualityMetrics,
  buildCognitiveLoadMetrics,
  buildCombinedImpact,
  buildDailySummary,
  buildFullReport,
  buildSkillAnalytics,
  buildSkillEffectivenessMetrics,
  buildWeeklyTrends,
  computeOverallProductivityGain,
  loadAnalytics,
  recordExecution,
  resetAnalytics,
  saveAnalytics,
} from '../analytics';

class MemoryState {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.store.get(key) as T | undefined) ?? defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.store.delete(key);
      return;
    }
    this.store.set(key, value);
  }
}

function event(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? Date.UTC(2026, 8, 29, 10),
    mode: overrides.mode ?? 'single',
    skillNames: overrides.skillNames ?? ['quality'],
    promptLabel: overrides.promptLabel ?? 'Code Review',
    languageId: overrides.languageId ?? 'typescript',
    fileName: overrides.fileName ?? 'src/app.ts',
    timeSavedMinutes: overrides.timeSavedMinutes ?? 7,
    issuesDetected: overrides.issuesDetected ?? 1,
    fixesApplied: overrides.fixesApplied ?? 0,
    providerId: overrides.providerId,
    modelId: overrides.modelId,
    success: overrides.success,
    durationMs: overrides.durationMs,
    inputTokens: overrides.inputTokens,
    outputTokens: overrides.outputTokens,
    contextItems: overrides.contextItems,
  };
}

function data(events: ExecutionEvent[] = []): AnalyticsData {
  return {
    events,
    totalExecutions: events.length,
    totalTimeSavedMinutes: events.reduce((sum, item) => sum + item.timeSavedMinutes, 0),
    totalIssuesDetected: events.reduce((sum, item) => sum + item.issuesDetected, 0),
    totalFixesApplied: events.reduce((sum, item) => sum + item.fixesApplied, 0),
    firstEventTimestamp: events[0]?.timestamp ?? null,
  };
}

test('loadAnalytics returns an empty default snapshot when state is empty', () => {
  const state = new MemoryState();

  assert.deepEqual(loadAnalytics(state as never), {
    events: [],
    totalExecutions: 0,
    totalTimeSavedMinutes: 0,
    totalIssuesDetected: 0,
    totalFixesApplied: 0,
    firstEventTimestamp: null,
  });
});

test('saveAnalytics caps persisted history at the newest 500 events', async () => {
  const state = new MemoryState();
  const events = Array.from({ length: 510 }, (_, index) => event({
    id: `event-${index}`,
    timestamp: index,
  }));
  const snapshot = data(events);

  await saveAnalytics(state as never, snapshot);
  const saved = state.get<AnalyticsData>(ANALYTICS_KEY, data());

  assert.equal(saved.events.length, 500);
  assert.equal(saved.events[0]?.id, 'event-10');
  assert.equal(saved.events.at(-1)?.id, 'event-509');
});

test('recordExecution maps prompt heuristics and preserves execution metadata', async () => {
  const state = new MemoryState();
  const originalNow = Date.now;
  Date.now = () => Date.UTC(2026, 9, 1, 6, 30);

  try {
    await recordExecution(state as never, {
      mode: 'single',
      skillNames: ['debugging'],
      promptLabel: 'Debug Issue',
      languageId: 'typescript',
      fileName: 'service.ts',
      providerId: 'github-copilot',
      modelId: 'model-a',
      success: true,
      durationMs: 1234,
      inputTokens: 420,
      outputTokens: 180,
      contextItems: 4,
    });
  } finally {
    Date.now = originalNow;
  }

  const snapshot = loadAnalytics(state as never);
  assert.equal(snapshot.totalExecutions, 1);
  assert.equal(snapshot.totalTimeSavedMinutes, 12);
  assert.equal(snapshot.totalIssuesDetected, 3);
  assert.equal(snapshot.totalFixesApplied, 1);
  assert.equal(snapshot.events[0]?.providerId, 'github-copilot');
  assert.equal(snapshot.events[0]?.inputTokens, 420);
  assert.equal(snapshot.events[0]?.contextItems, 4);
  assert.equal(snapshot.firstEventTimestamp, snapshot.events[0]?.timestamp);
});

test('recordExecution uses fallback heuristics and keeps the original first timestamp', async () => {
  const state = new MemoryState();
  await state.update(ANALYTICS_KEY, {
    ...data([event({ id: 'existing', timestamp: 100, timeSavedMinutes: 7 })]),
    firstEventTimestamp: 100,
  } satisfies AnalyticsData);

  await recordExecution(state as never, {
    mode: 'single',
    skillNames: [],
    promptLabel: 'Custom Documentation Task',
    languageId: 'markdown',
    fileName: 'README.md',
  });

  const snapshot = loadAnalytics(state as never);
  assert.equal(snapshot.totalExecutions, 2);
  assert.equal(snapshot.totalTimeSavedMinutes, 14);
  assert.equal(snapshot.totalIssuesDetected, 2);
  assert.equal(snapshot.totalFixesApplied, 0);
  assert.equal(snapshot.firstEventTimestamp, 100);
});

test('daily summary aggregates only the requested UTC day and deduplicates skills and prompts', () => {
  const events = [
    event({ id: 'a', timestamp: Date.UTC(2026, 8, 29, 1), skillNames: ['security', 'quality'], promptLabel: 'Review', timeSavedMinutes: 5, issuesDetected: 2, fixesApplied: 1 }),
    event({ id: 'b', timestamp: Date.UTC(2026, 8, 29, 20), skillNames: ['security'], promptLabel: 'Review', timeSavedMinutes: 6, issuesDetected: 1, fixesApplied: 0 }),
    event({ id: 'c', timestamp: Date.UTC(2026, 8, 30, 1), skillNames: ['testing'], promptLabel: 'Tests', timeSavedMinutes: 9, issuesDetected: 4, fixesApplied: 2 }),
  ];

  assert.deepEqual(buildDailySummary(events, '2026-09-29'), {
    date: '2026-09-29',
    executions: 2,
    timeSavedMinutes: 11,
    issuesDetected: 3,
    fixesApplied: 1,
    skillsUsed: ['security', 'quality'],
    promptsUsed: ['Review'],
  });
});

test('weekly trends group Sunday into the preceding Monday week and calculate top dimensions', () => {
  const events = [
    event({ id: 'mon', timestamp: Date.UTC(2026, 8, 28, 12), skillNames: ['review'], promptLabel: 'Code Review', timeSavedMinutes: 20, issuesDetected: 2 }),
    event({ id: 'sun', timestamp: Date.UTC(2026, 9, 4, 12), skillNames: ['review'], promptLabel: 'Code Review', timeSavedMinutes: 10, issuesDetected: 1, fixesApplied: 1 }),
    event({ id: 'next', timestamp: Date.UTC(2026, 9, 5, 12), skillNames: ['testing'], promptLabel: 'Generate Tests', timeSavedMinutes: 12, issuesDetected: 2 }),
  ];

  const trends = buildWeeklyTrends(events);

  assert.equal(trends.length, 2);
  assert.equal(trends[0]?.executions, 2);
  assert.equal(trends[0]?.timeSavedMinutes, 30);
  assert.equal(trends[0]?.topSkill, 'review');
  assert.equal(trends[0]?.topPrompt, 'Code Review');
  assert.equal(trends[1]?.executions, 1);
  assert.equal(trends[1]?.topSkill, 'testing');
});

test('weekly trends handle events without skills and cap extreme productivity gain', () => {
  const trends = buildWeeklyTrends([
    event({
      timestamp: Date.UTC(2026, 8, 28),
      skillNames: [],
      promptLabel: 'Huge Task',
      timeSavedMinutes: 100_000,
    }),
  ]);

  assert.equal(trends[0]?.topSkill, 'none');
  assert.equal(trends[0]?.productivityGainPct, 99);
});

test('skill analytics aggregates shared events and sorts by value score', () => {
  const result = buildSkillAnalytics([
    event({ id: 'a', skillNames: ['security', 'review'], timeSavedMinutes: 10, issuesDetected: 3 }),
    event({ id: 'b', skillNames: ['security'], timeSavedMinutes: 8, issuesDetected: 2 }),
    event({ id: 'c', skillNames: ['docs'], timeSavedMinutes: 1, issuesDetected: 0 }),
  ]);

  assert.equal(result[0]?.skillName, 'security');
  assert.equal(result[0]?.executions, 2);
  assert.equal(result[0]?.timeSavedMinutes, 18);
  assert.equal(result[0]?.issuesDetected, 5);
  assert.ok((result[0]?.valueScore ?? 0) > (result.at(-1)?.valueScore ?? 0));
});

test('overall productivity gain returns zero without activity and caps extreme values', () => {
  assert.equal(computeOverallProductivityGain(data()), 0);

  const originalNow = Date.now;
  Date.now = () => Date.UTC(2026, 9, 1, 12);
  try {
    const snapshot: AnalyticsData = {
      events: [],
      totalExecutions: 10,
      totalTimeSavedMinutes: 1_000_000,
      totalIssuesDetected: 0,
      totalFixesApplied: 0,
      firstEventTimestamp: Date.UTC(2026, 9, 1, 11),
    };
    assert.equal(computeOverallProductivityGain(snapshot), 99);
  } finally {
    Date.now = originalNow;
  }
});

test('code quality metrics handle empty analytics without division errors', () => {
  assert.deepEqual(buildCodeQualityMetrics(data()), {
    totalIssuesDetected: 0,
    totalFixesApplied: 0,
    fixRate: 0,
    errorReductionPct: 0,
    criticalIssuesPrevented: 0,
    issuesPerExecution: 0,
    qualityScore: 1,
  });
});

test('code quality metrics count high-severity prompt families and cap fix rate', () => {
  const events = [
    event({ id: 'debug', promptLabel: 'Debug Root Cause', issuesDetected: 3, fixesApplied: 3 }),
    event({ id: 'security', promptLabel: 'Security Review', issuesDetected: 4, fixesApplied: 4 }),
    event({ id: 'prepr', promptLabel: 'Pre-PR Review', issuesDetected: 2, fixesApplied: 2 }),
    event({ id: 'docs', promptLabel: 'Documentation', issuesDetected: 1, fixesApplied: 5 }),
  ];
  const metrics = buildCodeQualityMetrics(data(events));

  assert.equal(metrics.criticalIssuesPrevented, 9);
  assert.equal(metrics.fixRate, 100);
  assert.equal(metrics.issuesPerExecution, 2.5);
  assert.ok(metrics.errorReductionPct <= 95);
  assert.ok(metrics.qualityScore <= 100);
});

test('cognitive load metrics cover named prompt heuristics, workflows, defaults, and unique dimensions', () => {
  const events = [
    event({ id: 'explain', promptLabel: 'Explain Component', timeSavedMinutes: 4, skillNames: ['docs'] }),
    event({ id: 'debug', promptLabel: 'Debug Issue', timeSavedMinutes: 12, skillNames: ['debug'] }),
    event({ id: 'perf', promptLabel: 'Performance Analysis', timeSavedMinutes: 8, skillNames: ['perf'] }),
    event({ id: 'refactor', promptLabel: 'Safe Refactor', timeSavedMinutes: 10, skillNames: ['quality'] }),
    event({ id: 'pr', promptLabel: 'Pre-PR Review', timeSavedMinutes: 15, skillNames: ['quality'] }),
    event({ id: 'workflow', mode: 'workflow', promptLabel: 'Production Readiness', timeSavedMinutes: 20, skillNames: ['workflow'] }),
    event({ id: 'custom', promptLabel: 'Something Custom', timeSavedMinutes: 7, skillNames: [] }),
  ];

  const metrics = buildCognitiveLoadMetrics(data(events));

  assert.equal(metrics.manualStepsEliminated, 38);
  assert.equal(metrics.workflowAutomations, 1);
  assert.equal(metrics.uniqueSkillsApplied, 5);
  assert.equal(metrics.uniquePromptsUsed, 7);
  assert.ok(metrics.contextSwitchReductionPct > 0);
  assert.ok(metrics.cognitiveLoadScore > 0);
});

test('skill effectiveness handles zero-issue skills and ranks stronger skills first', () => {
  const metrics = buildSkillEffectivenessMetrics(data([
    event({ id: 'strong-1', skillNames: ['strong'], issuesDetected: 5, fixesApplied: 5, timeSavedMinutes: 30 }),
    event({ id: 'strong-2', skillNames: ['strong'], issuesDetected: 5, fixesApplied: 5, timeSavedMinutes: 30 }),
    event({ id: 'neutral', skillNames: ['neutral'], issuesDetected: 0, fixesApplied: 0, timeSavedMinutes: 1 }),
  ]));

  assert.equal(metrics[0]?.skillName, 'strong');
  assert.equal(metrics[0]?.accuracy, 100);
  assert.equal(metrics.find(item => item.skillName === 'neutral')?.accuracy, 50);
  assert.ok((metrics[0]?.effectivenessScore ?? 0) >= (metrics[1]?.effectivenessScore ?? 0));
});

test('combined impact returns each verdict tier at the expected score ranges', () => {
  const quality = (score: number) => ({
    totalIssuesDetected: 0,
    totalFixesApplied: 0,
    fixRate: 0,
    errorReductionPct: 0,
    criticalIssuesPrevented: 0,
    issuesPerExecution: 0,
    qualityScore: score,
  });
  const cognitive = (score: number) => ({
    manualStepsEliminated: 0,
    contextSwitchReductionPct: 0,
    workflowAutomations: 0,
    avgDecisionTimeSavedMins: 0,
    uniqueSkillsApplied: 0,
    uniquePromptsUsed: 0,
    cognitiveLoadScore: score,
  });
  const skill = (score: number) => [{
    skillName: 'test',
    executions: 1,
    issuesDetected: 1,
    fixesApplied: 1,
    timeSavedMinutes: 1,
    accuracy: 100,
    impactScore: score,
    effectivenessScore: score,
    grade: 'A' as const,
  }];

  const exceptional = buildCombinedImpact(quality(100), cognitive(100), skill(100), 100);
  const strong = buildCombinedImpact(quality(75), cognitive(75), skill(75), 50);
  const solid = buildCombinedImpact(quality(55), cognitive(55), skill(55), 25);
  const early = buildCombinedImpact(quality(35), cognitive(35), skill(35), 10);
  const start = buildCombinedImpact(quality(0), cognitive(0), [], 0);

  assert.match(exceptional.verdict, /Exceptional/);
  assert.match(strong.verdict, /Strong/);
  assert.match(solid.verdict, /Solid/);
  assert.match(early.verdict, /Early/);
  assert.match(start.verdict, /Getting Started/);
  assert.equal(start.skillEffectivenessScore, 0);
});

test('full report composes current, recent, top-dimension, and impact metrics', () => {
  const originalNow = Date.now;
  const now = Date.UTC(2026, 9, 1, 12);
  Date.now = () => now;

  try {
    const snapshot = data([
      event({ id: 'today', timestamp: now - 60_000, languageId: 'typescript', promptLabel: 'Code Review', skillNames: ['review'], timeSavedMinutes: 10 }),
      event({ id: 'recent', timestamp: now - 2 * 86_400_000, languageId: 'typescript', promptLabel: 'Generate Tests', skillNames: ['testing'], timeSavedMinutes: 12 }),
      event({ id: 'old', timestamp: now - 20 * 86_400_000, languageId: 'python', promptLabel: 'Explain Code', skillNames: ['docs'], timeSavedMinutes: 5 }),
    ]);

    const report = buildFullReport(snapshot);

    assert.equal(report.today.executions, 1);
    assert.equal(report.last7Days.executions, 2);
    assert.equal(report.topLanguage, 'typescript');
    assert.equal(report.totalExecutions, 3);
    assert.ok(report.weeklyTrends.length >= 2);
    assert.ok(report.topSkills.length > 0);
    assert.equal(report.codeQuality.totalIssuesDetected, snapshot.totalIssuesDetected);
    assert.equal(report.combinedImpact.codeQualityScore, report.codeQuality.qualityScore);
  } finally {
    Date.now = originalNow;
  }
});

test('resetAnalytics removes persisted analytics state', async () => {
  const state = new MemoryState();
  await state.update(ANALYTICS_KEY, data([event()]));

  await resetAnalytics(state as never);

  assert.equal(loadAnalytics(state as never).totalExecutions, 0);
});
