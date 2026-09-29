import * as vscode from 'vscode';
import {
  FullReport, WeeklyTrend, SkillAnalytics, DailySummary,
  CodeQualityMetrics, CognitiveLoadMetrics,
  SkillEffectivenessMetric, CombinedImpact,
} from './analytics';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(mins: number): string {
  if (mins < 60) { return `${mins}m`; }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function pctBar(pct: number, color = 'var(--accent)'): string {
  const w = Math.min(100, Math.max(0, pct));
  return `<div class="pct-bar-wrap"><div class="pct-bar-fill" style="width:${w}%;background:${color}"></div></div>`;
}

function scoreRing(score: number, color: string, label: string): string {
  const r = 32, cx = 40, cy = 40, stroke = 7;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return `<div class="ring-wrap" title="${label}: ${score}/100"><svg width="80" height="80" viewBox="0 0 80 80"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${stroke}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(circ/4).toFixed(1)}" stroke-linecap="round"/><text x="${cx}" y="${cy+5}" text-anchor="middle" fill="${color}" font-size="14" font-weight="700">${score}</text></svg><div class="ring-label">${label}</div></div>`;
}

function gradeChip(grade: string): string {
  const colors: Record<string,string> = { S:'#4ade80', A:'#a78bfa', B:'#60a5fa', C:'#facc15', D:'#f87171' };
  const c = colors[grade] ?? '#94a3b8';
  return `<span class="grade-chip" style="background:${c}20;color:${c};border-color:${c}50">${grade}</span>`;
}

// ─── Sub-sections HTML ────────────────────────────────────────────────────────

function renderStat(icon: string, label: string, value: string, sub?: string, color = 'var(--accent2)'): string {
  return `
    <div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-label">${label}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
}

// ─── Combined Impact ──────────────────────────────────────────────────────────

function renderCombinedImpact(ci: CombinedImpact): string {
  const oc = ci.overallEngEffectivenessScore >= 80 ? '#4ade80'
    : ci.overallEngEffectivenessScore >= 65 ? '#a78bfa'
    : ci.overallEngEffectivenessScore >= 45 ? '#60a5fa'
    : ci.overallEngEffectivenessScore >= 25 ? '#facc15' : '#94a3b8';
  return `
  <section class="card impact-banner">
    <div class="impact-left">
      <div class="impact-verdict">${ci.verdict}</div>
      <div class="impact-rec">${ci.recommendation}</div>
      <div class="impact-rings">
        ${scoreRing(ci.codeQualityScore,       '#4ade80', 'Code Quality')}
        ${scoreRing(ci.cognitiveLoadScore,      '#60a5fa', 'Cognitive Load')}
        ${scoreRing(ci.skillEffectivenessScore, '#a78bfa', 'Skill Effectiveness')}
        ${scoreRing(ci.productivityGainPct,     '#facc15', 'Productivity Gain')}
      </div>
    </div>
    <div class="impact-right">
      <div class="oes-label">Estimated Engineering Effectiveness</div>
      <div class="oes-score" style="color:${oc}">${ci.overallEngEffectivenessScore}<span class="oes-max">/100</span></div>
      ${pctBar(ci.overallEngEffectivenessScore, oc)}
      <div class="oes-formula">Code Quality 35% · Cognitive Load 30% · Skill Effectiveness 25% · Gain 10%</div>
    </div>
  </section>`;
}

// ─── Code Quality ─────────────────────────────────────────────────────────────

function renderCodeQuality(cq: CodeQualityMetrics): string {
  const fc = cq.fixRate >= 70 ? '#4ade80' : cq.fixRate >= 40 ? '#facc15' : '#f87171';
  return `
  <section class="card">
    <h2>✅ Estimated Code Quality Signals</h2>
    <p class="sub-hint">These values are heuristic estimates derived from prompt usage. They are not measured defects, prevented incidents, or validated fixes.</p>
    <div class="stats-row">
      ${renderStat('🐛', 'Estimated Findings',          `${cq.totalIssuesDetected}`,    'across all sessions',        '#f87171')}
      ${renderStat('🔧', 'Fix-Oriented Runs',             `${cq.totalFixesApplied}`,      'by fix-oriented prompts',    '#4ade80')}
      ${renderStat('🎯', 'Estimated Fix Ratio',                  `${cq.fixRate}%`,              'fixes ÷ issues',             fc)}
      ${renderStat('🚨', 'High-Risk Review Signals', `${cq.criticalIssuesPrevented}`,'debug / security / pre-PR', '#f97316')}
    </div>
    <div class="metric-row">
      <div class="metric-item">
        <span class="metric-name">Estimated Quality Impact</span>
        <span class="metric-val">${cq.errorReductionPct}%</span>
        ${pctBar(cq.errorReductionPct, '#4ade80')}
        <span class="metric-hint">heuristic estimate; not measured defect reduction</span>
      </div>
      <div class="metric-item">
        <span class="metric-name">Estimated Fix Ratio</span>
        <span class="metric-val">${cq.fixRate}%</span>
        ${pctBar(cq.fixRate, fc)}
        <span class="metric-hint">fix-oriented runs ÷ estimated findings</span>
      </div>
      <div class="metric-item">
        <span class="metric-name">Estimated Quality Score</span>
        <span class="metric-val">${cq.qualityScore} / 100</span>
        ${pctBar(cq.qualityScore, '#4ade80')}
        <span class="metric-hint">heuristic composite; use observed execution/fix tracking for factual outcomes</span>
      </div>
    </div>
    <p class="metric-footnote">Issues per execution: <strong>${cq.issuesPerExecution}</strong> — a declining value over time indicates an improving codebase.</p>
  </section>`;
}

// ─── Cognitive Load ───────────────────────────────────────────────────────────

function renderCognitiveLoad(cl: CognitiveLoadMetrics): string {
  const rep = Math.min(95, Math.round(cl.manualStepsEliminated * 2.5));
  return `
  <section class="card">
    <h2>🧠 Cognitive Load Reduction</h2>
    <div class="stats-row">
      ${renderStat('🪜', 'Manual Steps Eliminated', `${cl.manualStepsEliminated}`,   'context lookups, reviews, traces',    '#60a5fa')}
      ${renderStat('🔄', 'Workflow Automations',     `${cl.workflowAutomations}`,     'multi-step sessions run',             '#a78bfa')}
      ${renderStat('⏱', 'Avg Decision Time Saved',  `${cl.avgDecisionTimeSavedMins}m`,'per session',                        '#4ade80')}
      ${renderStat('🎛', 'Unique Skills Applied',    `${cl.uniqueSkillsApplied}`,     `${cl.uniquePromptsUsed} unique prompts`,'#facc15')}
    </div>
    <div class="metric-row">
      <div class="metric-item">
        <span class="metric-name">Context Switch Reduction</span>
        <span class="metric-val">${cl.contextSwitchReductionPct}%</span>
        ${pctBar(cl.contextSwitchReductionPct, '#60a5fa')}
        <span class="metric-hint">fewer browser / docs / Slack interruptions</span>
      </div>
      <div class="metric-item">
        <span class="metric-name">Repetition Reduction</span>
        <span class="metric-val">${rep}%</span>
        ${pctBar(rep, '#60a5fa')}
        <span class="metric-hint">manual steps avoided via prompt automation</span>
      </div>
      <div class="metric-item">
        <span class="metric-name">Cognitive Load Score</span>
        <span class="metric-val">${cl.cognitiveLoadScore} / 100</span>
        ${pctBar(cl.cognitiveLoadScore, '#60a5fa')}
        <span class="metric-hint">composite: steps + context switches + workflow + variety</span>
      </div>
    </div>
  </section>`;
}

// ─── Skill Effectiveness ──────────────────────────────────────────────────────

function renderSkillEffectiveness(skills: SkillEffectivenessMetric[]): string {
  if (skills.length === 0) {
    return `<section class="card"><h2>🎯 Skill Effectiveness</h2><p class="empty">No skill data yet. Add <code>.md</code> files to <code>.copilot/skills/</code> and run Copilot Toolkit.</p></section>`;
  }
  const rows = skills.map(s => `
    <tr>
      <td>${gradeChip(s.grade)}</td>
      <td class="skill-name">${s.skillName}</td>
      <td>${s.executions}×</td>
      <td>${s.issuesDetected}</td>
      <td>${s.fixesApplied}</td>
      <td>${fmtTime(s.timeSavedMinutes)}</td>
      <td><div class="ibar-row"><span>${s.accuracy}%</span><div class="ibar"><div class="ibar-fill" style="width:${s.accuracy}%;background:#4ade80"></div></div></div></td>
      <td><div class="ibar-row"><span>${s.effectivenessScore}</span><div class="ibar"><div class="ibar-fill" style="width:${s.effectivenessScore}%;background:#a78bfa"></div></div></div></td>
    </tr>`).join('');
  return `
  <section class="card">
    <h2>🎯 Skill Effectiveness</h2>
    <p class="sub-hint">Accuracy = fixes ÷ issues &nbsp;·&nbsp; Effectiveness = accuracy×40% + impact×60% &nbsp;·&nbsp; S≥80 &nbsp;A≥65 &nbsp;B≥50 &nbsp;C≥30 &nbsp;D&lt;30</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Grade</th><th>Skill</th><th>Uses</th><th>Issues</th><th>Fixes</th><th>Time Saved</th><th>Accuracy</th><th>Effectiveness</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderDaySummary(s: DailySummary, title: string): string {
  return `
  <section class="card">
    <h2>${title}</h2>
    <div class="stats-row">
      ${renderStat('⚡', 'Actions Performed', `${s.executions}`)}
      ${renderStat('⏱', 'Time Saved', fmtTime(s.timeSavedMinutes))}
      ${renderStat('🐛', 'Estimated Findings', `${s.issuesDetected}`)}
      ${renderStat('🔧', 'Fix-Oriented Runs', `${s.fixesApplied}`)}
    </div>
    ${s.skillsUsed.length ? `<p class="tag-row">Skills used: ${s.skillsUsed.map(s => `<span class="tag">${s}</span>`).join('')}</p>` : ''}
    ${s.promptsUsed.length ? `<p class="tag-row">Prompts used: ${s.promptsUsed.map(p => `<span class="tag prompt-tag">${p.replace(/^[⚡📂]\s[\w-]+:\s/, '')}</span>`).join('')}</p>` : ''}
  </section>`;
}

function renderWeeklyTrends(trends: WeeklyTrend[]): string {
  if (trends.length === 0) {
    return `<section class="card"><h2>📈 Weekly Trends</h2><p class="empty">No weekly data yet.</p></section>`;
  }
  const maxTime = Math.max(...trends.map(t => t.timeSavedMinutes), 1);
  const rows = trends.slice(-8).map(t => {
    const bw = Math.round((t.timeSavedMinutes / maxTime) * 80);
    return `<tr>
      <td class="week-label">${t.weekLabel}</td>
      <td>${t.executions}</td>
      <td>${fmtTime(t.timeSavedMinutes)}<div class="bar-wrap"><div class="bar-fill" style="width:${bw}px"></div></div></td>
      <td>${t.issuesDetected}</td><td>${t.fixesApplied}</td>
      <td><span class="tag">${t.topSkill}</span></td>
      <td class="gain ${t.productivityGainPct >= 5 ? 'gain-high' : 'gain-low'}">${t.productivityGainPct}%</td>
    </tr>`;
  }).join('');
  return `
  <section class="card">
    <h2>📈 Weekly Trends</h2>
    <table>
      <thead><tr><th>Week</th><th>Actions</th><th>Time Saved</th><th>Issues</th><th>Fixes</th><th>Top Skill</th><th>Gain %</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}
function renderInsights(report: FullReport): string {
  const items: string[] = [];
  const ci = report.combinedImpact;
  items.push(`🏆 <strong>${ci.verdict}</strong> — ${ci.recommendation}`);
  if (report.totalTimeSavedMinutes >= 15) {
    items.push(`⏱ Saved <strong>${fmtTime(report.totalTimeSavedMinutes)}</strong> of manual work across <strong>${report.totalExecutions}</strong> sessions.`);
  }
  const cq = report.codeQuality;
  if (cq.criticalIssuesPrevented > 0) {
    items.push(`🚨 Prevented <strong>${cq.criticalIssuesPrevented} critical issues</strong> via debug, security, and pre-PR review prompts.`);
  }
  const cl = report.cognitiveLoad;
  if (cl.manualStepsEliminated > 0) {
    items.push(`🧠 Eliminated <strong>${cl.manualStepsEliminated} manual steps</strong> — reduced context-switching by ~<strong>${cl.contextSwitchReductionPct}%</strong>.`);
  }
  const topSkill = report.skillEffectiveness[0];
  if (topSkill) {
    items.push(`🎯 Top skill <strong>${topSkill.skillName}</strong> — Grade <strong>${topSkill.grade}</strong>, ${topSkill.effectivenessScore}/100 effectiveness, ${fmtTime(topSkill.timeSavedMinutes)} saved.`);
  }
  const trends = report.weeklyTrends;
  if (trends.length >= 2) {
    const delta = trends[trends.length - 1].timeSavedMinutes - trends[trends.length - 2].timeSavedMinutes;
    if (delta > 0) {
      items.push(`📈 Time saved this week is up <strong>${fmtTime(Math.abs(delta))}</strong> from last week — great momentum!`);
    } else if (delta < 0) {
      items.push(`📉 Time saved dipped <strong>${fmtTime(Math.abs(delta))}</strong> this week. Try adding skills to <code>.copilot/skills/</code>.`);
    }
  }
  if (report.totalExecutions === 0) {
    items.push('🚀 No sessions yet — open any file, press <strong>Ctrl+Shift+P</strong> → <strong>Copilot Toolkit</strong> to start tracking.');
  }
  return `
  <section class="card">
    <h2>💡 Insights &amp; Recommendations</h2>
    <ul class="insights-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
  </section>`;
}

// ─── Full HTML Page ───────────────────────────────────────────────────────────

export function buildDashboardHtml(report: FullReport, nonce: string): string {
  const allTimeEmpty = report.totalExecutions === 0;
  const todayEmpty   = report.today.executions === 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Copilot Toolkit — Analytics</title>
  <style nonce="${nonce}">
    :root{--bg:#0f0f17;--card:#1a1a2e;--border:#2a2a45;--accent:#7c3aed;--accent2:#a78bfa;
      --text:#e2e8f0;--muted:#7c8aa0;--green:#4ade80;--blue:#60a5fa;--yellow:#facc15;--red:#f87171;--orange:#f97316}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      font-size:13px;padding:24px;max-width:1020px;margin:0 auto}
    h1{font-size:21px;font-weight:700;color:var(--accent2);margin-bottom:3px}
    h2{font-size:10px;font-weight:700;color:var(--accent2);margin-bottom:14px;text-transform:uppercase;letter-spacing:.09em}
    .subtitle{color:var(--muted);font-size:12px;margin-bottom:22px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px}
    /* Impact banner */
    .impact-banner{display:flex;gap:32px;align-items:flex-start;background:linear-gradient(135deg,#13113b,#1e1040);border-color:#3b2d7a}
    .impact-left{flex:1}.impact-verdict{font-size:16px;font-weight:700;color:var(--accent2);margin-bottom:6px}
    .impact-rec{font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.6}
    .impact-rings{display:flex;gap:12px;flex-wrap:wrap}
    .ring-wrap{display:flex;flex-direction:column;align-items:center;gap:4px}
    .ring-label{font-size:10px;color:var(--muted);text-align:center;max-width:72px;line-height:1.3}
    .impact-right{min-width:200px;text-align:center;padding-top:8px}
    .oes-label{font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em}
    .oes-score{font-size:52px;font-weight:800;line-height:1}.oes-max{font-size:18px;color:var(--muted);vertical-align:middle}
    .oes-formula{font-size:10px;color:var(--muted);margin-top:8px;line-height:1.6}
    /* Stat cards */
    .stats-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
    .stat-card{flex:1;min-width:110px;background:rgba(124,58,237,.07);border:1px solid var(--border);border-radius:8px;padding:13px;text-align:center}
    .stat-icon{font-size:18px;margin-bottom:5px}.stat-value{font-size:19px;font-weight:700}
    .stat-label{font-size:10px;color:var(--muted);margin-top:3px;text-transform:uppercase;letter-spacing:.05em}
    .stat-sub{font-size:10px;color:var(--muted);margin-top:2px}
    /* Pct bars */
    .pct-bar-wrap{height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;margin:3px 0}
    .pct-bar-fill{height:5px;border-radius:3px}
    /* Metric rows */
    .metric-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:10px}
    .metric-item{display:flex;flex-direction:column;gap:4px}
    .metric-name{font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
    .metric-val{font-size:17px;font-weight:700}.metric-hint{font-size:10px;color:var(--muted)}
    .metric-footnote{font-size:11px;color:var(--muted);margin-top:6px}
    /* Tables */
    .table-scroll{overflow-x:auto}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;padding:7px 10px;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border)}
    td{padding:8px 10px;border-bottom:1px solid rgba(42,42,69,.5);vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .skill-name{font-weight:600;color:var(--accent2)}
    .week-label{color:var(--muted);font-size:11px;white-space:nowrap}
    .bar-wrap{height:3px;background:var(--border);border-radius:2px;margin-top:4px;width:80px;overflow:hidden}
    .bar-fill{height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px}
    .gain{font-weight:700}.gain-high{color:var(--green)}.gain-low{color:var(--yellow)}
    /* Inline bars */
    .ibar-row{display:flex;align-items:center;gap:6px}
    .ibar{width:56px;height:4px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;flex-shrink:0}
    .ibar-fill{height:4px;border-radius:2px}
    /* Grade chips */
    .grade-chip{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;border:1px solid}
    /* Tags */
    .tag-row{margin-top:10px;font-size:11px;color:var(--muted)}
    .tag{display:inline-block;background:rgba(124,58,237,.18);border:1px solid #4c1d95;color:var(--accent2);border-radius:4px;padding:2px 7px;margin:2px 3px;font-size:10px}
    .prompt-tag{background:rgba(99,102,241,.15);border-color:#4338ca;color:#a5b4fc}
    /* Insights */
    .insights-list{list-style:none;display:flex;flex-direction:column;gap:8px}
    .insights-list li{padding:9px 13px;background:rgba(124,58,237,.07);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;font-size:12px;line-height:1.6}
    .insights-list li strong{color:var(--accent2)}
    /* Misc */
    .sub-hint{font-size:10px;color:var(--muted);margin-bottom:12px}
    .empty{color:var(--muted);font-size:12px;font-style:italic}
    code{background:rgba(255,255,255,.07);padding:1px 5px;border-radius:3px;font-size:11px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:720px){.impact-banner,.two-col,.metric-row{display:block}.impact-right{text-align:left;margin-top:16px}.stats-row{flex-direction:column}}
  </style>
</head>
<body>
  <h1>⚡ Copilot Toolkit — Engineering Analytics</h1>
  <p class="subtitle">Generated ${new Date().toLocaleString()} &nbsp;·&nbsp; ${report.totalExecutions} execution${report.totalExecutions !== 1 ? 's' : ''} &nbsp;·&nbsp; ${fmtTime(report.totalTimeSavedMinutes)} total saved</p>

  ${renderCombinedImpact(report.combinedImpact)}
  ${renderInsights(report)}
  ${renderCodeQuality(report.codeQuality)}
  ${renderCognitiveLoad(report.cognitiveLoad)}
  ${renderSkillEffectiveness(report.skillEffectiveness)}

  <div class="two-col">
    ${renderDaySummary(report.today, `📅 Today — ${report.today.date}${todayEmpty ? ' (no activity yet)' : ''}`)}
    ${renderDaySummary(report.last7Days, '📆 Last 7 Days')}
  </div>

  ${renderWeeklyTrends(report.weeklyTrends)}

  ${allTimeEmpty ? `
  <section class="card">
    <h2>🚀 Getting Started</h2>
    <p style="color:var(--muted);line-height:1.9">
      No sessions recorded yet.<br>
      1. Press <strong>F5</strong> in this workspace to open the Extension Development Host<br>
      2. Open any source file in that window<br>
      3. Press <kbd>Ctrl+Shift+P</kbd> → <strong>Copilot Toolkit</strong><br>
      4. Run any prompt — your stats appear here automatically.
    </p>
  </section>` : ''}
</body>
</html>`;
}
// ─── Panel manager ────────────────────────────────────────────────────────────

let panelInstance: vscode.WebviewPanel | undefined;

export function showAnalyticsDashboard(report: FullReport, context: vscode.ExtensionContext): void {
  if (panelInstance) {
    panelInstance.reveal(vscode.ViewColumn.One);
    panelInstance.webview.html = buildDashboardHtml(report, getNonce());
    return;
  }

  panelInstance = vscode.window.createWebviewPanel(
    'copilotToolkitAnalytics',
    '⚡ Copilot Toolkit Analytics',
    vscode.ViewColumn.One,
    { enableScripts: false, retainContextWhenHidden: true }
  );

  panelInstance.webview.html = buildDashboardHtml(report, getNonce());
  panelInstance.onDidDispose(() => { panelInstance = undefined; }, null, context.subscriptions);
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
