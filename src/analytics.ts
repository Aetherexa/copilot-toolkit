import * as vscode from 'vscode';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ANALYTICS_KEY = 'copilotToolkit.analyticsData';

/**
 * Estimated minutes saved per prompt type.
 * Based on typical developer time studies for manual equivalents.
 */
export const TIME_SAVED_MAP: Record<string, number> = {
  'explain component':   4,   // avg 4 min to read + understand a component manually
  'debug issue':         12,  // avg 12 min to root-cause a bug
  'performance analysis': 8,  // avg 8 min to profile + identify bottleneck
  'safe refactor':       10,  // avg 10 min to clean up code with confidence
  'pre-pr review':       15,  // avg 15 min for a thorough manual review
  'default':             7,   // generic fallback
};

/**
 * Issue severity weights for "issues detected" scoring.
 */
export const SEVERITY_WEIGHT: Record<string, number> = {
  '🚫': 3,  // blockers
  '⚠️': 2,  // warnings
  '💡': 1,  // suggestions
};

// ─── Data types ───────────────────────────────────────────────────────────────

export interface ExecutionEvent {
  id: string;               // uuid-like: timestamp + random
  timestamp: number;        // unix ms
  mode: 'single' | 'workflow';
  skillNames: string[];
  promptLabel: string;
  languageId: string;
  fileName: string;
  timeSavedMinutes: number;
  issuesDetected: number;   // estimated from prompt type
  fixesApplied: number;     // incremented when user runs a fix-oriented prompt
  providerId?: string;
  modelId?: string;
  success?: boolean;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  contextItems?: number;
}

export interface DailySummary {
  date: string;             // YYYY-MM-DD
  executions: number;
  timeSavedMinutes: number;
  issuesDetected: number;
  fixesApplied: number;
  skillsUsed: string[];
  promptsUsed: string[];
}

export interface WeeklyTrend {
  weekLabel: string;        // e.g. "May 19 – May 25"
  executions: number;
  timeSavedMinutes: number;
  issuesDetected: number;
  fixesApplied: number;
  topSkill: string;
  topPrompt: string;
  productivityGainPct: number;
}

export interface SkillAnalytics {
  skillName: string;
  executions: number;
  timeSavedMinutes: number;
  issuesDetected: number;
  valueScore: number;       // composite score: time*0.5 + issues*3 + execs*1
}

export interface AnalyticsData {
  events: ExecutionEvent[];
  totalExecutions: number;
  totalTimeSavedMinutes: number;
  totalIssuesDetected: number;
  totalFixesApplied: number;
  firstEventTimestamp: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function promptToTimeSaved(promptLabel: string): number {
  const lower = promptLabel.toLowerCase();
  for (const [key, mins] of Object.entries(TIME_SAVED_MAP)) {
    if (lower.includes(key)) { return mins; }
  }
  return TIME_SAVED_MAP['default'];
}

function promptToIssuesEstimate(promptLabel: string): number {
  const lower = promptLabel.toLowerCase();
  if (lower.includes('debug') || lower.includes('security') || lower.includes('pre-pr')) { return 3; }
  if (lower.includes('performance') || lower.includes('refactor')) { return 2; }
  return 1;
}

function isFixOriented(promptLabel: string): boolean {
  const lower = promptLabel.toLowerCase();
  return lower.includes('debug') || lower.includes('refactor') || lower.includes('fix');
}

// ─── Store ────────────────────────────────────────────────────────────────────

export function loadAnalytics(state: vscode.Memento): AnalyticsData {
  return state.get<AnalyticsData>(ANALYTICS_KEY, {
    events: [],
    totalExecutions: 0,
    totalTimeSavedMinutes: 0,
    totalIssuesDetected: 0,
    totalFixesApplied: 0,
    firstEventTimestamp: null,
  });
}

export async function saveAnalytics(state: vscode.Memento, data: AnalyticsData): Promise<void> {
  // Keep at most 500 events to avoid bloat
  if (data.events.length > 500) {
    data.events = data.events.slice(data.events.length - 500);
  }
  await state.update(ANALYTICS_KEY, data);
}

// ─── Event recording ──────────────────────────────────────────────────────────

/**
 * Records a single toolkit execution into persistent analytics.
 * Call this after sendToCopilot() succeeds.
 */
export async function recordExecution(
  state: vscode.Memento,
  params: {
    mode: 'single' | 'workflow';
    skillNames: string[];
    promptLabel: string;
    languageId: string;
    fileName: string;
    providerId?: string;
    modelId?: string;
    success?: boolean;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    contextItems?: number;
  }
): Promise<void> {
  const data = loadAnalytics(state);

  const timeSaved = promptToTimeSaved(params.promptLabel);
  const issues = promptToIssuesEstimate(params.promptLabel);
  const fixes = isFixOriented(params.promptLabel) ? 1 : 0;

  const event: ExecutionEvent = {
    id: generateId(),
    timestamp: Date.now(),
    mode: params.mode,
    skillNames: params.skillNames,
    promptLabel: params.promptLabel,
    languageId: params.languageId,
    fileName: params.fileName,
    timeSavedMinutes: timeSaved,
    issuesDetected: issues,
    fixesApplied: fixes,
    providerId: params.providerId,
    modelId: params.modelId,
    success: params.success,
    durationMs: params.durationMs,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    contextItems: params.contextItems,
  };

  data.events.push(event);
  data.totalExecutions += 1;
  data.totalTimeSavedMinutes += timeSaved;
  data.totalIssuesDetected += issues;
  data.totalFixesApplied += fixes;
  if (!data.firstEventTimestamp) { data.firstEventTimestamp = event.timestamp; }

  await saveAnalytics(state, data);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/** Groups events by YYYY-MM-DD. */
function groupByDay(events: ExecutionEvent[]): Map<string, ExecutionEvent[]> {
  const map = new Map<string, ExecutionEvent[]>();
  for (const ev of events) {
    const day = toDateString(ev.timestamp);
    const arr = map.get(day) ?? [];
    arr.push(ev);
    map.set(day, arr);
  }
  return map;
}

/** Returns unique sorted week keys (Mon of each week as YYYY-MM-DD). */
function getWeekKey(ts: number): string {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day); // offset to Monday
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function weekLabel(weekKey: string): string {
  const mon = new Date(weekKey);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

function topBy<T>(arr: T[], key: (item: T) => number): T | undefined {
  return arr.length ? arr.reduce((a, b) => (key(a) >= key(b) ? a : b)) : undefined;
}

function countBy<T>(arr: T[], fn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const k = fn(item);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

function topKey(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (!entries.length) { return 'none'; }
  return entries.reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
}

// ─── Daily Summary ────────────────────────────────────────────────────────────

export function buildDailySummary(events: ExecutionEvent[], date: string): DailySummary {
  const dayEvents = events.filter(e => toDateString(e.timestamp) === date);
  return {
    date,
    executions: dayEvents.length,
    timeSavedMinutes: dayEvents.reduce((s, e) => s + e.timeSavedMinutes, 0),
    issuesDetected: dayEvents.reduce((s, e) => s + e.issuesDetected, 0),
    fixesApplied: dayEvents.reduce((s, e) => s + e.fixesApplied, 0),
    skillsUsed: [...new Set(dayEvents.flatMap(e => e.skillNames))],
    promptsUsed: [...new Set(dayEvents.map(e => e.promptLabel))],
  };
}

// ─── Weekly Trend ─────────────────────────────────────────────────────────────

export function buildWeeklyTrends(events: ExecutionEvent[]): WeeklyTrend[] {
  const weekMap = new Map<string, ExecutionEvent[]>();
  for (const ev of events) {
    const wk = getWeekKey(ev.timestamp);
    const arr = weekMap.get(wk) ?? [];
    arr.push(ev);
    weekMap.set(wk, arr);
  }

  const sortedKeys = [...weekMap.keys()].sort();
  const trends: WeeklyTrend[] = sortedKeys.map(wk => {
    const wkEvents = weekMap.get(wk)!;
    const timeSaved = wkEvents.reduce((s, e) => s + e.timeSavedMinutes, 0);
    const issues = wkEvents.reduce((s, e) => s + e.issuesDetected, 0);
    const fixes = wkEvents.reduce((s, e) => s + e.fixesApplied, 0);

    const skillCounts = countBy(wkEvents.flatMap(e => e.skillNames).map(s => ({ s })), x => x.s);
    const promptCounts = countBy(wkEvents, e => e.promptLabel);

    // Productivity gain: compared to a baseline of 0 (first week) or previous week
    const workDays = 5;
    const workMinsPerDay = 480; // 8h
    const weekWorkMins = workDays * workMinsPerDay;
    const gainPct = Math.min(99, Math.round((timeSaved / weekWorkMins) * 100 * 10) / 10);

    return {
      weekLabel: weekLabel(wk),
      executions: wkEvents.length,
      timeSavedMinutes: timeSaved,
      issuesDetected: issues,
      fixesApplied: fixes,
      topSkill: topKey(skillCounts),
      topPrompt: topKey(promptCounts),
      productivityGainPct: gainPct,
    };
  });

  return trends;
}

// ─── Skill Analytics ──────────────────────────────────────────────────────────

export function buildSkillAnalytics(events: ExecutionEvent[]): SkillAnalytics[] {
  const skillMap = new Map<string, { execs: number; timeSaved: number; issues: number }>();

  for (const ev of events) {
    for (const skill of ev.skillNames) {
      const existing = skillMap.get(skill) ?? { execs: 0, timeSaved: 0, issues: 0 };
      existing.execs += 1;
      existing.timeSaved += ev.timeSavedMinutes;
      existing.issues += ev.issuesDetected;
      skillMap.set(skill, existing);
    }
  }

  const result: SkillAnalytics[] = [];
  for (const [skillName, { execs, timeSaved, issues }] of skillMap.entries()) {
    result.push({
      skillName,
      executions: execs,
      timeSavedMinutes: timeSaved,
      issuesDetected: issues,
      valueScore: Math.round(timeSaved * 0.5 + issues * 3 + execs * 1),
    });
  }

  return result.sort((a, b) => b.valueScore - a.valueScore);
}

// ─── Productivity Gain ────────────────────────────────────────────────────────

/**
 * Estimates overall productivity gain percentage from first event to now.
 * Formula: (total time saved / total work time in period) * 100
 */
export function computeOverallProductivityGain(data: AnalyticsData): number {
  if (!data.firstEventTimestamp || data.totalExecutions === 0) { return 0; }
  const nowMs = Date.now();
  const daysActive = Math.max(1, Math.round((nowMs - data.firstEventTimestamp) / 86_400_000));
  const totalWorkMins = daysActive * 8 * 60; // 8h workday
  const gain = (data.totalTimeSavedMinutes / totalWorkMins) * 100;
  return Math.min(99, Math.round(gain * 10) / 10);
}

// ─── Full Report ──────────────────────────────────────────────────────────────

// ── Dimension 1: Code Quality ─────────────────────────────────────────────────

export interface CodeQualityMetrics {
  totalIssuesDetected: number;
  totalFixesApplied: number;
  /** fixesApplied / issuesDetected × 100, capped at 100 */
  fixRate: number;
  /** estimated % error reduction vs working without the tool */
  errorReductionPct: number;
  /** issues from high-severity prompts (debug, security, pre-pr) */
  criticalIssuesPrevented: number;
  /** trend: issues detected per execution — lower = improving codebase */
  issuesPerExecution: number;
  qualityScore: number;   // 0-100 composite
}

export function buildCodeQualityMetrics(data: AnalyticsData): CodeQualityMetrics {
  const events = data.events;
  const total = data.totalExecutions || 1;

  const critical = events
    .filter(e => {
      const l = e.promptLabel.toLowerCase();
      return l.includes('debug') || l.includes('security') || l.includes('pre-pr');
    })
    .reduce((s, e) => s + e.issuesDetected, 0);

  const fixRate = data.totalIssuesDetected === 0
    ? 0
    : Math.min(100, Math.round((data.totalFixesApplied / data.totalIssuesDetected) * 100));

  // Error reduction: fix rate contributes 60%, issue volume (capped) contributes 40%
  const volumeFactor = Math.min(40, Math.round((data.totalIssuesDetected / (total * 2)) * 40));
  const errorReductionPct = Math.min(95, Math.round(fixRate * 0.6 + volumeFactor));

  const issuesPerExecution = Math.round((data.totalIssuesDetected / total) * 10) / 10;

  // Quality score: weighted sum
  const qualityScore = Math.min(100, Math.round(
    fixRate * 0.35 +
    errorReductionPct * 0.30 +
    Math.min(30, critical) * 1 +   // up to 30 pts from critical issues caught
    Math.min(5, total) * 1          // up to 5 pts for consistent usage
  ));

  return {
    totalIssuesDetected: data.totalIssuesDetected,
    totalFixesApplied: data.totalFixesApplied,
    fixRate,
    errorReductionPct,
    criticalIssuesPrevented: critical,
    issuesPerExecution,
    qualityScore,
  };
}

// ── Dimension 2: Cognitive Load ───────────────────────────────────────────────

export interface CognitiveLoadMetrics {
  /** total manual steps eliminated (each execution replaces N manual steps) */
  manualStepsEliminated: number;
  /** % reduction in context-switching compared to manual lookup + review cycle */
  contextSwitchReductionPct: number;
  /** workflow executions — each replaces multiple individual tasks */
  workflowAutomations: number;
  /** average decision time saved per session (minutes) */
  avgDecisionTimeSavedMins: number;
  /** unique skills applied — breadth of coverage without manual effort */
  uniqueSkillsApplied: number;
  /** unique prompts used — variety of tasks automated */
  uniquePromptsUsed: number;
  cognitiveLoadScore: number;   // 0-100, higher = more load reduced
}

/** Manual steps replaced per execution mode. */
const MANUAL_STEPS: Record<string, number> = {
  'explain component':    3,   // open docs + read + summarise
  'debug issue':          6,   // reproduce + search + trace + fix + verify + document
  'performance analysis': 5,   // profile + identify + benchmark + research + implement
  'safe refactor':        4,   // plan + rewrite + test + review + document
  'pre-pr review':        7,   // full checklist, style, logic, security, tests, docs, perf
  'workflow':             10,  // combined multi-step — replaces multiple review sessions
  'default':              3,
};

function stepsForEvent(ev: ExecutionEvent): number {
  if (ev.mode === 'workflow') { return MANUAL_STEPS['workflow']; }
  const l = ev.promptLabel.toLowerCase();
  for (const [key, steps] of Object.entries(MANUAL_STEPS)) {
    if (l.includes(key)) { return steps; }
  }
  return MANUAL_STEPS['default'];
}

export function buildCognitiveLoadMetrics(data: AnalyticsData): CognitiveLoadMetrics {
  const events = data.events;
  const total = data.totalExecutions || 1;

  const manualStepsEliminated = events.reduce((s, e) => s + stepsForEvent(e), 0);
  const workflowAutomations = events.filter(e => e.mode === 'workflow').length;
  const uniqueSkills = new Set(events.flatMap(e => e.skillNames)).size;
  const uniquePrompts = new Set(events.map(e => e.promptLabel)).size;

  // Context switch reduction: each execution avoids switching to browser/docs/etc.
  // Estimated 3 context switches per manual step, each ~2 min
  const contextSwitchMins = manualStepsEliminated * 3 * 2;
  const baselineContextMins = total * 15; // ~15 min of context switching per manual session
  const contextSwitchReductionPct = Math.min(95, Math.round(
    (contextSwitchMins / Math.max(contextSwitchMins + baselineContextMins, 1)) * 100
  ));

  const avgDecisionTimeSaved = Math.round((data.totalTimeSavedMinutes / total) * 10) / 10;

  // Cognitive load score: steps + automation + variety
  const cognitiveLoadScore = Math.min(100, Math.round(
    Math.min(40, manualStepsEliminated * 0.5) +   // up to 40 from steps eliminated
    contextSwitchReductionPct * 0.3 +              // up to ~28 from context switch reduction
    Math.min(15, workflowAutomations * 3) +        // up to 15 from workflow use
    Math.min(10, uniqueSkills * 2) +               // up to 10 from skill variety
    Math.min(7, uniquePrompts * 1)                 // up to 7 from prompt variety
  ));

  return {
    manualStepsEliminated,
    contextSwitchReductionPct,
    workflowAutomations,
    avgDecisionTimeSavedMins: avgDecisionTimeSaved,
    uniqueSkillsApplied: uniqueSkills,
    uniquePromptsUsed: uniquePrompts,
    cognitiveLoadScore,
  };
}

// ── Dimension 3: Skill Effectiveness ─────────────────────────────────────────

export interface SkillEffectivenessMetric {
  skillName: string;
  executions: number;
  issuesDetected: number;
  fixesApplied: number;
  timeSavedMinutes: number;
  /** fixesApplied / issuesDetected × 100 */
  accuracy: number;
  /** composite: time×0.4 + issues×2 + fixes×3 + execs×0.5 */
  impactScore: number;
  /** accuracy×0.4 + impactScore×0.6, normalised 0-100 */
  effectivenessScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
}

function effectivenessGrade(score: number): SkillEffectivenessMetric['grade'] {
  if (score >= 80) { return 'S'; }
  if (score >= 65) { return 'A'; }
  if (score >= 50) { return 'B'; }
  if (score >= 30) { return 'C'; }
  return 'D';
}

export function buildSkillEffectivenessMetrics(data: AnalyticsData): SkillEffectivenessMetric[] {
  const events = data.events;
  const skillMap = new Map<string, {
    execs: number; issues: number; fixes: number; time: number;
  }>();

  for (const ev of events) {
    for (const skill of ev.skillNames) {
      const s = skillMap.get(skill) ?? { execs: 0, issues: 0, fixes: 0, time: 0 };
      s.execs += 1;
      s.issues += ev.issuesDetected;
      s.fixes += ev.fixesApplied;
      s.time += ev.timeSavedMinutes;
      skillMap.set(skill, s);
    }
  }

  const rawImpacts: number[] = [];
  const entries: Array<[string, ReturnType<typeof skillMap.get> & object]> = [];

  for (const [name, s] of skillMap.entries()) {
    if (!s) { continue; }
    const impact = s.time * 0.4 + s.issues * 2 + s.fixes * 3 + s.execs * 0.5;
    rawImpacts.push(impact);
    entries.push([name, s]);
  }

  const maxImpact = Math.max(...rawImpacts, 1);

  return entries.map(([skillName, s]) => {
    const accuracy = s.issues === 0 ? 50 : Math.min(100, Math.round((s.fixes / s.issues) * 100));
    const rawImpact = s.time * 0.4 + s.issues * 2 + s.fixes * 3 + s.execs * 0.5;
    const impactScore = Math.round((rawImpact / maxImpact) * 100);
    const effectivenessScore = Math.min(100, Math.round(accuracy * 0.4 + impactScore * 0.6));
    return {
      skillName,
      executions: s.execs,
      issuesDetected: s.issues,
      fixesApplied: s.fixes,
      timeSavedMinutes: s.time,
      accuracy,
      impactScore,
      effectivenessScore,
      grade: effectivenessGrade(effectivenessScore),
    };
  }).sort((a, b) => b.effectivenessScore - a.effectivenessScore);
}

// ── Dimension 4: Combined Impact ──────────────────────────────────────────────

export interface CombinedImpact {
  codeQualityScore: number;          // 0-100
  cognitiveLoadScore: number;        // 0-100
  skillEffectivenessScore: number;   // 0-100 (average of all skills)
  overallEngEffectivenessScore: number; // weighted composite
  productivityGainPct: number;
  /** human-readable verdict */
  verdict: string;
  /** one-line recommendation */
  recommendation: string;
}

export function buildCombinedImpact(
  cq: CodeQualityMetrics,
  cl: CognitiveLoadMetrics,
  se: SkillEffectivenessMetric[],
  overallGainPct: number
): CombinedImpact {
  const avgSkillScore = se.length === 0
    ? 0
    : Math.round(se.reduce((s, x) => s + x.effectivenessScore, 0) / se.length);

  // Weighted composite: Quality 35%, Cognitive 30%, Skill 25%, Gain 10%
  const overall = Math.min(100, Math.round(
    cq.qualityScore * 0.35 +
    cl.cognitiveLoadScore * 0.30 +
    avgSkillScore * 0.25 +
    Math.min(100, overallGainPct * 2) * 0.10
  ));

  let verdict: string;
  let recommendation: string;

  if (overall >= 80) {
    verdict = '🏆 Exceptional Engineering Effectiveness';
    recommendation = 'Outstanding usage pattern. Consider sharing your skill library with your team.';
  } else if (overall >= 65) {
    verdict = '✅ Strong Productivity Improvement';
    recommendation = 'Great results. Add more custom skills to push into the exceptional tier.';
  } else if (overall >= 45) {
    verdict = '⚡ Solid Workflow Enhancement';
    recommendation = 'Good foundation. Try multi-step Workflow mode and fix-oriented prompts to raise your score.';
  } else if (overall >= 25) {
    verdict = '🌱 Early Gains Detected';
    recommendation = 'Growing impact. Use Copilot Toolkit daily and build a skills library for your stack.';
  } else {
    verdict = '🚀 Getting Started';
    recommendation = 'Run more sessions and add skills to .copilot/skills/ to unlock full productivity gains.';
  }

  return {
    codeQualityScore: cq.qualityScore,
    cognitiveLoadScore: cl.cognitiveLoadScore,
    skillEffectivenessScore: avgSkillScore,
    overallEngEffectivenessScore: overall,
    productivityGainPct: overallGainPct,
    verdict,
    recommendation,
  };
}

export interface FullReport {
  today: DailySummary;
  last7Days: DailySummary;
  weeklyTrends: WeeklyTrend[];
  topSkills: SkillAnalytics[];
  overallProductivityGainPct: number;
  totalExecutions: number;
  totalTimeSavedMinutes: number;
  totalIssuesDetected: number;
  totalFixesApplied: number;
  topLanguage: string;
  topPrompt: string;
  // ── New three-dimension fields ──
  codeQuality: CodeQualityMetrics;
  cognitiveLoad: CognitiveLoadMetrics;
  skillEffectiveness: SkillEffectivenessMetric[];
  combinedImpact: CombinedImpact;
}

export function buildFullReport(data: AnalyticsData): FullReport {
  const events = data.events;
  const todayStr = toDateString(Date.now());

  // Last 7 days aggregate
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const last7Events = events.filter(e => e.timestamp >= sevenDaysAgo);
  const last7: DailySummary = {
    date: 'Last 7 days',
    executions: last7Events.length,
    timeSavedMinutes: last7Events.reduce((s, e) => s + e.timeSavedMinutes, 0),
    issuesDetected: last7Events.reduce((s, e) => s + e.issuesDetected, 0),
    fixesApplied: last7Events.reduce((s, e) => s + e.fixesApplied, 0),
    skillsUsed: [...new Set(last7Events.flatMap(e => e.skillNames))],
    promptsUsed: [...new Set(last7Events.map(e => e.promptLabel))],
  };

  const topLanguage = topKey(countBy(events, e => e.languageId));
  const topPromptKey = topKey(countBy(events, e => e.promptLabel));
  const gainPct = computeOverallProductivityGain(data);

  // Three-dimension analytics
  const codeQuality = buildCodeQualityMetrics(data);
  const cognitiveLoad = buildCognitiveLoadMetrics(data);
  const skillEffectiveness = buildSkillEffectivenessMetrics(data);
  const combinedImpact = buildCombinedImpact(codeQuality, cognitiveLoad, skillEffectiveness, gainPct);

  return {
    today: buildDailySummary(events, todayStr),
    last7Days: last7,
    weeklyTrends: buildWeeklyTrends(events),
    topSkills: buildSkillAnalytics(events).slice(0, 8),
    overallProductivityGainPct: gainPct,
    totalExecutions: data.totalExecutions,
    totalTimeSavedMinutes: data.totalTimeSavedMinutes,
    totalIssuesDetected: data.totalIssuesDetected,
    totalFixesApplied: data.totalFixesApplied,
    topLanguage,
    topPrompt: topPromptKey,
    codeQuality,
    cognitiveLoad,
    skillEffectiveness,
    combinedImpact,
  };
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export async function resetAnalytics(state: vscode.Memento): Promise<void> {
  await state.update(ANALYTICS_KEY, undefined);
}
