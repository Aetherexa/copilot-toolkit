import * as path from 'path';
import * as vscode from 'vscode';
import { Workflow, WorkflowExportPayload, WorkflowRepositorySnapshot, WorkflowStep } from '../domain/workflow';

const WORKFLOWS_KEY = 'copilotToolkit.workflows';

function timestamp(): number {
  return Date.now();
}

function createId(prefix: string): string {
  return `${prefix}-${timestamp()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    id: step.id || createId('workflow-step'),
    name: step.name || 'Workflow Step',
    enabled: step.enabled !== false,
    continueOnFailure: Boolean(step.continueOnFailure),
    inputFromPreviousStep: Boolean(step.inputFromPreviousStep),
    contextBindings: step.contextBindings?.map(binding => ({
      ...binding,
      options: binding.options ? { ...binding.options } : undefined,
    })) ?? [],
  };
}

function normalizeWorkflow(workflow: Workflow): Workflow {
  const now = timestamp();
  return {
    ...workflow,
    id: workflow.id || createId('workflow'),
    name: workflow.name || 'Untitled Workflow',
    description: workflow.description ?? '',
    steps: (workflow.steps ?? []).map(normalizeStep),
    createdAt: workflow.createdAt || now,
    updatedAt: now,
  };
}

function createSeedWorkflow(): Workflow {
  const now = timestamp();
  return {
    id: 'workflow-pr-preparation',
    name: 'PR Preparation',
    description: 'Review changes, assess architecture, generate tests, then draft a PR summary.',
    createdAt: now,
    updatedAt: now,
    steps: [
      { id: 'wf-step-review', name: 'Review Changes', enabled: true, promptId: 'studio-react-pr-review' },
      { id: 'wf-step-tests', name: 'Generate Tests', enabled: true, inlinePrompt: 'Generate focused regression and coverage tests for the reviewed changes.', inputFromPreviousStep: true },
      { id: 'wf-step-final', name: 'Final Review', enabled: true, inlinePrompt: 'Summarize the most important issues, recommendations, and readiness concerns.', inputFromPreviousStep: true },
      { id: 'wf-step-pr', name: 'PR Description', enabled: true, inlinePrompt: 'Draft a concise pull request description with summary, testing, and risks.', inputFromPreviousStep: true },
    ],
  };
}

function createDebugWorkflow(): Workflow {
  const now = timestamp();
  return {
    id: 'workflow-debug',
    name: 'Debug',
    description: 'Analyze, identify root cause, propose a fix, and recommend validation tests.',
    createdAt: now,
    updatedAt: now,
    steps: [
      { id: 'wf-step-analyze', name: 'Analyze', enabled: true, inlinePrompt: 'Analyze the provided code and context. Identify symptoms, likely defects, and uncertainty.' },
      { id: 'wf-step-root', name: 'Root Cause', enabled: true, inlinePrompt: 'Use the previous analysis to determine the most likely root cause.', inputFromPreviousStep: true },
      { id: 'wf-step-fix', name: 'Fix Recommendation', enabled: true, inlinePrompt: 'Recommend the safest code fix with rationale.', inputFromPreviousStep: true },
      { id: 'wf-step-test', name: 'Test Recommendation', enabled: true, inlinePrompt: 'Recommend targeted tests to validate the fix and prevent regressions.', inputFromPreviousStep: true },
    ],
  };
}

function createRefactorWorkflow(): Workflow {
  const now = timestamp();
  return {
    id: 'workflow-refactor',
    name: 'Refactor',
    description: 'Analyze the current design, review architecture constraints, plan the refactor, and review the result.',
    createdAt: now,
    updatedAt: now,
    steps: [
      { id: 'wf-step-analyze-refactor', name: 'Analyze', enabled: true, inlinePrompt: 'Analyze the current code structure and identify maintainability issues.' },
      { id: 'wf-step-arch-review', name: 'Architecture Review', enabled: true, inlinePrompt: 'Review the architectural impact and constraints of the proposed changes.', inputFromPreviousStep: true },
      { id: 'wf-step-plan', name: 'Refactor Plan', enabled: true, inlinePrompt: 'Create a staged refactor plan that preserves behavior.', inputFromPreviousStep: true },
      { id: 'wf-step-review-refactor', name: 'Review', enabled: true, inlinePrompt: 'Review the refactor plan for risk, scope, and validation needs.', inputFromPreviousStep: true },
    ],
  };
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'copilot-toolkit-workflow';
}

function validateWorkflow(payload: unknown): payload is Workflow {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as Partial<Workflow>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.steps);
}

export class WorkflowRepository {
  constructor(private readonly state: vscode.Memento) {}

  async loadSnapshot(): Promise<WorkflowRepositorySnapshot> {
    const stored = this.state.get<Workflow[]>(WORKFLOWS_KEY, []);
    const workflows = stored.length > 0
      ? stored.map(normalizeWorkflow)
      : [createSeedWorkflow(), createDebugWorkflow(), createRefactorWorkflow()].map(normalizeWorkflow);
    return { workflows };
  }

  async createWorkflow(name = 'Untitled Workflow'): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const workflow = normalizeWorkflow({
      id: createId('workflow'),
      name,
      description: '',
      steps: [{ id: createId('workflow-step'), name: 'Step 1', enabled: true }],
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    const snapshot = await this.loadSnapshot();
    snapshot.workflows.unshift(workflow);
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow };
  }

  async saveWorkflow(workflow: Workflow): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const snapshot = await this.loadSnapshot();
    const normalized = normalizeWorkflow(workflow);
    const index = snapshot.workflows.findIndex(item => item.id === normalized.id);
    if (index >= 0) {
      snapshot.workflows[index] = normalized;
    } else {
      snapshot.workflows.unshift(normalized);
    }
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow: normalized };
  }

  async deleteWorkflow(workflowId: string): Promise<WorkflowRepositorySnapshot> {
    const snapshot = await this.loadSnapshot();
    snapshot.workflows = snapshot.workflows.filter(workflow => workflow.id !== workflowId);
    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  async duplicateWorkflow(workflowId: string): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const snapshot = await this.loadSnapshot();
    const source = snapshot.workflows.find(workflow => workflow.id === workflowId);
    if (!source) {
      throw new Error('Workflow not found.');
    }
    const duplicate = normalizeWorkflow({
      ...source,
      id: createId('workflow'),
      name: `${source.name} Copy`,
      steps: source.steps.map(step => ({ ...step, id: createId('workflow-step') })),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    snapshot.workflows.unshift(duplicate);
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow: duplicate };
  }

  async importFromJson(): Promise<{ snapshot: WorkflowRepositorySnapshot; workflow: Workflow }> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: 'Import Copilot Toolkit Workflow JSON',
    });
    if (!picked || picked.length === 0) {
      throw new Error('Import cancelled.');
    }

    const raw = await vscode.workspace.fs.readFile(picked[0]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(raw).toString('utf8')) as unknown;
    } catch {
      throw new Error('Selected file is not valid JSON.');
    }

    const payload = parsed as Partial<WorkflowExportPayload>;
    if (payload.schemaVersion !== 1 || payload.kind !== 'workflow' || !validateWorkflow(payload.workflow)) {
      throw new Error('Workflow export is malformed.');
    }

    const imported = normalizeWorkflow({
      ...payload.workflow,
      id: createId('workflow'),
      name: payload.workflow.name,
      steps: payload.workflow.steps.map(step => ({ ...step, id: createId('workflow-step') })),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    const snapshot = await this.loadSnapshot();
    if (snapshot.workflows.some(workflow => workflow.name === imported.name)) {
      imported.name = `${imported.name} Imported`;
    }
    snapshot.workflows.unshift(imported);
    await this.saveSnapshot(snapshot);
    return { snapshot, workflow: imported };
  }

  async exportWorkflow(workflowId: string): Promise<string> {
    const snapshot = await this.loadSnapshot();
    const workflow = snapshot.workflows.find(item => item.id === workflowId);
    if (!workflow) {
      throw new Error('Workflow not found.');
    }

    const target = await vscode.window.showSaveDialog({
      saveLabel: 'Export Copilot Toolkit Workflow JSON',
      defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(), `${sanitizeFileName(workflow.name)}.json`)),
      filters: { JSON: ['json'] },
    });
    if (!target) {
      throw new Error('Export cancelled.');
    }

    const payload: WorkflowExportPayload = {
      schemaVersion: 1,
      kind: 'workflow',
      workflow,
    };
    await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
    return target.fsPath;
  }

  private async saveSnapshot(snapshot: WorkflowRepositorySnapshot): Promise<void> {
    await this.state.update(WORKFLOWS_KEY, snapshot.workflows);
  }
}