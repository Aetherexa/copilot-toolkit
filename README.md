# 🧠 Copilot Toolkit — AI-Powered Developer Productivity Intelligence

[![CI](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/codeql.yml/badge.svg)](https://github.com/Aetherexa/copilot-toolkit/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Stop guessing. Start measuring.**
> The only AI code assistant that tracks what actually happened — not just what it suggested.

---

## Overview

**Copilot Toolkit** is a VS Code extension that supercharges your AI-assisted development workflow with intelligent code analysis, one-click fix application, and a real-time productivity intelligence engine.

Unlike traditional AI tools that simply generate suggestions and move on, Copilot Toolkit **closes the loop** — it tracks whether fixes were adopted, validates that they worked, and turns every coding session into measurable productivity data.

**Built for:**
- Individual developers who want to understand and improve their own workflow
- Engineering teams who need evidence-based productivity metrics
- Tech leads and managers who want real data on AI tool effectiveness

---

## The Problem

Modern developers work with AI assistants every day — but the data story is incomplete:

- 🤷 **Did the suggestion actually help?** No one tracks it.
- ⏱️ **How much time did AI save today?** Nobody knows.
- 📉 **Are code quality metrics improving?** Hard to say.
- 🔁 **What patterns are slowing the team down?** Invisible.
- 🧠 **Is cognitive burden getting better or worse?** Unmeasured.

Current tools offer suggestions. They don't offer **proof**.

---

## The Solution

Copilot Toolkit turns your AI assistant into a **productivity intelligence platform**:

1. It **suggests** targeted, context-aware code fixes
2. It **tracks** exactly what you do with each suggestion — apply, edit, or ignore
3. It **detects** code patterns before and after changes using a diff engine
4. It **validates** that fixes actually took effect in the file
5. It **measures** impact across four engineering dimensions
6. It **surfaces** insights through a live analytics dashboard

The result: **real productivity data**, grounded in actual developer behavior — not assumptions.

---

## ✨ Key Features

### 🔍 Intelligent Code Analysis
Automatically scans your active file for code quality patterns — null safety gaps, missing error handling, async/await issues, security anti-patterns, and more. Surfaces targeted fix suggestions with full context.

### ⚡ One-Click Fix Application
Apply any suggested fix directly to your code with a single click. The extension replaces your selected range, updates the diff engine snapshot, and begins validation — all in under a second.

### 📊 Real-Time Productivity Insights Dashboard
A live WebView panel showing your personal productivity metrics:
- **Skill Score** (0–10, graded S / A / B / C / D)
- Fix Adoption Rate with inline progress bars
- Fix Success Rate (validated fixes vs. applied)
- Estimated time saved this session
- Issues detected and patterns found
- Score formula breakdown by component

### 📈 Four-Dimension Analytics Engine
Deep-dive productivity analysis across:

| Dimension | What It Measures |
|-----------|-----------------|
| **Code Quality** | Fix rate, error reduction %, critical issues prevented, quality score /100 |
| **Cognitive Load** | Manual steps eliminated, context switch reduction, repetition reduction |
| **Skill Effectiveness** | Per-skill accuracy, impact score, individual grade S–D |
| **Combined Impact** | Overall engineering effectiveness /100, verdict, and recommendation |

### 🔄 Behavior Tracking Engine
Every interaction is captured and persisted across sessions:

| Event | Triggered When |
|-------|---------------|
| `fix_suggested` | A fix is presented to you |
| `fix_applied` | You click Apply |
| `fix_rejected` | You click Ignore |
| `fix_validated` | The fix is confirmed effective by diff analysis |
| `feedback` | You rate a suggestion 👍 or 👎 |
| `edit_detected` | A file change is detected (debounced 1.5 s) |
| `pattern_detected` | A new code pattern is identified post-edit |

### 🧮 Composite Skill Scoring
A weighted formula turns your behavior into an actionable score:

```
Score (0–10) =
  Fix Adoption Rate  × 0.4
  Fix Success Rate   × 0.3
  Feedback Score     × 0.2
  Usage Volume       × 0.1
```

| Score | Grade | Label |
|-------|-------|-------|
| 9.0–10.0 | S | Exceptional |
| 7.0–8.9  | A | Strong |
| 5.0–6.9  | B | Good |
| 3.0–4.9  | C | Developing |
| 0.0–2.9  | D | Early Stage |

### 🤖 Adaptive Skill Recommendations
The extension learns which skills and prompts you use most, boosts them in future recommendations, and surfaces your top skill combinations — so the tool gets smarter the more you use it.

### 🔁 Multi-Step Workflow Automation
Chain multiple prompts into structured review workflows — run a security audit, then a performance check, then a test coverage review — all in one session with analytics tracked per step.

### 📚 Custom Prompt and Skill Libraries
Drop Markdown files into `.copilot/prompts/` and `.copilot/skills/` to build a team-wide library of review prompts and coding standards. Everything is version-controllable and shareable across your entire team.

---

## How It Works

```
1.  You write or select code in VS Code
          |
2.  Copilot Toolkit auto-detects your project stack and active code patterns
          |
3.  Smart recommendations surface:
    "Use Recommended Skills"  or  "Customize Manually"
          |
4.  You pick a prompt — single review or multi-step workflow
          |
5.  A structured prompt is assembled:
    [Context Header] + [Skill Instructions] + [Task] + [Your Code]
          |
6.  Copilot Chat opens with the full, enriched prompt
          |
7.  A Fix Suggestion panel is presented:
    Side-by-side diff (original vs. suggested)
    ✅ Apply Fix   ❌ Ignore   👍 Helpful   👎 Not Helpful
          |
8.  Your action is logged (applied / rejected / feedback)
          |
9.  Edit Tracker watches for the change to land in the file (debounced)
          |
10. Diff Engine compares snapshots — confirms adoption, detects patterns
          |
11. Metrics Engine computes adoption rate, success rate, time saved
          |
12. Scoring Engine produces your composite Skill Score (0–10)
          |
13. Insights Dashboard and Analytics Dashboard update in real time
```

---

## 📊 Productivity and Impact Metrics

### Time Saved
Every applied fix is estimated to save **~8 minutes** of manual debugging, research, and re-writing — measured against actual applied-fix counts, not hypothetical usage.

### Fix Adoption Rate
`fixes applied ÷ fixes suggested`

Are AI suggestions being used, or ignored? This rate shows you directly — and improves over time as the engine adapts to your preferences.

### Fix Success Rate
`fixes validated ÷ fixes applied`

Not just applied — actually confirmed to work. The diff engine validates that the fix persisted and introduced expected code patterns.

### Code Quality Score (/100)
Tracks error reduction percentage, critical issues prevented, and the ratio of quality-improving changes to total edits.

### Cognitive Load Reduction
Measures the volume of manual steps eliminated, context switches reduced, and repetitive patterns removed — translating AI assistance into concrete mental overhead savings.

### Skill Effectiveness Grade
Each skill type (security, performance, accessibility, etc.) is graded individually based on accuracy and impact, so you know which review types deliver the most value.

---

## 🏆 What Makes This Unique

| Feature | Copilot Toolkit | Typical AI Assistants |
|--------|----------------|----------------------|
| Tracks fix adoption | ✅ Yes | ❌ No |
| Validates fixes worked | ✅ Yes | ❌ No |
| Measures time saved | ✅ Behavior-based | ⚠️ Assumed |
| Feedback loop per suggestion | ✅ Yes | ❌ No |
| Code diff pattern detection | ✅ Yes | ❌ No |
| Composite skill scoring | ✅ Yes | ❌ No |
| Multi-dimension analytics | ✅ Yes | ❌ No |
| Learns from your usage | ✅ Adaptive | ❌ Static |
| Custom skill and prompt library | ✅ Yes | ❌ No |
| Persists data across sessions | ✅ Yes | ❌ No |

---

## 📋 Example Insights

After a typical week of use, your **Productivity Insights Dashboard** might show:

```
┌──────────────────────────────────────────────────────┐
│  🧠 Skill Score         8.4 / 10   Grade: A — Strong  │
├──────────────────────────────────────────────────────┤
│  🎯 Fix Adoption Rate   82%    (41 of 50 fixes)       │
│  ✅ Fix Success Rate    90%    (37 validated)          │
│  ⏱️  Time Saved         328 min  (~5.5 hours)          │
│  🔍 Issues Detected     50      12 patterns found     │
│  💬 Feedback Score      88%    (22/25 positive)       │
│  ✏️  Edits Tracked       147     document changes      │
└──────────────────────────────────────────────────────┘
```

And the **Four-Dimension Analytics Report**:

```
Combined Engineering Effectiveness:  87 / 100

  Code Quality Score     84 / 100
  Cognitive Load Score   79 / 100
  Skill Effectiveness    91 / 100
  Productivity Gain      +34%

Verdict:        Strong adoption with measurable quality lift.
Recommendation: Focus on error-handling skill to push
                Code Quality score past 90.
```

---

## 👨‍💻 Developer Benefits

- **Know your own impact** — see exactly how many hours of manual work AI saved you this week
- **Learn faster** — the scoring system shows which habits drive the best results
- **No workflow disruption** — the tracker runs silently in the background; you code as normal
- **Customise everything** — bring your own skill files, prompts, and review standards
- **Carry knowledge forward** — skill data and event history persist across VS Code restarts
- **Right-click to review** — select any code block and trigger a fix review from the context menu

---

## 🏢 Team and Leadership Benefits

- **Evidence-based ROI** — demonstrate AI tool value with real adoption rates and time-saving data
- **Identify bottlenecks** — which code patterns keep reappearing? Where is AI least effective?
- **Track improvement over time** — weekly trends show whether code quality is genuinely improving
- **Enforce consistent standards** — shared `.copilot/skills/` and `.copilot/prompts/` enforce team-wide review quality
- **Grade individual skill areas** — understand whether security, performance, or accessibility reviews deliver the highest impact
- **Data for retrospectives** — bring concrete numbers to sprint reviews and engineering health checks

---

## 🚀 Getting Started

### 1. Install

Search for **"Copilot Toolkit"** in the VS Code Extensions Marketplace, or install from a `.vsix` file manually:

---

## Copilot Toolkit 2.0 Sprint 1

Sprint 1 introduces a persistent **AI Workflow Studio** while preserving the current QuickPick-first workflow, analytics, fix suggestion, and prompt/skill loading behavior.

### New command

- `Copilot Toolkit: Open AI Workflow Studio`

### Architecture

```text
Extension Host
  -> Domain Services
  -> Context Engine
  -> Provider Layer
  -> React Workflow Studio
```

### Developer workflow

1. `npm install`
2. `npm run compile`
3. Press `F5` to open an Extension Development Host.

The build now compiles both the extension host and the React/Vite webview into `media/studio`.

### Sprint 1 supported Studio context

- Current File
- Selected Code

Other Context Builder items are visible as planned placeholders and are documented in [docs/workflow-studio-sprint1.md](docs/workflow-studio-sprint1.md).

```
Extensions panel  (Ctrl+Shift+X)
  → ⋯  (More Actions)
  → Install from VSIX
  → select copilot-toolkit-x.x.x.vsix
```

> **Requirements:** VS Code 1.90 or later · GitHub Copilot with Chat enabled

---

### 2. Open the Main Workflow

- Press `Ctrl+Shift+P` → **Copilot Toolkit**
- Or right-click any open editor → **Copilot Toolkit**

The tool auto-detects your project type and suggests the most relevant skills automatically.

---

### 3. Suggest and Apply a Fix

1. Select a code block in any file
2. Right-click → **Copilot Toolkit: Suggest Fix for Selection**
3. Paste the improved version and give it a short title
4. The **Fix Suggestion Panel** opens with:
   - Side-by-side original vs. fixed diff
   - **✅ Apply Fix** — applies directly to your file and logs the event
   - **❌ Ignore** — logs the rejection and closes the panel
   - **👍 Helpful / 👎 Not Helpful** — rates suggestion quality for the scoring engine

---

### 4. View Productivity Insights

```
Ctrl+Shift+P  →  Copilot Toolkit: Show Productivity Insights
```

See your live skill score ring (0–10), fix rate progress bars, time saved, and score formula breakdown.

---

### 5. View the Analytics Dashboard

```
Ctrl+Shift+P  →  Copilot Toolkit: Show Productivity Analytics
```

Four-dimension deep report: Code Quality, Cognitive Load, Skill Effectiveness, and Combined Impact.

---

### 6. Add Custom Skills and Prompts

```
your-project/
├── .github/
│   └── copilot-instructions.md      ← default skill context
└── .copilot/
    ├── skills/
    │   ├── security.md
    │   ├── performance.md
    │   └── accessibility.md
    └── prompts/
        ├── api-review.md
        └── test-coverage-check.md
```

Each file's content is injected into the structured prompt sent to Copilot Chat.  
Files are version-controllable and shareable across the entire team.

---

## 🏗️ Architecture Highlights

Copilot Toolkit is built on a **modular, event-driven, metrics-based architecture**:

```
┌────────────────────────────────────────────────────┐
│                   extension.ts                      │
│  Command registry · Edit tracker · State management │
└──────┬──────────────────────┬───────────────────────┘
       │                      │
┌──────▼───────┐    ┌─────────▼────────┐
│   UI Layer   │    │  Service Layer   │
│              │    │                  │
│ fixSuggestion│    │ editTracker.ts   │
│ dashboard    │    │ diffEngine.ts    │
│ analyticsPanel    │ logger.ts        │
└──────────────┘    │ metricsEngine.ts │
                    │ scoringEngine.ts │
                    └─────────┬────────┘
                              │
                    ┌─────────▼────────┐
                    │   Data Layer     │
                    │                  │
                    │  analytics.ts    │
                    │  globalState     │
                    │  (persisted)     │
                    └──────────────────┘
```

| Module | Responsibility |
|--------|---------------|
| `editTracker.ts` | Debounced file change detection, pattern scan trigger |
| `diffEngine.ts` | Snapshot store, 9 regex code-pattern detectors |
| `logger.ts` | Event capture, session and globalState persistence |
| `metricsEngine.ts` | Fix adoption, success rate, feedback score, time saved |
| `scoringEngine.ts` | Weighted composite skill score 0–10, grade classification |
| `analytics.ts` | Four-dimension deep analytics, weekly trends, daily summaries |
| `applyFix.ts` | Fix application, snapshot capture, post-apply validation |
| `fixSuggestion.ts` | Fix Suggestion WebView — diff view, apply/ignore, feedback |
| `dashboard.ts` | Productivity Insights WebView — live score and metrics |
| `analyticsPanel.ts` | Analytics Dashboard WebView — 4-dimension deep report |

---

## 🗺️ Roadmap

| Feature | Status |
|---------|--------|
| AI code analysis and fix suggestions | ✅ Complete |
| Fix Suggestion UI (apply / ignore / feedback) | ✅ Complete |
| Edit tracker and diff engine | ✅ Complete |
| Metrics engine (adoption, success, time saved) | ✅ Complete |
| Composite skill scoring (0–10, S–D) | ✅ Complete |
| Productivity Insights Dashboard | ✅ Complete |
| Four-dimension Analytics Dashboard | ✅ Complete |
| Adaptive learning engine | ✅ Complete |
| Multi-step workflow automation | ✅ Complete |
| Custom skill and prompt libraries | ✅ Complete |
| Team-level aggregated metrics | 🔜 Planned |
| Git integration (per-commit analysis) | 🔜 Planned |
| CI/CD quality gate metrics export | 🔜 Planned |
| LLM model comparison analytics | 🔜 Planned |
| Shared team skill leaderboard | 🔜 Planned |

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `Copilot Toolkit` | Open the main workflow — skill pick, prompt pick, or multi-step workflow |
| `Copilot Toolkit: Suggest Fix for Selection` | Fix Suggestion panel for selected code — diff, apply/ignore, feedback |
| `Copilot Toolkit: Apply Suggested Fix` | Apply a queued fix to the current selection, or paste one manually |
| `Copilot Toolkit: Show Productivity Insights` | Live insights — skill score, fix rates, time saved, metric bars |
| `Copilot Toolkit: Show Productivity Analytics` | Four-dimension deep analytics report |
| `Copilot Toolkit: Reset Learned Preferences` | Clear adaptive skill learning history |
| `Copilot Toolkit: Reset Analytics Data` | Wipe all analytics history |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotToolkit.promptFolder` | `.copilot/prompts` | Folder containing custom prompt `.md` files |
| `copilotToolkit.skillFile` | `.github/copilot-instructions.md` | Default skill and instructions file |
| `copilotToolkit.skillsFolder` | `.copilot/skills` | Folder containing selectable skill `.md` files |
| `copilotToolkit.enableLearning` | `true` | Enable adaptive skill recommendation learning |

---

## 🧪 Development & Quality Gates

The repository uses automated checks on every pull request and supported branch push.

### Local validation

```bash
npm ci
npm run compile
npm test
npm run test:coverage
npx @vscode/vsce package --no-dependencies
```

The CI pipeline currently verifies:

- Extension TypeScript compilation
- React webview TypeScript checking and Vite build
- Unit tests on Node.js 20 and 22
- Native Node test coverage reporting
- Critical dependency vulnerability audit
- VSIX packaging
- CodeQL JavaScript/TypeScript security and quality analysis
- Dependabot updates for npm packages and GitHub Actions

CI also uploads the generated VSIX as a short-lived workflow artifact so pull requests can be smoke-tested before merge.

### Releases

GitHub releases are created from semantic version tags.

1. Update `package.json` to the intended version.
2. Merge the validated change to `main`.
3. Create and push the matching tag, for example `v1.2.5`.
4. The Release workflow rebuilds, tests, packages the VSIX, generates a SHA-256 checksum, and publishes both files to the GitHub Release.

The release workflow rejects a tag when it does not match the version in `package.json`.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

## 🎯 Final Word

Most developer tools tell you what to do.  
**Copilot Toolkit tells you what is actually working.**

It is not just an AI assistant — it is a **productivity intelligence platform** that grows smarter with every session, surfaces evidence your team can act on, and transforms the invisible work of software engineering into clear, measurable impact.

> *Write better code. Know your impact. Ship with confidence.*
