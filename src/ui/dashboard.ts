/** * Productivity Insights Dashboard - WebView panel
 *
 * Displays: Fix Adoption %, Fix Success %, Time Saved, Issues Detected,
 * Skill Score (0-10), Pattern Breakdown, and recent event log.
 * Uses data from metricsEngine + scoringEngine.
 */
import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { getSessionEvents, loadPersistedEvents, clearPersistedEvents } from '../services/logger';
import { computeMetrics, fmtPct, fmtTime, ProductivityMetrics } from '../services/metricsEngine';
import { computeSkillScore, SkillScoreResult } from '../services/scoringEngine';

// ─── Panel singleton ──────────────────────────────────────────────────────────

let _panel: vscode.WebviewPanel | undefined;

// ─── Public entry point ───────────────────────────────────────────────────────

export function showInsightsDashboard(
  context: vscode.ExtensionContext,
): void {
  if (_panel) {
    _panel.reveal(vscode.ViewColumn.Beside);
    _refreshPanel(context);
    return;
  }

  _panel = vscode.window.createWebviewPanel(
    'copilotToolkitInsights',
    '🧠 Copilot Toolkit — Productivity Insights',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  _panel.onDidDispose(() => { _panel = undefined; }, null, context.subscriptions);

  _panel.webview.onDidReceiveMessage(async msg => {
    if (msg.command === 'refresh') {
      _refreshPanel(context);
    } else if (msg.command === 'resetInsights') {
      const confirm = await vscode.window.showWarningMessage(
        'Reset all Copilot Toolkit productivity event data? This cannot be undone.',
        { modal: true },
        'Reset',
      );
      if (confirm === 'Reset') {
        await clearPersistedEvents(context.globalState);
        _refreshPanel(context);
        vscode.window.showInformationMessage('Copilot Toolkit: Productivity data has been reset.');
      }
    }
  }, null, context.subscriptions);

  _refreshPanel(context);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _refreshPanel(context: vscode.ExtensionContext): void {
  if (!_panel) { return; }

  const persisted = loadPersistedEvents(context.globalState);
  const session   = [...getSessionEvents()];

  // Merge: persisted + session (deduplicate by id)
  const seen = new Set<string>();
  const all  = [...persisted, ...session].filter(e => {
    if (seen.has(e.id)) { return false; }
    seen.add(e.id);
    return true;
  });

  const metrics = computeMetrics(all);
  const score   = computeSkillScore(metrics);

  _panel.webview.html = _buildHtml(metrics, score);
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function _buildHtml(m: ProductivityMetrics, s: SkillScoreResult): string {
  const nonce = randomBytes(18).toString('base64url');
  const gradeColor: Record<string, string> = {
    S: '#a6e3a1', A: '#89dceb', B: '#cba6f7', C: '#f9e2af', D: '#f38ba8',
  };
  const gc = gradeColor[s.grade] ?? '#cdd6f4';

  // Score ring SVG
  const pct     = Math.round((s.score / 10) * 100);
  const radius  = 44;
  const circ    = Math.round(2 * Math.PI * radius);
  const dash    = Math.round((pct / 100) * circ);

  function bar(value: number, max = 100, color = '#cba6f7'): string {
    const w = Math.min(100, Math.round((value / max) * 100));
    return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
  }

  function statCard(icon: string, label: string, value: string, sub = ''): string {
    return `
      <div class="stat-card">
        <div class="stat-icon">${icon}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
        ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
      </div>`;
  }

  const hasData = m.fixesSuggested > 0 || m.editsTracked > 0 || m.patternsDetected > 0;

  const zeroState = `
    <div class="zero-state">
      <div class="zero-icon">🚀</div>
      <h2>No data yet</h2>
      <p>Use <strong>Copilot Toolkit</strong> to review and fix code.<br>
      Each fix suggestion, application, and feedback event will appear here.</p>
    </div>`;

  const mainContent = `
    <!-- Score ring + grade -->
    <div class="score-section">
      <svg class="ring" viewBox="0 0 100 100" width="120" height="120">
        <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#313244" stroke-width="10"/>
        <circle cx="50" cy="50" r="${radius}" fill="none"
          stroke="${gc}" stroke-width="10"
          stroke-dasharray="${dash} ${circ}"
          stroke-dashoffset="${Math.round(circ * 0.25)}"
          stroke-linecap="round"/>
        <text x="50" y="47" text-anchor="middle" fill="${gc}"
          font-size="18" font-weight="bold" font-family="monospace">${s.score.toFixed(1)}</text>
        <text x="50" y="62" text-anchor="middle" fill="#a6adc8"
          font-size="9" font-family="sans-serif">/ 10</text>
      </svg>
      <div class="score-info">
        <div class="grade-chip" style="background:${gc};color:#1e1e2e">
          Grade ${s.grade} — ${s.label}
        </div>
        <p class="score-desc">Composite skill score based on fix adoption,<br>success rate, feedback, and usage volume.</p>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="cards-grid">
      ${statCard('🎯', 'Fix Adoption', fmtPct(m.fixAdoptionRate), `${m.fixesApplied} of ${m.fixesSuggested} fixes`)}
      ${statCard('✅', 'Fix Success Rate', fmtPct(m.fixSuccessRate), `${m.fixesValidated} validated`)}
      ${statCard('⏱️', 'Time Saved', fmtTime(m.estimatedTimeSavedMinutes), `≈8 min per applied fix`)}
      ${statCard('🔍', 'Issues Detected', String(m.fixesSuggested), `${m.patternsDetected} patterns found`)}
      ${statCard('💬', 'Feedback Score', fmtPct(m.feedbackScore), `${m.positiveFeedback}/${m.totalFeedback} positive`)}
      ${statCard('✏️', 'Edits Tracked', String(m.editsTracked), `document changes`)}
    </div>

    <!-- Metric bars -->
    <div class="section">
      <h3 class="section-title">📊 Metric Breakdown</h3>
      <div class="metric-row">
        <span class="metric-label">Fix Adoption Rate</span>
        ${bar(m.fixAdoptionRate * 100, 100, '#cba6f7')}
        <span class="metric-val">${fmtPct(m.fixAdoptionRate)}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Fix Success Rate</span>
        ${bar(m.fixSuccessRate * 100, 100, '#89dceb')}
        <span class="metric-val">${fmtPct(m.fixSuccessRate)}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Feedback Score</span>
        ${bar(m.feedbackScore * 100, 100, '#a6e3a1')}
        <span class="metric-val">${fmtPct(m.feedbackScore)}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Usage Volume</span>
        ${bar(Math.min(100, (m.fixesSuggested + m.editsTracked + m.patternsDetected) / 50 * 100), 100, '#f9e2af')}
        <span class="metric-val">${m.fixesSuggested + m.editsTracked + m.patternsDetected} events</span>
      </div>
    </div>

    <!-- Score breakdown -->
    <div class="section">
      <h3 class="section-title">🧮 Score Breakdown</h3>
      <div class="breakdown-grid">
        <div class="breakdown-item">
          <div class="bd-label">Adoption (×0.4)</div>
          <div class="bd-val">${(s.breakdown.adoptionContrib * 10).toFixed(2)}</div>
        </div>
        <div class="breakdown-item">
          <div class="bd-label">Success (×0.3)</div>
          <div class="bd-val">${(s.breakdown.successContrib * 10).toFixed(2)}</div>
        </div>
        <div class="breakdown-item">
          <div class="bd-label">Feedback (×0.2)</div>
          <div class="bd-val">${(s.breakdown.feedbackContrib * 10).toFixed(2)}</div>
        </div>
        <div class="breakdown-item">
          <div class="bd-label">Usage (×0.1)</div>
          <div class="bd-val">${(s.breakdown.usageContrib * 10).toFixed(2)}</div>
        </div>
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Productivity Insights</title>
<style nonce="${nonce}">
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:       #1e1e2e;
    --surface:  #181825;
    --card:     #313244;
    --border:   #45475a;
    --text:     #cdd6f4;
    --subtext:  #a6adc8;
    --accent:   #cba6f7;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    padding: 24px;
    line-height: 1.5;
  }
  h1 { font-size: 1.35rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
  .subtitle { color: var(--subtext); font-size: 0.85rem; margin-bottom: 24px; }

  /* toolbar */
  .toolbar { display: flex; gap: 10px; margin-bottom: 28px; }
  button {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 16px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.15s;
  }
  button:hover { background: var(--border); }
  button.danger { border-color: #f38ba8; color: #f38ba8; }
  button.danger:hover { background: #3d1a1a; }

  /* score ring section */
  .score-section {
    display: flex;
    align-items: center;
    gap: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 24px;
  }
  .ring { flex-shrink: 0; }
  .grade-chip {
    display: inline-block;
    padding: 4px 14px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 0.9rem;
    margin-bottom: 8px;
  }
  .score-desc { color: var(--subtext); font-size: 0.82rem; }

  /* stat cards */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    text-align: center;
  }
  .stat-icon { font-size: 1.5rem; margin-bottom: 6px; }
  .stat-value { font-size: 1.6rem; font-weight: 700; color: var(--accent); }
  .stat-label { font-size: 0.8rem; color: var(--subtext); margin-top: 2px; }
  .stat-sub { font-size: 0.72rem; color: var(--border); margin-top: 3px; }

  /* sections */
  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 20px;
  }
  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 16px;
  }

  /* metric bars */
  .metric-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .metric-label { width: 160px; font-size: 0.82rem; color: var(--subtext); flex-shrink: 0; }
  .metric-val   { width: 56px;  font-size: 0.82rem; text-align: right; flex-shrink: 0; }
  .bar-track {
    flex: 1;
    height: 8px;
    background: var(--card);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }

  /* breakdown grid */
  .breakdown-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .breakdown-item {
    background: var(--card);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }
  .bd-label { font-size: 0.75rem; color: var(--subtext); margin-bottom: 6px; }
  .bd-val   { font-size: 1.3rem; font-weight: 700; color: var(--accent); }

  /* zero state */
  .zero-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--subtext);
  }
  .zero-icon { font-size: 3.5rem; margin-bottom: 16px; }
  .zero-state h2 { color: var(--text); margin-bottom: 12px; }
  .zero-state p  { font-size: 0.9rem; line-height: 1.7; }
</style>
</head>
<body>
  <h1>🧠 Productivity Insights</h1>
  <p class="subtitle">Real-time fix tracking, scoring, and skill effectiveness — Copilot Toolkit</p>
  <div class="toolbar">
    <button id="refresh">🔄 Refresh</button>
    <button id="resetInsights" class="danger">🗑 Reset Data</button>
  </div>
  ${hasData ? mainContent : zeroState}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refresh')?.addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    document.getElementById('resetInsights')?.addEventListener('click', () => vscode.postMessage({ command: 'resetInsights' }));
  </script>
</body>
</html>`;

  // Note: `hasData` is captured in the closure above
  function hasData_placeholder() { return hasData; }
  void hasData_placeholder;
}
